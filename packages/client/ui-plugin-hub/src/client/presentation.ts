/** Pure projections over one plugin hub snapshot: filtering, categories, and per-plugin row state. */
import type { CatalogPlugin, PluginHubSnapshot, PluginInstanceView } from './contract.ts'

/** The list's current text and category filters. */
export interface HubQuery {
  readonly text: string
  readonly category: string | null
}

/** The state a plugin row shows, after the catalog and its local instance are combined. */
export type HubRowState = 'enabled' | 'connecting' | 'disabled' | 'error'

/**
 * The instance state of one plugin, if the Host runs or tracks one.
 * @param snapshot - the published catalog and its instances.
 * @param pluginId - catalog plugin id.
 * @returns the instance view, or undefined when the Host published none.
 */
export function instanceOf(snapshot: PluginHubSnapshot, pluginId: string): PluginInstanceView | undefined {
  return snapshot.instances.find(instance => instance.pluginId === pluginId)
}

/**
 * A plugin without an instance entry is not enabled.
 * @param instance - the instance view, when the Host published one.
 * @returns the state a row shows.
 */
export function rowState(instance: PluginInstanceView | undefined): HubRowState {
  return instance?.state ?? 'disabled'
}

/**
 * The declared categories in catalog order: the page keeps the order the
 * administrator published instead of re-sorting business vocabulary. Empty
 * declarations are not filter choices and are skipped.
 * @param plugins - every visible catalog row.
 * @returns deduplicated non-empty categories in first-seen order.
 */
export function categoriesOf(plugins: readonly CatalogPlugin[]): string[] {
  return [...new Set(plugins.map(plugin => plugin.category).filter(category => category.trim() !== ''))]
}

function matches(plugin: CatalogPlugin, text: string): boolean {
  if (plugin.name.toLowerCase().includes(text) || plugin.pluginId.includes(text) || plugin.category.toLowerCase().includes(text)) {
    return true
  }
  if (plugin.description.toLowerCase().includes(text)) return true
  return plugin.allowedTools.some(tool => tool.name.toLowerCase().includes(text)
    || (tool.description ?? '').toLowerCase().includes(text))
}

/**
 * The plugins the list shows for one query: the catalog order is kept.
 * @param plugins - every visible plugin of the snapshot.
 * @param query - trimmed text matches names, ids, categories, descriptions, and approved tools.
 * @returns the plugins matching both filters, in their original order.
 */
export function visiblePlugins(plugins: readonly CatalogPlugin[], query: HubQuery): CatalogPlugin[] {
  const text = query.text.trim().toLowerCase()
  return plugins.filter(plugin => (query.category === null || plugin.category === query.category)
    && (text === '' || matches(plugin, text)))
}

/**
 * Whether this account has added the plugin to its directory. The Host
 * publishes `added` beside the live instance state; a `disabled` state with
 * `added: true` was stopped but kept. An error or connecting instance is added
 * but not currently healthy.
 * @param snapshot - the published catalog and its instances.
 * @param pluginId - catalog plugin id.
 * @returns true when the Host reports the row as added.
 */
export function isAdded(snapshot: PluginHubSnapshot, pluginId: string): boolean {
  const instance = instanceOf(snapshot, pluginId)
  if (instance === undefined) return false
  return instance.added === true
}

/**
 * Whether the local instance runs a release older than the catalog's current one.
 * @param plugin - the catalog row.
 * @param instance - the local instance, when present.
 * @returns true when the versions differ.
 */
export function isOlderRelease(plugin: CatalogPlugin, instance: PluginInstanceView | undefined): boolean {
  return instance !== undefined && instance.releaseVersion !== plugin.releaseVersion
}

/**
 * Whether the added plugin is currently active or starting.
 * @param instance - the local instance, when present.
 * @returns true for an enabled or connecting instance.
 */
export function isActive(instance: PluginInstanceView | undefined): boolean {
  const state = rowState(instance)
  return state === 'enabled' || state === 'connecting'
}
