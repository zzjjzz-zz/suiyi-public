/** The sidebar's Plugin hub entry icon; the sidebar owns the button, label, and selected state around it. */

import type { ReactNode } from 'react'
import { IconLayersOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the existing plugin glyph at the size the sidebar asks for.
 * @param props - the sidebar's requested edge; the sidebar supplies the rest of the share.
 * @returns the icon element.
 */
export function PluginHubPanelIcon({ size }: Pick<PropsRuntime<'sidebar.panellist'>, 'size'>): ReactNode {
  return <IconLayersOutlineRegular size={size} />
}
