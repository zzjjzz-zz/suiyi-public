/** The sidebar's Plugin hub entry icon; the sidebar owns the button, label, and selected state around it. */

import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the prototype's layered outline at the sidebar's requested size.
 * @param props - the sidebar's requested edge; the sidebar supplies the rest of the share.
 * @returns the icon element.
 */
export function PluginHubPanelIcon({ size }: Pick<PropsRuntime<'sidebar.panellist'>, 'size'>): ReactNode {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 3 10 6-10 6L2 9l10-6ZM2 15l10 6 10-6M2 12l10 6 10-6" />
  </svg>
}
