/** Bottom-row Suiyi account entry backed by the real Desktop Keycloak bridge. */
import { IconChevronDownOutlineRegular, IconUserOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsRootComponentProps } from './shell-contract.ts'
import type { SuiyiIdentityState } from './suiyi-identity.ts'
import css from './SuiyiAccountRow.module.css'

/** Props the shell supplies from its identity controller. */
export interface SuiyiAccountRowProps {
  /** Standard settings locale seat. */
  t: SettingsRootComponentProps['t']
  /** Current safe view and this consumer's in-flight state. */
  state: SuiyiIdentityState
  /** Open the real Keycloak page. */
  signIn: () => void
  /** Clear the Suiyi identity. */
  signOut: () => void
}

/**
 * Render the Suiyi account row.
 * @param props - identity state and actions
 * @returns the footer row
 */
export function SuiyiAccountRow({ t, state, signIn, signOut }: SuiyiAccountRowProps) {
  const { view, pending, failed } = state
  const pendingLabel = pending === 'signIn' ? t('suiyiIdentity.signingIn')
    : pending === 'signOut' ? t('suiyiIdentity.signingOut')
      : undefined
  const title = view.state === 'signed-in'
    ? (view.displayName ?? t('suiyiIdentity.account'))
    : view.state === 'locked' ? t('suiyiIdentity.locked') : t('account.unavailable')
  return <div className={css.row}>
    <span className={css.icon} aria-hidden="true"><IconUserOutlineMedium size={16} /></span>
    <span className={css.copy}>
      <span className={css.title}>{title}</span>
      {pendingLabel !== undefined && <span className={css.detail}>{pendingLabel}</span>}
      {failed && <span className={css.error} role="alert">{t('suiyiIdentity.error')}</span>}
    </span>
    {view.state === 'signed-in' && (
      <button type="button" className={css.action} disabled={pending !== null} onClick={signOut}>
        {t('suiyiIdentity.signOut')}
      </button>
    )}
    {view.state === 'locked' && (
      <button type="button" className={css.action} disabled={pending !== null} onClick={signIn}>
        {t('suiyiIdentity.signIn')}
      </button>
    )}
    <span className={css.chevron} aria-hidden="true"><IconChevronDownOutlineRegular size={18} /></span>
  </div>
}
