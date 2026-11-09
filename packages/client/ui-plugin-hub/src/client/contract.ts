/** The plugin hub browser consumes the Host's generated Remote contract. */
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { PluginHubCatalog } from '@deepseek-ai/dsh-plugin-hub-client/types'

export type { CatalogPlugin, PluginInstanceView, PublishedTool } from '@deepseek-ai/dsh-plugin-hub-client/types'

/** One complete catalog generation, its live instances, and the hub enablement flag. */
export type PluginHubSnapshot = PluginHubCatalog

/** The generated browser Remote namespace for catalog reads and lifecycle actions. */
export type PluginHubRemote = ClientRemote['pluginHub']

/**
 * Read the generated hub namespace; credentials stay on the Host.
 * @param remote - the Client Remote assembly.
 * @returns the `pluginHub` namespace.
 */
export function pluginHubRemote(remote: ClientRemote): PluginHubRemote {
  return remote.pluginHub
}
