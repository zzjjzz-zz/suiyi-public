// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render } from '@testing-library/react'
import { act, cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Welcome } from '../src/client/WelcomePage.tsx'
import { resolveDesktopLocale } from '../src/locale.ts'
import type { AccountView } from '@deepseek-ai/dsh-deepseek-account/types'
import type { OfficialWelcomeApi, SuiyiLoginView, SuiyiWelcomeApi } from '../src/welcome-api.ts'

const links = { usageUrl: 'https://example.test/usage', topUpUrl: 'https://example.test/top_up' }
const signedOut = (): AccountView => ({ status: 'signed-out', links, attempt: null })
afterEach(cleanup)

/** Mount the Suiyi login face; the listener captured here stands in for host pushes. */
function mount(language = 'zh-CN') {
  cleanup()
  const stopState = vi.fn()
  let push: (view: SuiyiLoginView) => void = () => {}
  const login = {
    start: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    copyLink: vi.fn(async () => {}),
    onState: vi.fn((listener: (view: SuiyiLoginView) => void) => {
      push = listener
      return stopState
    }),
  }
  const api: SuiyiWelcomeApi = { ...resolveDesktopLocale(language), suiyi: login }
  const view = render(<Welcome api={api} />)
  const button = (id: string) => document.querySelector<HTMLButtonElement>(id)!
  const receive = (state: SuiyiLoginView) => { act(() => { push(state) }) }
  const copy = () => [
    document.title,
    document.querySelector('.sy-auth-story h1')!.textContent,
    document.querySelector('.sy-auth-story > p')!.textContent,
    document.querySelector('#suiyi-card-title')!.textContent,
    document.querySelector('.sy-auth-card p')!.textContent,
    ...[...document.querySelectorAll<HTMLButtonElement>('.sy-auth-card button')]
      .map(item => `${item.textContent || ''}${item.disabled ? ' [disabled]' : ''}`),
    '',
  ].join('\n')
  return { api, login, button, receive, copy, stopState, unmount: view.unmount }
}

