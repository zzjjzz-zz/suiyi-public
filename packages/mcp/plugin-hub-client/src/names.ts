/**
 * Deterministic public names for hub-hosted MCP instances and their tools.
 * Names follow the mcp-client wire conventions; the namespace budget keeps the
 * `mcp__<namespace>__` prefix inside the 64-character function-name limit.
 *
 * @module @deepseek-ai/dsh-plugin-hub-client/names
 */

import { createHash } from 'node:crypto'

/** Frozen plugin-id grammar from the platform wire API. */
export const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/

/** mcp-client's valid `serverName` grammar is `[A-Za-z0-9_-]{1,32}`; {@link namespaceForPlugin} stays inside it. */

/** Hex characters of the plugin-id hash used in a namespace. */
const NAMESPACE_HASH_LENGTH = 20

/**
 * Derive the stable MCP namespace for one plugin id. The id is hashed in full
 * rather than truncated, so two ids never collapse by sharing a prefix; a
 * remaining 80-bit hash collision is refused by the instance registry instead
 * of silently sharing a namespace.
 * @param pluginId - frozen catalog plugin id.
 * @returns a namespace matching mcp-client's `[A-Za-z0-9_-]{1,32}` grammar.
 * @throws TypeError when the id does not satisfy {@link PLUGIN_ID_PATTERN}.
 */
export function namespaceForPlugin(pluginId: string): string {
  if (!PLUGIN_ID_PATTERN.test(pluginId)) {
    throw new TypeError(`plugin id "${pluginId}" must match ${String(PLUGIN_ID_PATTERN)}`)
  }
  const hash = createHash('sha256').update(pluginId).digest('hex').slice(0, NAMESPACE_HASH_LENGTH)
  // `hub_` plus twenty hex characters is 24 characters of the fixed grammar.
  return `hub_${hash}`
}

/** Reuse the MCP client's public naming contract. */
export { publicToolName } from '@deepseek-ai/dsh-mcp-client'
