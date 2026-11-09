/**
 * General Settings row for generative output. The row presents provider
 * readiness and the accepted preference from observable sources, so a provider
 * that mounts late, unloads, or loses its account updates the same row.
 */
import { useState } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { VisualOutputBlockReason } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { VisualOutputAvailability } from './visual-output.ts'
import type { SettingsKey } from './locales.ts'
import css from './PreferenceRow.module.css'

/** Locale key per unavailable reason. */
const UNAVAILABLE_COPY = {
  'not-installed': 'visualOutput.unavailable.notInstalled',
  isolation: 'visualOutput.unavailable.isolation',
  permission: 'visualOutput.unavailable.permission',
} as const satisfies Record<'not-installed' | VisualOutputBlockReason, SettingsKey>

/** Readiness, accepted preference, and ordered writer supplied by the owner. */
export interface VisualOutputRowInjected {
  hooks: {
    readiness: ObservableSnapshot<VisualOutputAvailability>
    visualOutput: ObservableSnapshot<boolean>
  }
  /** Persist one choice through the provider; resolves whether the write was accepted. */
  setEnabled(enabled: boolean): Promise<boolean>
}

/**
 * Render the visual-output toggle and its availability reason.
 * @param props - readiness, accepted preference, writer and localized copy
 * @returns the General Settings row
 */
export function VisualOutputRow({ useReadiness, useVisualOutput, setEnabled, t }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<VisualOutputRowInjected>) {
  const availability = useReadiness(value => value)
  const enabled = useVisualOutput(value => value)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const reason = availability.ready ? undefined : t(UNAVAILABLE_COPY[availability.reason])
  return <div className={css.row}>
    <div className={css.copy}>
      <div className={css.title}>{t('visualOutput.title')}</div>
      <div className={css.description}>{t('visualOutput.description')}</div>
      {reason !== undefined && <div className={css.status}>{reason}</div>}
      {failed && <div className={css.error} role="alert">{t('visualOutput.error')}</div>}
    </div>
    <Switch
      checked={enabled}
      disabled={!availability.ready || busy}
      label={t('visualOutput.title')}
      title={reason}
      onChange={(next) => {
        setFailed(false)
        setBusy(true)
        void setEnabled(next)
          .then((accepted) => { if (!accepted) setFailed(true) })
          .catch(() => { setFailed(true) })
          .finally(() => { setBusy(false) })
      }}
    />
  </div>
}
