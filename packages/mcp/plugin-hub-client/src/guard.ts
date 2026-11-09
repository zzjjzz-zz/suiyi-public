/**
 * Pre-dispatch authorization guard for tools exposed by hub instances.
 *
 * The hub MCP endpoint revalidates authorization on every request; this guard
 * is the Host-side defense that refuses a call whose instance release is no
 * longer authorized, or whose public name no longer belongs to an approved
 * instance. It runs after every `tools/pre-execute` listener and before the
 * tool body, so listener ordering cannot turn a denial back into permission.
 *
 * @module @deepseek-ai/dsh-plugin-hub-client/guard
 */

import type { ToolExecution } from '@deepseek-ai/dsh-tools'

/** One live hub instance as the guard sees it. */
export interface GuardedInstance {
  /** Catalog plugin id that owns the instance. */
  pluginId: string
  /** Release version the mounted instance was created from. */
  releaseVersion: string
  /** Public tool names the frozen release allows. */
  publicToolNames: ReadonlySet<string>
}

/**
 * Refuse one tool call that would reach a hub instance whose authorization or
 * release binding is stale. Foreign tool names and names outside every known
 * namespace pass through untouched.
 * @param execution - the identity-protected pending call.
 * @param live - mounted instances keyed by MCP namespace.
 * @param revoked - namespaces retired on this service's lifetime, keyed to their plugin id.
 * @param authorized - release versions currently authorized, keyed by plugin id.
 * @returns a model-facing denial reason, or `undefined` to leave the call allowed.
 */
export function guardToolCall(
  execution: Readonly<Pick<ToolExecution, 'name'>>,
  live: ReadonlyMap<string, GuardedInstance>,
  revoked: ReadonlyMap<string, string>,
  authorized: ReadonlyMap<string, string>,
): string | undefined {
  const name = execution.name
  for (const namespace of revoked.keys()) {
    if (name.startsWith(`mcp__${namespace}__`)) {
      return `Plugin hub: the plugin that provides "${name}" is disabled.`
    }
  }
  for (const [namespace, instance] of live) {
    if (!name.startsWith(`mcp__${namespace}__`)) continue
    if (authorized.get(instance.pluginId) !== instance.releaseVersion) {
      return `Plugin hub: the release that provides "${name}" is no longer authorized.`
    }
    if (!instance.publicToolNames.has(name)) {
      return `Plugin hub: "${name}" is not in the plugin's approved tool list.`
    }
    return undefined
  }
  return undefined
}
