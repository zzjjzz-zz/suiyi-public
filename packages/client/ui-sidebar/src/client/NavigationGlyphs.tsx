/**
 * Navigation glyphs copied from the frozen Suiyi prototype's existing icon
 * set. They are not new brand artwork: the speech bubble, grid, and robot
 * paths are the prototype's own SVGs, used where the shared primitive set has
 * no matching glyph.
 */
import type { ReactNode } from 'react'

/** Prototype 24px stroke geometry shared by these navigation glyphs. */
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.65, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** The prototype's plain speech bubble (no plus), used by the Conversation row. */
export function ChatBubbleGlyph({ size = 18 }: { readonly size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5a8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
    </svg>
  )
}

/** The prototype's four-square grid, used by the More row. */
export function GridGlyph({ size = 18 }: { readonly size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
    </svg>
  )
}
