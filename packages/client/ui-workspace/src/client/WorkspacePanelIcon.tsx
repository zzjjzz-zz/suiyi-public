/** The sidebar's Workspaces entry icon; the shell owns the row, label, and selection. */
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the prototype's folder outline at the sidebar's requested size.
 * @param props - requested square edge.
 * @returns the icon element.
 */
export function WorkspacePanelIcon({ size }: Pick<PropsRuntime<'sidebar.panellist'>, 'size'>): ReactNode {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </svg>
}
