import { useId } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import './brand.css'
import { NS } from './locales.ts'

/**
 * Locale copy seat of the brand artwork, synthesized by the slot machinery
 * from the `locale` field of this package's registrations.
 */
export type SuiyiBrandT = TranslateNS<typeof NS>

/** Presentation shared by every mark position; the host supplies its own geometry class. */
interface RibbonMarkProps {
  /** Requested square edge in pixels. */
  size: number
  /** Host class carrying the surrounding mark geometry. */
  className?: string | undefined
  /** Whether the Assistant step is still streaming; gates the faster motion. */
  running?: boolean | undefined
  /** Marks the Assistant reply position, which stays still once the step settles. */
  assistant?: boolean | undefined
  /** Accessible name of the artwork. */
  label: string
  /** Pointer-interactive position; Assistant replies deliberately omit it. */
  motion?: 'hero' | 'sidebar' | undefined
}

/**
 * Render the Suiyi fluid ribbon: the prototype's two crossings, their glass
 * highlights, and the wake stroke. The four painted gradients read the
 * `--dsw-brand-mark-*` theme tokens, so the light and dark artwork follow the
 * active palette; the white glass highlights are part of the artwork and stay
 * scheme-invariant. The sidebar and hero positions idle-drift; the Assistant
 * position runs the prototype's 2.8 s thinking drift with its 2.4 s orbit while
 * streaming, then settles through the 0.5 s answer transition. The
 * reduced-motion preference holds every position still and hides the orbit.
 */
