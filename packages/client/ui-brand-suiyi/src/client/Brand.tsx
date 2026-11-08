import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import './brand.css'
import { NS } from './locales.ts'

/**
 * Locale copy seat of the brand artwork, synthesized by the slot machinery
 * from the `locale` field of this package's registrations.
 */
export type SuiyiBrandT = TranslateNS<typeof NS>

/**
 * Render the Suiyi fluid mark with the presentation requested by its host surface.
 * @param props - host-supplied mark presentation plus the locale copy seat.
 * @returns the Suiyi ribbon mark, still under `prefers-reduced-motion`.
 */
export function SuiyiBrandMark({ size, t }: SidebarBrandMarkOwnerProps & { t: SuiyiBrandT }) {
  return (
    <svg
      className="dsh-suiyi-mark"
      width={size}
      height={size}
      viewBox="0 0 128 128"
      role="img"
      aria-label={t('mark.label')}
    >
      <defs>
        <linearGradient id="dsh-suiyi-wing" gradientUnits="userSpaceOnUse" x1="25" y1="24" x2="96" y2="66">
          <stop offset="0" stopColor="var(--dsw-alias-brand-primary)" />
          <stop offset="1" stopColor="var(--dsw-alias-state-idle-primary)" />
        </linearGradient>
        <linearGradient id="dsh-suiyi-wake" gradientUnits="userSpaceOnUse" x1="32" y1="102" x2="96" y2="48">
          <stop offset="0" stopColor="var(--dsw-alias-state-idle-primary)" />
          <stop offset="1" stopColor="var(--dsw-alias-brand-primary)" />
        </linearGradient>
        <linearGradient id="dsh-suiyi-line" gradientUnits="userSpaceOnUse" x1="8" y1="90" x2="113" y2="38">
          <stop offset="0" stopColor="var(--dsw-alias-state-idle-primary)" />
          <stop offset="0.52" stopColor="var(--dsw-alias-brand-primary)" />
          <stop offset="1" stopColor="var(--dsw-alias-state-idle-primary)" />
        </linearGradient>
      </defs>
      <ellipse
        className="dsh-suiyi-orbit"
        cx="64"
        cy="66"
        rx="51.2"
        ry="22.4"
        transform="rotate(-24 64 66)"
        fill="none"
        stroke="url(#dsh-suiyi-line)"
        strokeWidth="1.85"
        opacity="0.82"
      />
      <path
        className="dsh-suiyi-body"
        d="M90.4 29.2C77.6 22 61.6 22 46.4 26.8C27.2 32.4 19.2 43.6 23.2 54C26.4 65.2 40.8 69.2 53.6 62.8C41.6 60.4 40 54 44 46.8C51.2 36.4 71.2 32.4 90.4 29.2Z"
        fill="url(#dsh-suiyi-wing)"
      />
      <path
        className="dsh-suiyi-tail"
        d="M34.4 100.4C52 100.4 72.8 94.8 85.6 82.8C96.8 71.6 96.8 57.2 88 50.8C81.6 45.2 70.4 44.4 62.4 50C72.8 50.8 79.2 59.6 73.6 68.4C66.4 82.8 51.2 92.4 34.4 100.4Z"
        fill="url(#dsh-suiyi-wake)"
      />
    </svg>
  )
}

/**
 * Render the two-line Suiyi wordmark: the hanzi name over the romanization.
 * The browser palette tokens drive its color, so light and dark stay legible.
 * @param props - locale copy seat declared by this package's registration.
 * @returns the two-line Chinese wordmark.
 */
export function SuiyiBrandName({ t }: { t: SuiyiBrandT }) {
  return (
    <span className="dsh-suiyi-name">
      <strong className="dsh-suiyi-name-hanzi">{t('name.hanzi')}</strong>
      <small className="dsh-suiyi-name-roman" aria-label={t('name.romanLabel')}>{t('name.roman')}</small>
    </span>
  )
}