describe('Suiyi identity-center login', () => {
  it.each(['zh-CN', 'en'] as const)('renders the %s keycloak entry without simulated accounts', async (language) => {
    const view = mount(language)
    expect(view.api.messages.suiyiLoginDocumentTitle).not.toBe('')
    expect(view.api.messages.suiyiLoginStart).not.toBe('')
    expect(document.documentElement.lang).toBe(language)
    expect(document.title).toBe(view.api.messages.suiyiLoginDocumentTitle)
    expect(document.querySelector('#api-key')).toBeNull()
    expect(document.querySelector('#sign-in')).toBeNull()
    expect(document.body.textContent).not.toContain('API Key')
    expect('saveApiKey' in view.api).toBe(false)
    // The login logo is the static logo-motion artwork in both themes: same
    // cyan-blue stops, no internal animation, host orbit animation only.
    const marks = [...document.querySelectorAll('.sy-brand img, .sy-orbit-scene img')]
    expect(marks).toHaveLength(2)
    for (const mark of marks) expect(mark.getAttribute('src')).toBe('assets/suiyi-mark.svg')
    const asset = readFileSync(join(import.meta.dirname, '../renderer/assets/suiyi-mark.svg'), 'utf8')
    expect(asset).toContain('#E5FEFF')
    expect(asset).toContain('#27B8E2')
    expect(asset).not.toContain('<style')
    expect(asset).not.toContain('animation')
    await expect(view.copy()).toMatchFileSnapshot(`./expected/welcome-suiyi/${language}-ready.expected.txt`)
    // The initial view deliberately does not auto-focus; keyboard users tab to the action.
    expect(document.activeElement).not.toBe(view.button('#suiyi-start'))
  })

  it('starts one authorization attempt and ignores repeat activation while starting', async () => {
    const view = mount()
    const pending = Promise.withResolvers<undefined>()
    view.login.start.mockReturnValueOnce(pending.promise)
    fireEvent.click(view.button('#suiyi-start'))
    fireEvent.click(view.button('#suiyi-start'))
    expect(view.login.start).toHaveBeenCalledOnce()
    expect(view.button('#suiyi-start').disabled).toBe(true)
    pending.resolve(undefined)
    await act(async () => { await pending.promise })
    expect(view.button('#suiyi-start').disabled).toBe(false)
  })

  it.each(['zh-CN', 'en'] as const)('shows %s browser authorization progress and copies the active link', async (language) => {
    const view = mount(language)
    view.receive({ phase: 'working', authorizeUrl: 'https://sso.example.test/auth' })
    await expect(view.copy() + `${document.querySelector('ol')!.textContent}\n`)
      .toMatchFileSnapshot(`./expected/welcome-suiyi/${language}-waiting.expected.txt`)
    expect(view.button('#suiyi-cancel').disabled).toBe(false)
    fireEvent.click(view.button('#suiyi-copy'))
    await vi.waitFor(() => { expect(view.login.copyLink).toHaveBeenCalledOnce() })
    await vi.waitFor(() => { expect(view.button('#suiyi-copy').textContent).toBe(view.api.messages.suiyiLoginCopied) })
    expect(view.button('#suiyi-copy').disabled).toBe(true)
    view.receive({ phase: 'working' })
    expect(view.button('#suiyi-copy').disabled).toBe(true)
    view.receive({ phase: 'ready' })
    expect(document.activeElement).toBe(view.button('#suiyi-start'))
  })

  it('keeps the copy action unavailable without an authorization address', () => {
    const view = mount()
    view.receive({ phase: 'working' })
    fireEvent.click(view.button('#suiyi-copy'))
    expect(view.button('#suiyi-copy').disabled).toBe(true)
    expect(view.login.copyLink).not.toHaveBeenCalled()
  })

  it('reports a refused copy and lets the user try again', async () => {
    const view = mount('en')
    const copied = Promise.withResolvers<undefined>()
    view.login.copyLink.mockReturnValueOnce(copied.promise)
    view.receive({ phase: 'working', authorizeUrl: 'https://sso.example.test/auth' })
    fireEvent.click(view.button('#suiyi-copy'))
    expect(view.button('#suiyi-copy').disabled).toBe(true)
    await act(async () => { copied.reject(new Error('clipboard unavailable')); await copied.promise.catch(() => undefined) })
    await vi.waitFor(() => { expect(view.button('#suiyi-copy').textContent).toBe(view.api.messages.suiyiLoginCopyFailed) })
    expect(view.button('#suiyi-copy').disabled).toBe(false)
    view.login.copyLink.mockResolvedValueOnce(undefined)
    fireEvent.click(view.button('#suiyi-copy'))
    await vi.waitFor(() => { expect(view.button('#suiyi-copy').textContent).toBe(view.api.messages.suiyiLoginCopied) })
  })

  it('cancels the active attempt once and keeps it visible when cancellation is refused', async () => {
    const view = mount()
    const cancelled = Promise.withResolvers<undefined>()
    view.login.cancel.mockReturnValueOnce(cancelled.promise)
    view.receive({ phase: 'working', authorizeUrl: 'https://sso.example.test/auth' })
    fireEvent.click(view.button('#suiyi-cancel'))
    fireEvent.click(view.button('#suiyi-cancel'))
    expect(view.login.cancel).toHaveBeenCalledOnce()
    cancelled.reject(new Error('still pending'))
    await act(async () => { await cancelled.promise.catch(() => undefined) })
    expect(view.button('#suiyi-cancel').disabled).toBe(false)
    expect(view.button('#suiyi-cancel')).not.toBeNull()
    view.receive({ phase: 'ready' })
    expect(document.querySelector('#suiyi-cancel')).toBeNull()
  })

  it.each(['zh-CN', 'en'] as const)('renders %s classified failure with retry and return', async (language) => {
    const view = mount(language)
    view.receive({ phase: 'error', failure: 'timeout' })
    await expect(view.copy() + `${document.querySelector('#suiyi-error')!.textContent}\n`)
      .toMatchFileSnapshot(`./expected/welcome-suiyi/${language}-timeout.expected.txt`)
    expect(document.activeElement).toBe(view.button('#suiyi-retry'))
    fireEvent.click(view.button('#suiyi-retry'))
    expect(view.login.start).toHaveBeenCalledOnce()
    view.receive({ phase: 'error', failure: 'unreachable' })
    expect(document.querySelector('#suiyi-error')!.textContent).toBe(view.api.messages.suiyiLoginFailureUnreachable)
    fireEvent.click(view.button('#suiyi-back'))
    expect(view.button('#suiyi-start')).not.toBeNull()
    expect(document.activeElement).toBe(view.button('#suiyi-start'))
  })

  it('renders the declared failure classifications', () => {
    const view = mount('en')
    const cases = {
      unreachable: view.api.messages.suiyiLoginFailureUnreachable,
      configuration: view.api.messages.suiyiLoginFailureConfiguration,
      cancelled: view.api.messages.suiyiLoginFailureCancelled,
      timeout: view.api.messages.suiyiLoginFailureTimeout,
      rejected: view.api.messages.suiyiLoginFailureRejected,
      unknown: view.api.messages.suiyiLoginFailureUnknown,
    } as const
    for (const [failure, text] of Object.entries(cases)) {
      view.receive({ phase: 'error', failure: failure as keyof typeof cases })
      expect(document.querySelector('#suiyi-error')!.textContent).toBe(text)
    }
    view.receive({ phase: 'error' })
    expect(document.querySelector('#suiyi-error')!.textContent).toBe(view.api.messages.suiyiLoginFailureUnknown)
  })

  it('hands the confirmed identity to the workspace without extra actions', async () => {
    const view = mount('en')
    view.receive({ phase: 'success' })
    expect(document.querySelector('#suiyi-card-title')!.textContent).toBe(view.api.messages.suiyiLoginSuccessTitle)
    expect(document.querySelectorAll<HTMLButtonElement>('.sy-auth-card button')).toHaveLength(0)
    await expect(view.copy()).toMatchFileSnapshot('./expected/welcome-suiyi/en-success.expected.txt')
  })

  it('surfaces a failed start request as an unanswered attempt', async () => {
    const view = mount()
    view.login.start.mockRejectedValueOnce(new Error('transport closed'))
    fireEvent.click(view.button('#suiyi-start'))
    await vi.waitFor(() => { expect(document.querySelector('#suiyi-retry')).not.toBeNull() })
    expect(document.querySelector('#suiyi-error')!.textContent).toBe(view.api.messages.suiyiLoginFailureUnknown)
  })

  it('ignores state pushed after unmount and releases the subscription', () => {
    const view = mount()
    view.unmount()
    expect(view.stopState).toHaveBeenCalledOnce()
    expect(() => { view.receive({ phase: 'working' }) }).not.toThrow()
  })

  it('restores the copy action after feedback and survives unmount', async () => {
    vi.useFakeTimers()
    try {
      const view = mount('en')
      view.receive({ phase: 'working', authorizeUrl: 'https://sso.example.test/auth' })
      await act(async () => { fireEvent.click(view.button('#suiyi-copy')) })
      expect(view.button('#suiyi-copy').textContent).toBe(view.api.messages.suiyiLoginCopied)
      await act(async () => { await vi.advanceTimersByTimeAsync(1999) })
      expect(view.button('#suiyi-copy').textContent).toBe(view.api.messages.suiyiLoginCopied)
      await act(async () => { await vi.advanceTimersByTimeAsync(1) })
      expect(view.button('#suiyi-copy').textContent).toBe(view.api.messages.suiyiLoginCopyLink)
      expect(view.button('#suiyi-copy').disabled).toBe(false)
      view.unmount()
      await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
      expect(screen.queryByRole('button')).toBeNull()
    } finally {
      cleanup()
      vi.useRealTimers()
    }
  })

  it('keeps the official account flow when no Suiyi login face is supplied', () => {
    cleanup()
    const api: OfficialWelcomeApi = {
      ...resolveDesktopLocale('en'),
      analytics: vi.fn(async () => {}),
      analyticsEnabled: async () => true,
      takeNotice: vi.fn(async () => undefined),
      startSignIn: vi.fn(async () => signedOut()),
      cancelSignIn: vi.fn(async () => signedOut()),
      copySignInLink: vi.fn(async () => {}),
      onAccountState: vi.fn(() => vi.fn()),
      saveApiKey: vi.fn(async () => ({ ok: true } as const)),
      skip: vi.fn(async () => {}),
    }
    render(<Welcome api={api} />)
    expect(document.querySelector('#api-key')).not.toBeNull()
    expect(document.querySelector('#suiyi-start')).toBeNull()
    expect(document.title).toBe(api.messages.welcomeTitle)
  })

  it('keeps the failure notice for assistive technology', () => {
    const view = mount()
    view.receive({ phase: 'error', failure: 'configuration' })
    expect(screen.getByRole('alert').textContent).toBe(view.api.messages.suiyiLoginFailureConfiguration)
    expect(document.querySelector('.sy-auth-card')!.getAttribute('aria-busy')).toBe('false')
    view.receive({ phase: 'working' })
    expect(document.querySelector('.sy-auth-card')!.getAttribute('aria-busy')).toBe('true')
  })
})

