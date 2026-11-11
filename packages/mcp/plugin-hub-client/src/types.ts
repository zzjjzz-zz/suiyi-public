/**
 * Client-facing JSON types of the plugin hub Host Remote namespace.
 * Types only — no runtime code.
 *
 * @module @deepseek-ai/dsh-plugin-hub-client/types
 */

import type {} from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** One frozen published MCP tool as the hub release exposes it. */
export interface PublishedTool {
  /** Raw MCP tool name inside the frozen release. */
  name: string
  /** Tool description frozen with the release. */
  description?: string
  /** JSON input schema frozen with the release. */
  inputSchema: Record<string, JsonValue>
}

/**
 * One authorized catalog row. Every field comes from the platform's strict
 * JSON catalog; `mcpPath` is the same-origin path the Host mounts, never a
 * workload URL or an endpoint the platform did not issue.
 */
export interface CatalogPlugin {
  /** Platform plugin id, `/^[a-z0-9][a-z0-9-]{0,47}$/`. */
  pluginId: string
  /** Opaque ToolHive workload identity; never mounted directly. */
  workloadId: string
  /** Opaque immutable release version. */
  releaseVersion: string
  /** Display name. */
  name: string
  /** Display description. */
  description: string
  /** Optional catalog icon reference. */
  icon?: string
  /** Catalog category. */
  category: string
  /** Tools the release froze for this plugin. */
  allowedTools: PublishedTool[]
  /** Fingerprint of the frozen tool schemas. */
  schemaFingerprint: string
  /** Risk classification the platform assigned. */
  riskLevel: 'low' | 'medium' | 'high'
  /** Visibility the platform assigned. */
  visibility: 'public' | 'roles' | 'private'
  /** Roles the platform allows; empty for non-role visibility. */
  allowedRoles: string[]
  /** Only published rows reach the catalog. */
  status: 'published'
  /** Same-origin MCP path; the Host validates it against the catalog identity. */
  mcpPath: string
}

/**
 * Runtime state of one catalog plugin on this Host. `disabled` means no
 * authorized instance is mounted; `error` carries a sanitized explanation.
 */
export interface PluginInstanceView {
  /** Catalog plugin id. */
  pluginId: string
  /** Release version the view describes. */
  releaseVersion: string
  /** Current instance state. */
  state: 'disabled' | 'connecting' | 'enabled' | 'error'
  /** Whether this Host currently permits calls for this release; false errors require cleanup. */
  authorized: boolean
  /**
   * Whether this account has the plugin in its directory. A `disabled` view
   * with `added: true` was stopped but kept; `added: false` was never added or
   * was removed.
   */
  added?: boolean
  /** Sanitized failure text for `error`; never a credential, upstream URL, or raw upstream diagnostic. */
  error?: string
}

/** Result of `catalog()` and `refresh()`. */
export interface PluginHubCatalog {
  /** Authorized catalog rows in platform order. */
  plugins: CatalogPlugin[]
  /** Opaque catalog generation from the platform. */
  catalogVersion: string
  /** One view per catalog row plus every retained instance failure. */
  instances: PluginInstanceView[]
  /** Whether this Host enabled the hub at all. */
  enabled: boolean
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** V1 Host credentials and lifecycle belong only to this Host's owner. */
    'plugin-hub/owner-required': Record<string, never>
    /** The hub is not enabled in this profile. */
    'plugin-hub/disabled': Record<string, never>
    /** The plugin id is malformed or absent from the current catalog. */
    'plugin-hub/unknown-plugin': { readonly pluginId: string }
    /** A Remote argument does not satisfy the frozen request fields. */
    'plugin-hub/invalid-request': { readonly field: string; readonly reason: string }
    /** The platform catalog could not be read. */
    'plugin-hub/unavailable': {
      readonly reason: 'network' | 'timeout' | 'http' | 'unauthorized' | 'invalid-response' | 'too-large'
    }
    /** A credential template in `authorization` was configured without a credential provider. */
    'plugin-hub/credentials-unavailable': Record<string, never>
    /** A credential reference in `authorization` has no stored value; the reference stays in Host logs. */
    'plugin-hub/credentials-missing': Record<string, never>
    /** Enablement cannot be persisted without Settings and a profile entry. */
    'plugin-hub/settings-unavailable': Record<string, never>
    /** An authorized MCP instance could not be mounted or unmounted cleanly. */
    'plugin-hub/instance-failed': { readonly pluginId: string }
  }
}
