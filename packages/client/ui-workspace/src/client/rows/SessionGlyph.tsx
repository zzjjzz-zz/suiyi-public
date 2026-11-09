/**
 * The recent row's idle speech-bubble, copied from the frozen prototype's
 * existing chat icon. Status dots and registered leading marks keep their real
 * semantics; this only replaces the generic add-chat fallback.
 */
import type { ReactNode } from 'react'

/**
 * Render the prototype chat bubble.
 * @param props.size - square edge in pixels.
 * @param props.className - caller-owned presentation class.
 * @returns the decorative bubble.
 */
export function SessionGlyph({ size = 14, className }: { readonly size?: number; readonly className?: string | undefined }): ReactNode {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5a8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
    </svg>
  )
}
