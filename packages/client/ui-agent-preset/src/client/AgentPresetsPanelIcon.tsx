/** The sidebar's Agents entry icon; the shell owns the row, label, and selection. */
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the prototype's robot glyph at the sidebar's requested size. The path
 * is the frozen prototype's existing icon, not new artwork.
 * @param props - requested square edge.
 * @returns the icon element.
 */
export function AgentPresetsPanelIcon({ size }: Pick<PropsRuntime<'sidebar.panellist'>, 'size'>): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v3M8 6h8a4 4 0 0 1 4 4v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-7a4 4 0 0 1 4-4ZM8 11v2M16 11v2M9 17h6M1 11v4M23 11v4" />
    </svg>
  )
}
