/** The sidebar's Workspaces entry icon; the shell owns the row, label, and selection. */
import type { ReactNode } from 'react'
import { IconFolderCloseRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the workspace glyph at the sidebar's requested size.
 * @param props - requested square edge.
 * @returns the icon element.
 */
export function WorkspacePanelIcon({ size }: Pick<PropsRuntime<'sidebar.panellist'>, 'size'>): ReactNode {
  return <IconFolderCloseRegular size={size} />
}