function RibbonMark({ size, className, running, assistant, label, motion }: RibbonMarkProps) {
  // useId returns colons, which url(#id) references cannot carry in a selector.
  const scope = useId().replace(/[^\w-]/g, '')
  const wing = `dsh-suiyi-wing-${scope}`
  const wake = `dsh-suiyi-wake-${scope}`
  const glass = `dsh-suiyi-glass-${scope}`
  const side = `dsh-suiyi-side-${scope}`
  const orbit = `dsh-suiyi-orbit-${scope}`
  const artwork = (
    <svg
      className={className === undefined ? 'dsh-suiyi-mark' : `dsh-suiyi-mark ${className}`}
      width={size}
      height={size}
      viewBox="0 0 128 128"
      role="img"
      aria-label={label}
      data-assistant={assistant === true ? '' : undefined}
      data-running={running === true ? '' : undefined}
    >
      <defs>
        <linearGradient id={wing} x1="17%" y1="0%" x2="92%" y2="94%">
          <stop offset="0" stopColor="var(--dsw-brand-mark-wing-1)" />
          <stop offset="0.27" stopColor="var(--dsw-brand-mark-wing-2)" />
          <stop offset="0.63" stopColor="var(--dsw-brand-mark-wing-3)" />
          <stop offset="1" stopColor="var(--dsw-brand-mark-wing-4)" />
        </linearGradient>
        <linearGradient id={wake} x1="0%" y1="84%" x2="100%" y2="9%">
          <stop offset="0" stopColor="var(--dsw-brand-mark-wake-1)" />
          <stop offset="0.34" stopColor="var(--dsw-brand-mark-wake-2)" />
          <stop offset="0.68" stopColor="var(--dsw-brand-mark-wake-3)" />
          <stop offset="1" stopColor="var(--dsw-brand-mark-wake-4)" />
        </linearGradient>
        <linearGradient id={glass} x1="4%" y1="4%" x2="84%" y2="90%">
          <stop stopColor="#ffffff" stopOpacity="0.93" />
          <stop offset="0.47" stopColor="#e6faff" stopOpacity="0.37" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={side} x1="100%" y1="15%" x2="0%" y2="100%">
          <stop stopColor="#fcffff" stopOpacity="0.56" />
          <stop offset="1" stopColor="#fcffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={orbit} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0" stopColor="var(--dsw-brand-mark-wake-1)" />
          <stop offset="1" stopColor="var(--dsw-brand-mark-wing-3)" />
        </linearGradient>
      </defs>
      <g className="dsh-suiyi-orbit" aria-hidden="true">
        <circle
          cx="64"
          cy="64"
          r="60"
          fill="none"
          stroke={`url(#${orbit})`}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="152 225"
        />
      </g>
      <g className="dsh-suiyi-ribbon">
        <path
          d="M98 29.4C79.9 19.3 57.9 19.3 41.7 27.5C27 34.8 19.3 46 25.9 56.2C31.4 65.3 43.7 69.7 55.9 65C49.2 61 47.8 56 51.8 49.8C58.4 39.5 77.5 32.7 98 29.4Z"
          fill={`url(#${wing})`}
        />
        <path
          className="dsh-suiyi-gloss"
          d="M42.4 29.2C58.8 21.4 78.7 21.9 94.5 29C71.8 34.8 59.3 40.7 52.2 48.5C58.7 39.4 75.8 32.1 98 29.4C79.9 19.3 57.9 19.3 41.7 27.5Z"
          fill={`url(#${glass})`}
          opacity="0.66"
        />
        <path
          d="M30 103C50.8 104.1 72.3 97.7 87.8 85C101.3 73.7 107 59 99 51.3C91.4 43.3 76.2 44.6 65.3 52.4C77.6 55.8 80.8 62.3 76.1 71.3C68.7 84 50.8 95.6 30 103Z"
          fill={`url(#${wake})`}
        />
        <path
          className="dsh-suiyi-gloss"
          d="M30 103C48.4 97.3 68.8 84.3 76.1 71.3C81 62.6 76.2 55.1 65.3 52.4C76.2 44.6 91.4 43.3 99 51.3C86 49.7 86 63.6 79.8 74.7C68.3 90.3 50.7 99.4 30 103Z"
          fill={`url(#${side})`}
          opacity="0.66"
        />
        <path
          d="M27.8 49.5C28.3 55 32.1 59.7 38.6 61.8"
          fill="none"
          stroke="#e9ffff"
          strokeOpacity="0.55"
          strokeWidth="0.85"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
  if (motion === undefined) return artwork
  return (
    <span className="dsh-suiyi-motion-shell" data-motion-mark={motion}>
      <span className="dsh-suiyi-motion-inner">{artwork}</span>
    </span>
  )
}

/**
 * Render the Suiyi mark for the sidebar brand slot.
 * @param props - host-supplied mark presentation plus the locale copy seat.
 * @returns the Suiyi ribbon mark at the requested size.
 */
export function SuiyiBrandMark({ size, t }: SidebarBrandMarkOwnerProps & { t: SuiyiBrandT }) {
  return <RibbonMark size={size} label={t('mark.label')} motion="sidebar" />
}

/**
 * Render the Suiyi mark before the blank-session headline, keeping the host's
 * geometry class on the artwork so the hero hover target and layout still
 * apply.
 * @param props - hero mark presentation, host class, and the locale copy seat.
 * @returns the Suiyi ribbon mark at the hero size.
 */
export function SuiyiHeroMark({ size, className, t }: HeroBrandMarkOwnerProps & { t: SuiyiBrandT }) {
  return <RibbonMark size={size} className={className} label={t('mark.label')} motion="hero" />
}

/**
 * Owner data of `conversation.chat.assistant.mark`. ui-chat declares the slot
 * with exactly this face but keeps the interface out of its client entry, so
 * this component restates it and the slot's derived props remain assignable.
 */
interface AssistantMarkPresentation {
  /** Requested square edge in pixels. */
  size: number
  /** Whether the Assistant step is still streaming. */
  running: boolean
  /** Host class carrying the surrounding mark geometry. */
  className?: string | undefined
}

/**
 * Render the Suiyi mark before one Assistant reply. The host class keeps the
 * reply-column geometry; `running` selects the faster streaming drift.
 * @param props - assistant mark presentation, host class, and the locale copy seat.
 * @returns the Suiyi ribbon mark at the reply-mark size.
 */
export function SuiyiAssistantMark({ size, running, className, t }: AssistantMarkPresentation & { t: SuiyiBrandT }) {
  return <RibbonMark size={size} className={className} running={running} assistant label={t('mark.label')} />
}

/**
 * Render the single-line Suiyi wordmark. The prototype drops the romanization
 * subline, so the name holds one 500-weight line in the brand font.
 * @param props - locale copy seat declared by this package's registration.
 * @returns the Chinese wordmark.
 */
export function SuiyiBrandName({ t }: { t: SuiyiBrandT }) {
  return <strong className="dsh-suiyi-name">{t('name.hanzi')}</strong>
}