describe('Authenticated welcome revisit', () => {
  it('returns to the existing workspace without exposing authentication operations', async () => {
    const returnToWorkspace = vi.fn(async () => {})
    const api: SuiyiWelcomeApi = { ...resolveDesktopLocale('zh-CN'), suiyi: { returnToWorkspace } }
    render(<Welcome api={api} />)
    expect(screen.getByText('欢迎使用遂意')).toBeTruthy()
    await expect(document.querySelector('.sy-auth-card')!.textContent + '\n').toMatchFileSnapshot('./expected/welcome-suiyi/zh-CN-revisit.expected.txt')
    expect(document.querySelector('#suiyi-start')).toBeNull()
    expect(document.querySelector('#api-key')).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '返回工作空间' })) })
    expect(returnToWorkspace).toHaveBeenCalledOnce()
  })

  it('reports a failed return and permits retry without presenting a login attempt', async () => {
    const returnToWorkspace = vi.fn().mockRejectedValueOnce(new Error('IPC unavailable')).mockResolvedValue(undefined)
    const api: SuiyiWelcomeApi = { ...resolveDesktopLocale('en'), suiyi: { returnToWorkspace } }
    render(<Welcome api={api} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Return to workspace' })) })
    expect(screen.getByRole('alert').textContent).toBe(api.messages.suiyiWelcomeReturnError)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Return to workspace' })) })
    expect(returnToWorkspace).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.querySelector('#suiyi-start')).toBeNull()
  })
})
