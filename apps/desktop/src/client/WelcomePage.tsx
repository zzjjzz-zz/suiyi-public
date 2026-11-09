/** Desktop welcome presentation; account and credential operations stay in the preload. */
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives/src/Toast.tsx'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives/src/StateDot.tsx'
import type { AccountView } from '@deepseek-ai/dsh-deepseek-account/types'
import type { OfficialWelcomeApi, SuiyiLoginApi, SuiyiLoginFailure, SuiyiLoginView, SuiyiReturnApi, WelcomeApi } from '../welcome-api.ts'

type Page = 'entry' | 'key' | 'account'
type Messages = WelcomeApi['messages']
type CopyState = 'idle' | 'busy' | 'copied' | 'failed'

/** Stroke icons reuse the prototype's 24-unit path set; every one sits beside visible copy. */
function Icon({ path }: { path: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={path} /></svg>
}

function ShieldIcon() {
  return <Icon path="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Zm-4 9 3 3 5-5" />
}

function LockIcon() {
  return <Icon path="M6 10V7a6 6 0 0 1 12 0v3M4 10h16v12H4zM12 15v3" />
}

function CheckIcon() {
  return <Icon path="m5 12 4 4L19 6" />
}

function ExternalIcon() {
  return <Icon path="M14 3h7v7M10 14 21 3M10 3H3v18h18v-7" />
}

function RefreshIcon() {
  return <Icon path="M20 7V2M20 7h-5M4 17v5M4 17h5M20 7a8.5 8.5 0 0 0-15 0M4 17a8.5 8.5 0 0 0 15 0" />
}

function ConnectionIcon() {
  return <Icon path="M3 8a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0M9 16a4 4 0 0 1 6 0M12 20h.01" />
}

function InfoIcon() {
  return <Icon path="M12 16v-4M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0" />
}

/** Classified failure copy for the Suiyi login card. */
function suiyiFailureText(messages: Messages, failure: SuiyiLoginFailure): string {
  switch (failure) {
    case 'unreachable': return messages.suiyiLoginFailureUnreachable
    case 'configuration': return messages.suiyiLoginFailureConfiguration
    case 'cancelled': return messages.suiyiLoginFailureCancelled
    case 'timeout': return messages.suiyiLoginFailureTimeout
    case 'rejected': return messages.suiyiLoginFailureRejected
    case 'unknown': return messages.suiyiLoginFailureUnknown
  }
}

/**
 * Render the standalone welcome flow using shell-owned operations and localized copy.
 * A Suiyi Keycloak login face selects the identity-center page; otherwise the official account
 * and API-key pages remain. Clearing the account attempt returns the sign-in status page to the
 * initial choices.
 * @param props.api - isolated preload API; no account credentials reach the renderer.
 * @returns welcome pages with fixed bottom actions.
 */
export function Welcome({ api }: { api: WelcomeApi }) {
  const { suiyi } = api
  useEffect(() => {
    document.documentElement.lang = api.id
    document.title = suiyi === undefined ? api.messages.welcomeTitle : api.messages.suiyiLoginDocumentTitle
  }, [api, suiyi])
  if (api.suiyi === undefined) return <AccountWelcome api={api} />
  return <SuiyiLogin messages={api.messages} login={api.suiyi} />
}

/**
 * Suiyi identity-center login page: entry, browser authorization, classified failure, and the
 * hand-off to the workspace. The shell owns the Keycloak transport; this page only requests an
 * attempt and renders the pushed state.
 * @param props.messages - shell-owned localized copy.
 * @param props.login - Keycloak attempt operations and presentation-state subscription.
 * @returns the two-column login page, stacked on narrow windows.
 */
function SuiyiLogin({ messages: m, login }: { messages: Messages; login: SuiyiLoginApi | SuiyiReturnApi }) {
  const flow = 'onState' in login ? login : undefined
  const revisit = 'returnToWorkspace' in login ? login : undefined
  const [returnFailed, setReturnFailed] = useState(false)
  const [view, setView] = useState<SuiyiLoginView>({ phase: 'ready' })
  const [pending, setPending] = useState(false)
  const [copy, setCopy] = useState<CopyState>('idle')
  const startButton = useRef<HTMLButtonElement>(null)
  const retryButton = useRef<HTMLButtonElement>(null)
  // Initial focus would paint a focus ring for pointer users; keep it for phase changes only.
  const focusSettled = useRef(false)

  useEffect(() => {
    let active = true
    if (flow === undefined) return
    const stop = flow.onState((next) => {
      if (!active) return
      setView(next)
      setPending(false)
      setCopy('idle')
    })
    return () => { active = false; stop() }
  }, [flow])

  useEffect(() => {
    if (!focusSettled.current) {
      focusSettled.current = true
      return
    }
    if (view.phase === 'ready') startButton.current?.focus()
    else if (view.phase === 'error') retryButton.current?.focus()
  }, [view.phase])

  useEffect(() => {
    if (copy !== 'copied' && copy !== 'failed') return
    const timer = setTimeout(() => { setCopy('idle') }, 2000)
    return () => { clearTimeout(timer) }
  }, [copy])

  async function start(): Promise<void> {
    if (pending || flow === undefined) return
    setPending(true)
    setCopy('idle')
    try {
      await flow.start()
    } catch {
      setView({ phase: 'error', failure: 'unknown' })
    } finally {
      setPending(false)
    }
  }
  async function cancel(): Promise<void> {
    if (pending || flow === undefined) return
    setPending(true)
    try {
      await flow.cancel()
    } catch {
      // A refused cancellation keeps the active attempt visible so Cancel can be retried.
    } finally {
      setPending(false)
    }
  }
  async function copyLink(): Promise<void> {
    if (flow === undefined || view.phase !== 'working' || view.authorizeUrl === undefined || copy === 'busy' || copy === 'copied') return
    setCopy('busy')
    try {
      await flow.copyLink()
      setCopy('copied')
    } catch {
      setCopy('failed')
    }
  }

  async function returnToWorkspace(): Promise<void> {
    if (pending || revisit === undefined) return
    setPending(true)
    setReturnFailed(false)
    try { await revisit.returnToWorkspace() }
    catch { setReturnFailed(true) }
    finally { setPending(false) }
  }

  const busy = pending || view.phase === 'working'
  const copyLabel = copy === 'copied' ? m.suiyiLoginCopied
    : copy === 'failed' ? m.suiyiLoginCopyFailed : m.suiyiLoginCopyLink

  return <>
    <div className="sy-login">
      <div className="sy-ambient" aria-hidden="true">
        <div className="sy-ambient-field">
          <div className="sy-halo-cloud" />
          <div className="sy-halo-ribbon" />
          <div className="sy-halo-ribbon sy-halo-ribbon--far" />
        </div>
        <div className="sy-halo-veil" />
      </div>
      <div className="titlebar" aria-hidden="true" />
      <div className="sy-login-body">
        <main className="sy-auth" aria-labelledby="suiyi-login-title">
          <section className="sy-auth-story">
            <div className="sy-brand">
              <img src="assets/suiyi-mark.svg" alt="" width="43" height="43" />
              <strong>{m.suiyiLoginBrand}</strong>
            </div>
            <h1 id="suiyi-login-title">{m.suiyiLoginTitle}</h1>
            <p>{m.suiyiLoginDescription}</p>
            <div className="sy-orbit-scene" aria-hidden="true">
              <img src="assets/suiyi-mark.svg" alt="" width="145" height="145" />
            </div>
            <div className="sy-auth-proof">
              <span><ShieldIcon />{m.suiyiLoginProofBrowser}</span>
              <span><LockIcon />{m.suiyiLoginProofToken}</span>
              <span><CheckIcon />{m.suiyiLoginProofData}</span>
            </div>
          </section>
          <section className="sy-auth-card" aria-live="polite" aria-busy={busy} aria-labelledby="suiyi-card-title">
            {revisit !== undefined && <>
              <h2 id="suiyi-card-title">{m.suiyiWelcomeTitle}</h2>
              <p>{m.suiyiWelcomeDescription}</p>
              <div className="sy-idp"><span className="sy-idp-symbol"><ShieldIcon /></span>
                <div><strong>{m.suiyiLoginProvider}</strong><small>{m.suiyiLoginSuccessTitle}</small></div>
              </div>
              <button id="suiyi-return" className="sy-btn primary wide" type="button" disabled={pending}
                onClick={() => { void returnToWorkspace() }}>{m.suiyiWelcomeReturn}</button>
              {returnFailed && <p role="alert" className="sy-auth-error">{m.suiyiWelcomeReturnError}</p>}
            </>}
            {revisit === undefined && view.phase === 'ready' && <>
              <h2 id="suiyi-card-title">{m.suiyiLoginCardTitle}</h2>
              <p>{m.suiyiLoginCardDescription}</p>
              <div className="sy-auth-tabs">
                <span className="sy-auth-tab" aria-current="true">{m.suiyiLoginMethod}</span>
              </div>
              <div className="sy-idp">
                <span className="sy-idp-symbol"><ShieldIcon /></span>
                <div><strong>{m.suiyiLoginProvider}</strong><small>{m.suiyiLoginProviderHint}</small></div>
              </div>
              <button ref={startButton} id="suiyi-start" className="sy-btn primary wide" type="button"
                disabled={pending} onClick={() => { void start() }}><LockIcon />{m.suiyiLoginStart}</button>
              <div className="sy-note"><ShieldIcon /><span>{m.suiyiLoginNote}</span></div>
            </>}
            {view.phase === 'working' && <div className="sy-auth-state">
              <div className="sy-state-icon"><span className="sy-spinner" aria-hidden="true" /></div>
              <h2 id="suiyi-card-title">{m.suiyiLoginWaitingTitle}</h2>
              <p>{m.suiyiLoginWaitingDescription}</p>
              <ol className="sy-auth-flow">
                <li><CheckIcon />{m.suiyiLoginStepBrowser}</li>
                <li><ExternalIcon />{m.suiyiLoginStepAwait}</li>
                <li><LockIcon />{m.suiyiLoginStepEnter}</li>
              </ol>
              <div className="sy-row">
                <button id="suiyi-copy" className="sy-btn" type="button"
                  disabled={view.authorizeUrl === undefined || copy === 'busy' || copy === 'copied'}
                  onClick={() => { void copyLink() }}>{copyLabel}</button>
                <button id="suiyi-cancel" className="sy-btn ghost" type="button"
                  disabled={pending} onClick={() => { void cancel() }}>{m.suiyiLoginCancel}</button>
              </div>
            </div>}
            {view.phase === 'error' && <div className="sy-auth-state">
              <div className="sy-state-icon error"><ConnectionIcon /></div>
              <h2 id="suiyi-card-title">{m.suiyiLoginFailedTitle}</h2>
              <p>{m.suiyiLoginFailedDescription}</p>
              <p id="suiyi-error" className="sy-auth-error" role="alert">{suiyiFailureText(m, view.failure ?? 'unknown')}</p>
              <div className="sy-note warning"><InfoIcon /><span>{m.suiyiLoginRetryNote}</span></div>
              <div className="sy-row sy-auth-actions">
                <button id="suiyi-back" className="sy-btn wide" type="button"
                  onClick={() => { setView({ phase: 'ready' }) }}>{m.suiyiLoginBack}</button>
                <button ref={retryButton} id="suiyi-retry" className="sy-btn primary wide" type="button"
                  disabled={pending} onClick={() => { void start() }}><RefreshIcon />{m.suiyiLoginRetry}</button>
              </div>
            </div>}
            {view.phase === 'success' && <div className="sy-auth-state">
              <div className="sy-state-icon"><CheckIcon /></div>
              <h2 id="suiyi-card-title">{m.suiyiLoginSuccessTitle}</h2>
              <p>{m.suiyiLoginSuccessDescription}</p>
              <span className="sy-spinner sy-auth-handoff" aria-hidden="true" />
            </div>}
          </section>
        </main>
      </div>
    </div>
  </>
}

/**
 * Official welcome pages: entry choices, the one-time API-key form, and the account status page.
 * @param props.api - localized copy and shell operations of the official welcome window.
 * @returns the fixed-size welcome layout.
 */
function AccountWelcome({ api }: { api: OfficialWelcomeApi }) {
  const { messages: m } = api
  const [expiryNotice, setExpiryNotice] = useState(false)
  const [page, setPage] = useState<Page>('entry')
  const pageRef = useRef<Page>('entry')
  const visiblePage = useRef<Page>('entry')
  const [attempt, setAttempt] = useState<AccountView['attempt']>(null)
  const attemptRef = useRef<AccountView['attempt']>(null)
  const [starting, setStarting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<{ status: CopyState }>({ status: 'idle' })
  const copyState = copyFeedback.status
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const mounted = useRef(true)
  const revision = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const keyButton = useRef<HTMLButtonElement>(null)
  const focusEntry = useRef(false)

  function navigate(next: Page) {
    pageRef.current = next
    setPage(next)
  }
  function showAccount(state: AccountView) {
    if (pageRef.current === 'key' || (state.attempt === null && pageRef.current === 'entry')) return
    attemptRef.current = state.attempt
    setAttempt(state.attempt)
    setStarting(false)
    setCopyFeedback({ status: 'idle' })
    navigate(state.attempt === null || state.attempt.phase === 'cancelled' ? 'entry' : 'account')
  }

  useEffect(() => {
    mounted.current = true
    const takeNotice = (): void => {
      void api.takeNotice().then((notice) => {
        if (mounted.current && notice === 'session-expired') setExpiryNotice(true)
      }).catch((_closedChannel: unknown) => {
        // A closed Welcome IPC channel must not interrupt the sign-in page.
      })
    }
    takeNotice()
    const stop = api.onAccountState((state) => {
      revision.current++
      takeNotice()
      showAccount(state)
    })
    return () => { mounted.current = false; stop() }
  }, [api])

  useEffect(() => {
    if (page === 'entry' && visiblePage.current !== 'entry') void api.analytics?.('auth_page_view', {})
    visiblePage.current = page
    if (page === 'key') input.current?.focus()
    else if (page === 'entry' && focusEntry.current) {
      focusEntry.current = false
      keyButton.current?.focus()
    }
  }, [page, api])

  useEffect(() => {
    if (copyState !== 'copied' && copyState !== 'failed') return
    const timer = setTimeout(() => { setCopyFeedback({ status: 'idle' }) }, 2000)
    return () => { clearTimeout(timer) }
  }, [copyFeedback])

  async function saveKey(event: FormEvent) {
    event.preventDefault()
    if (busyRef.current) return
    void api.analytics?.('api_key_save_click', {})
    const value = draft.trim()
    if (!/^[\x21-\x7e]+$/.test(value) || /^[A-Z][A-Z0-9_]*=[^=]/.test(value)
      || ((value.startsWith('"') || value.startsWith("'") || value.charCodeAt(0) === 96) && value.at(-1) === value[0])) {
      setError(value === '' ? m.welcomeKeyBlank : m.welcomeKeyInvalid)
      input.current?.focus()
      return
    }
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const result = await api.saveApiKey(value)
      if (!mounted.current) return
      if (result.ok) setDraft('')
      else setError(m.welcomeKeyFailed)
    } catch {
      if (mounted.current) setError(m.welcomeKeyFailed)
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }
  async function skip() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await api.skip()
      if (mounted.current) setDraft('')
    } catch {
      if (mounted.current) setError(m.welcomeContinueFailed)
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }
  async function start() {
    navigate('account')
    setStarting(true)
    setAttempt(null)
    attemptRef.current = null
    const current = ++revision.current
    try {
      const state = await api.startSignIn()
      if (mounted.current && revision.current === current) showAccount(state)
    } catch {
      if (mounted.current && revision.current === current) setStarting(false)
    }
  }
  async function cancel() {
    if (cancelling || attemptRef.current === null) return
    setCancelling(true)
    const current = ++revision.current
    try {
      const state = await api.cancelSignIn(attemptRef.current.id)
      if (mounted.current && revision.current === current) showAccount(state)
    } catch {
      // The current attempt remains visible so cancellation can be retried.
    } finally {
      if (mounted.current) setCancelling(false)
    }
  }
  async function copyLink() {
    const current = attemptRef.current
    if (current?.phase !== 'waiting-browser' || (copyState === 'busy' || copyState === 'copied')) return
    setCopyFeedback({ status: 'busy' })
    try {
      await api.copySignInLink(current.id)
      if (mounted.current && attemptRef.current === current) setCopyFeedback({ status: 'copied' })
    } catch {
      if (mounted.current && attemptRef.current === current) setCopyFeedback({ status: 'failed' })
    }
  }

  const phase = starting ? 'initializing' : attempt?.phase ?? 'failed'
  const waiting = phase === 'waiting-browser'
  const failed = phase === 'expired' || phase === 'failed'
  const title = phase === 'initializing' ? m.welcomeAuthStarting
    : waiting ? m.welcomeAuthWaiting : phase === 'expired' ? m.welcomeAuthExpired
      : phase === 'failed' ? m.welcomeAuthFailed : m.welcomeAuthExchanging
  const heading = page === 'entry' ? 'welcome-heading' : page === 'key' ? 'key-title' : 'auth-status'

  return <>
    {expiryNotice && <Toast text={m.welcomeSessionExpired} onDone={() => { setExpiryNotice(false) }} />}
    <div className="titlebar" aria-hidden="true" />
    <main className="welcome" aria-labelledby={heading}>
      <img className="brand" src={process.env.DSH_CLIENT_BUILD_PROFILE === 'suiyi' ? 'assets/welcome-brand-suiyi.svg' : 'assets/welcome-brand.svg'} alt={m.welcomeBrand} width="472" height="40" />
      <div id="tagline" className="tagline" hidden={page !== 'entry'}>
        <h1 id="welcome-heading"><span>{m.welcomeTaglineBefore}</span><em>{m.welcomeTaglineBrand}</em><span>{m.welcomeTaglineAfter}</span></h1>
        <p id="welcome-description">{m.welcomeDescription}</p>
      </div>
      <form id="key-form" className="key-form" hidden={page !== 'key'} noValidate onSubmit={(event) => { void saveKey(event) }} aria-busy={busy}>
        <header className="key-heading"><h1 id="key-title">{m.welcomeKeyTitle}</h1><p id="key-description">{m.welcomeKeyDescription}</p></header>
        <div className="key-field">
          <label className="visually-hidden" htmlFor="key-input">{m.welcomeKeyPlaceholder}</label>
          <input ref={input} id="key-input" type="password" autoComplete="new-password" autoCapitalize="off" spellCheck={false} required
            aria-describedby="key-description key-error" aria-invalid={error !== ''} placeholder={m.welcomeKeyPlaceholder}
            value={draft} disabled={busy} onChange={(event) => { setDraft(event.target.value); setError('') }} />
          <p id="key-error" className="key-error" role="alert" hidden={error === ''}>{error}</p>
        </div>
      </form>
      <section id="auth-page" className={`key-heading ${waiting ? 'auth-waiting' : phase === 'expired' ? 'auth-expired' : ''}`}
        hidden={page !== 'account'} aria-live="polite">
        <h1 id="auth-status">{title}</h1>
        <p id="auth-description" hidden={!waiting && phase !== 'expired'}>{waiting ? m.welcomeAuthWaitingDescription : m.welcomeAuthExpiredDescription}</p>
        <button id="auth-copy" className="copy-link" type="button" hidden={!waiting} disabled={!waiting || (copyState === 'busy' || copyState === 'copied')} onClick={() => { void copyLink() }}>
          {copyState === 'copied' ? m.welcomeAuthCopied : copyState === 'failed' ? m.welcomeAuthCopyFailed : m.welcomeAuthCopyLink}
        </button>
      </section>
      <div id="auth-actions" className="actions" hidden={page !== 'account'}>
        <button id="auth-loading" className="primary" type="button" hidden={failed} disabled aria-label={m.welcomeAuthExchanging}>
          <StateDot state="ongoing" size={16} className="welcome-loading" />
        </button>
        <button id="auth-retry" className="primary" type="button" hidden={!failed} onClick={() => { void api.analytics?.('auth_page_click', { button_name: 'sign_in' }); void start() }}>{m.welcomeAuthRetry}</button>
        <button id="auth-api-key" className="secondary" type="button" hidden={!failed} onClick={() => { void api.analytics?.('auth_page_click', { button_name: 'api-key' }); navigate('key') }}>{m.welcomeApiKey}</button>
        <button id="auth-cancel" className="secondary" type="button" hidden={failed}
          disabled={cancelling || phase === 'committing' || phase === 'succeeded' || (phase === 'initializing' && !attempt?.id)}
          onClick={() => { void cancel() }}>{m.welcomeAuthCancel}</button>
      </div>
      <div id="entry-actions" className="actions" hidden={page !== 'entry'}>
        <button id="sign-in" className="primary" type="button" onClick={() => { void api.analytics?.('auth_page_click', { button_name: 'sign_in' }); void start() }}>{m.welcomeSignIn}</button>
        <button ref={keyButton} id="api-key" className="secondary" type="button" onClick={() => { void api.analytics?.('auth_page_click', { button_name: 'api-key' }); navigate('key') }}>{m.welcomeApiKey}</button>
      </div>
      <div id="key-actions" className="actions" hidden={page !== 'key'}>
        <button id="save-key" className="primary" type="submit" form="key-form" disabled={busy || draft.trim() === ''}>{m.welcomeKeySave}</button>
        <button id="skip-key" className="secondary" type="button" disabled={busy} onClick={() => { void skip() }}>{m.welcomeKeyLater}</button>
        <button id="back-to-login" className="back" type="button" disabled={busy} onClick={() => {
          if (busyRef.current) return
          setDraft(''); setError(''); focusEntry.current = true; navigate('entry')
        }}>{m.welcomeKeyBack}</button>
      </div>
    </main>
  </>
}
