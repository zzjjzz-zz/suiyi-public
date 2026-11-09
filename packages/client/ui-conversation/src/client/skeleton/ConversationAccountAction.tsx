/** Real Suiyi identity entry in the global shell topbar. */
import { useEffect, useRef, useState } from 'react'
import { IconUserOutlineRegular, Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  DesktopSuiyiIdentityBridge, DesktopSuiyiIdentityView,
} from '@deepseek-ai/dsh-client-ui-settings-general/types'
import type { ConversationShellTopbarProps } from './ConversationShellTopbar.tsx'
import css from './ConversationRoot.module.css'

/** Product API subset that carries the Suiyi identity bridge. */
interface SuiyiDesktopApi {
  readonly suiyiIdentity?: DesktopSuiyiIdentityBridge
}

/**
 * Read the preload bridge without assuming any non-Suiyi Desktop or Web host.
 * @returns the bridge when the Suiyi preload exposed it.
 */
function identityBridge(): DesktopSuiyiIdentityBridge | undefined {
  return (globalThis as { dshDesktop?: SuiyiDesktopApi }).dshDesktop?.suiyiIdentity
}

/** Props of the topbar identity entry. */
export interface ConversationAccountActionProps {
  /** Owner locale seat. */
  readonly t: ConversationShellTopbarProps['t']
}

/**
 * Show the live Suiyi identity state: signed-in name with sign-out, locked
 * sign-in, or an explicit unavailable state for Web and non-Suiyi Desktop.
 * It never falls back to the DeepSeek model account.
 *
 * The initial `view()` result only applies while no subscription update has
 * arrived; a later bridge event always wins. Async handlers are guarded by a
 * mounted ref and a synchronous pending ref, so double clicks and unmounts do
 * not publish stale state or fire duplicate IPC.
 * @param props - locale seat.
 * @returns the account control and, when signed in, its sign-out menu.
 */
export function ConversationAccountAction({ t }: ConversationAccountActionProps) {
  const bridge = identityBridge()
  const [view, setView] = useState<DesktopSuiyiIdentityView | undefined>(
    () => bridge === undefined ? { state: 'unavailable' } : undefined,
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState(false)
  const revision = useRef(0)
  const mounted = useRef(true)
  const pendingRef = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    if (bridge === undefined) return
    let live = true
    const publish = (next: DesktopSuiyiIdentityView): void => {
      if (!live || !mounted.current) return
      revision.current += 1
      setFailure(false)
      setView(next)
    }
    void bridge.view().then((next) => {
      // A bridge event that arrived while view() was in flight is newer.
      if (live && mounted.current && revision.current === 0) setView(next)
    }).catch(() => {
      if (!live || !mounted.current || revision.current !== 0) return
      setView({ state: 'unavailable' })
    })
    const off = bridge.subscribe((next) => { publish(next) })
    return () => { live = false; off() }
  }, [bridge])
  const state = view?.state
  const label = failure
    ? t('topbar.identityFailure')
    : state === 'signed-in'
      ? view?.displayName ?? t('topbar.accountFallback')
      : state === 'locked' ? t('topbar.signIn')
        : state === 'unavailable' ? t('topbar.identityUnavailable') : t('topbar.identityChecking')
  const detail = failure
    ? t('topbar.identityFailureDetail')
    : state === 'unavailable'
      ? t('topbar.identityUnavailableDetail')
      : state === 'locked' ? t('topbar.lockedDetail') : label
  const disabled = bridge === undefined || view === undefined || pending
  const signIn = async (): Promise<void> => {
    if (bridge === undefined || pendingRef.current) return
    pendingRef.current = true
    const before = revision.current
    if (mounted.current) setPending(true)
    try {
      const result = await bridge.signIn()
      if (!result.ok && result.reason !== 'cancelled'
        && mounted.current && revision.current === before) {
        setFailure(true)
      }
    } catch {
      if (mounted.current && revision.current === before) setFailure(true)
    } finally {
      pendingRef.current = false
      if (mounted.current) setPending(false)
    }
  }
  const signOut = async (): Promise<void> => {
    setMenuOpen(false)
    if (bridge === undefined || pendingRef.current) return
    pendingRef.current = true
    if (mounted.current) setPending(true)
    try {
      await bridge.signOut()
    } catch {
      if (mounted.current) setFailure(true)
    } finally {
      pendingRef.current = false
      if (mounted.current) setPending(false)
    }
  }
  const anchor = (
    <Tooltip label={detail} side="bottom" portal>
      <button
        type="button"
        className={css.accountAction}
        aria-label={label}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        data-identity-state={state ?? 'checking'}
        onClick={() => {
          if (state === 'signed-in') setMenuOpen(open => !open)
          else if (state === 'locked') void signIn()
        }}
      >
        <IconUserOutlineRegular size={16} />
        <span className={css.accountLabel}>{label}</span>
      </button>
    </Tooltip>
  )
  if (state !== 'signed-in') return anchor
  return (
    <Menu
      open={menuOpen}
      onClose={() => { setMenuOpen(false) }}
      portal
      autoFocus
      className={css.accountMenuAnchor}
      anchor={anchor}
    >
      <button
        type="button"
        role="menuitem"
        className={css.accountMenuItem}
        disabled={pending}
        onClick={() => { void signOut() }}
      >
        {t('topbar.signOut')}
      </button>
    </Menu>
  )
}
