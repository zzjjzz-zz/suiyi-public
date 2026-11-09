---
description: "Plugin hub Host client: per-user catalog and MCP access with a verified account token, durable add/enable/disable/remove state, and a pre-dispatch release guard."
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-hub-client

English | [中文](README.zh.md)

## Summary

`dsh-plugin-hub-client` is the Host half of the plugin hub. It validates the platform's frozen V1 catalog and mounts one independent MCP instance per enabled release. Catalog, MCP, and invocation requests carry the verified account's token, so the platform authorizes only that account's rows. The `pluginHub` Remote namespace exposes `catalog`, `refresh`, `watch`, `add`, `enable`, `disable`, and `removeInstance`. Settings keep each account's added and active decisions across restarts, and a pre-dispatch guard plus the hub endpoint revalidate the release authorization.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the service beside `dsh-mcp-manager`, `dsh-tools`, `dsh-settings`, and a credential provider. The hub is off until a deployment opts in.

```yaml
- id: plugin-hub
  name: '@deepseek-ai/dsh-plugin-hub-client'
  inject: [credentials]
  config:
    enabled: true
    platformUrl: https://hub.example.com
    # This account's user access token, resolved per request. Never an
    # installation-wide token.
    authorization: 'Bearer ${credential:SUIYI_USER_ACCESS_TOKEN}'
    # Verified login that owns this profile; issuer and subject come from the
    # validated ID token, never from a username or email.
    identity:
      issuer: https://sso.example.com/realms/identity
      subject: 0d5f3b7e-6f1c-4f7a-9c2d-1f0e8a6b4c31
```

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Explicit opt-in; `false` contacts no platform and mounts nothing |
| `platformUrl` | `''` | Platform origin; required when enabled, must be a bare http(s) origin |
| `authorization` | `''` | Optional static user Authorization value for non-desktop deployments; `${credential:REF}` tokens resolve per request |
| `identity` | absent | Verified `{issuer, subject}` of the logged-in account; required when enabled |
| `refreshIntervalMs` | `60,000` | Catalog poll interval; at least 1,000 ms |
| `requestTimeoutMs` | `15,000` | Deadline for one catalog request |
| `maxCatalogBytes` | `8,388,608` | Largest accepted catalog body |
| `authorizations` | `[]` | Host-managed enablement decisions; written through Settings |

`platformUrl`, `authorization`, and `identity` are not volatile: changing them takes effect at the next plugin load. `authorizations` is volatile because the lifecycle methods write it through Settings, and it is the only field a user surface should edit indirectly through those Remote methods. An enabled hub without `identity` fails activation; while no current user token is available it serves no catalog, mounts nothing, and reports a credential error instead of serving an unbound or installation-wide catalog.

A launcher that already verified the login may omit the `identity` field and set `DSH_SUIYI_IDENTITY_ISSUER` and `DSH_SUIYI_IDENTITY_SUBJECT` in the Host process environment instead; an explicit `identity` wins. Only the launch snapshot's inherited `process` layer is read, so a project or Harness-home `.env` file cannot claim an account.

On the Suiyi desktop, leave `authorization` empty. Electron delivers the verified user access token over its private Node IPC channel to the Host-provided `ctx.suiyiAccess` service; plugin-hub reads the current token for every catalog request and whenever it establishes an MCP connection; replacing the token remounts active instances so subsequent calls use the new one. The token is never placed in the environment, argv, files, logs, Settings, a renderer, or a child process environment. The Host service replaces it after a re-login and clears it on expiry or stop; this package does not refresh it itself.

### Remote methods

`catalog()` returns the last committed catalog without contacting the platform. `refresh()` fetches and validates the catalog with this account's token, prunes decisions for absent or changed releases, then reconciles instances. Both return `{plugins, catalogVersion, instances, enabled}`; `instances` holds one `PluginInstanceView` per catalog row plus every retained mount or cleanup failure, and every view carries `added`.

The lifecycle methods serialize behind every other operation and reject with `plugin-hub/unknown-plugin` when the row is absent from the last committed catalog:

| Method | Durable effect | Runtime effect |
|---|---|---|
| `add(pluginId)` | writes the current release with `enabled: false` | stops any live instance; no tool is registered |
| `enable(pluginId)` | writes or replaces the current release with `enabled: true` | starts the instance; mount failure keeps `enabled: true` and reports `error` |
| `disable(pluginId)` | keeps the row and writes `enabled: false` | stops the instance to quiescence; a failed unmount keeps the visible error |
| `removeInstance(pluginId)` | deletes the row | stops the instance to quiescence; a failed unmount keeps the visible error |

A restart mounts only `enabled: true` rows whose release still matches the catalog. `added: true` with state `disabled` is an added but stopped plugin; `added: false` with state `disabled` was never added or was removed.

`watch(signal)` streams complete catalog and live connection snapshots, coalesces changes, and ends when the subscriber or plugin is disposed. The browser uses the shared Remote stream supervisor for reconnects.

### Security

A Host profile belongs to one verified account. The platform catalog, every MCP connection, and every invocation use that account's verified access token from `ctx.suiyiAccess`; the platform derives subject, organization, roles, grants, and visible rows from the token, and it rechecks authorization at the final upstream call. No installation-wide or administrator token is used as the user credential, and the token never crosses the Remote seam or a child process environment.

`identity` additionally names the account for local storage isolation, and every durable decision stores only its opaque scope (a SHA-256 of the issuer and subject pair). A decision written for another identity is ignored at load and removed from Settings on the first successful refresh. This local scope is not a substitute for the platform's per-user authorization; the backend token remains the authority. The launcher identity binding reads only the inherited process layer, so `.env` files cannot substitute an account. Switching accounts therefore requires a new Host process with the new identity and token; a profile never serves the previous account's catalog or instance tools.

V1 binds one Host to its owner. All Remote methods reject non-owner Peers. Model tools also require an owner-attributed Agent turn: admitted non-owner input blocks that whole turn, later owner steering cannot widen it, and an unattributed Agent is denied. Trusted in-process calls with no Agent remain available for internal integration.

The platform endpoint, the Authorization header, and every credential value stay on the Host. Errors crossing the Remote seam are sanitized to a failure class; `plugin-hub/unavailable` reports `network`, `timeout`, `http`, `unauthorized`, `invalid-response`, or `too-large`, never the URL or a response body. The Host refuses absolute, cross-origin, or off-endpoint `mcpPath` values, and follows no redirects, so a credential cannot be forwarded to another origin.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [identity module](src/identity.ts) validates the configured issuer as a canonical https URL and the subject as a non-empty token, hashes the identity into the scope stored with each decision, and keeps raw identity values out of Settings and diagnostics. The [access contract](src/access.ts) declares the desktop-provided current-token service; the [client](src/client.ts) reads it for each catalog request and sends the resulting user Authorization value and validates the catalog with strict Zod objects, rejects unknown fields and duplicate ids or tool names, derives each public tool name from the frozen tool list, and requires `mcpPath` to equal `/api/v1/plugins/<pluginId>/mcp?releaseVersion=<encodeURIComponent(releaseVersion)>`. The resolved URL must keep the platform origin, the exact endpoint path, and exactly one `releaseVersion` query field. Credential templates resolve per request and are never cached.

The [instance owner](src/instances.ts) mounts one fiber of the same native Cordis adapter type per enabled row; the child only calls `ctx.mcpManager.register`, so mcp-manager still owns the mcp-client transport. Disposing the child waits for the registration effect to unwind, which awaits the MCP instance unmount; a disable reports completion only after its tools are gone, and leftover tools are reported as a cleanup failure instead of a completed disposal. Namespaces hash the complete plugin id into `hub_<20 hex>` and refuse a collision rather than truncating one id into another.

A retired namespace stays denied until a replacement starts successfully. Surviving tool registrations block replacement; a failed mount cannot remove the old denial.

The [guard](src/guard.ts) is registered on `ctx.tools.guard`, so it runs after every `tools/pre-execute` listener and before the tool body. It denies a name whose live namespace is retired, whose live release is no longer authorized, or whose public name is outside the frozen allowed tools. The hub MCP endpoint revalidates authorization on every request, so this guard is defense in depth rather than the only enforcement.

The [service](src/index.ts) serializes catalog refresh, add, enable, disable, removeInstance, restore, and disposal on one queue. A failed refresh leaves the previous catalog and mounted instances untouched. A newer catalog that changed or dropped a release withdraws the old authorization before unmounting, so a queued call cannot run against a stale release. Disposal aborts the in-flight request, drains queued work, and awaits every child instance.

</details>

<a id="further-exploration"></a>
## Further Exploration

- [MCP manager](../mcp-manager/README.md) — owns mcp-client instances, status, and reconnect.
- [MCP client](../mcp-client/README.md) — tool naming, template resolution, and connection lifecycle.
- [Settings](../../settings/settings/README.md) — the volatile configuration writes this package persists through.
- [Credentials](../../credentials/credentials/README.md) — reference resolution and secret storage.
- [Remote call model](../../../docs/api-gateway.md) — how `@Remote` methods cross the Gateway.

<a id="model-experience"></a>
## Model Experience

### Indirect MCP tool contributions

#### What the model sees

The approved tools each enabled instance registers through mcp-client under `mcp__<namespace>__<tool>`, with the frozen release schemas; this package adds no prompt section of its own.

#### Token effect

Conditional: every enabled instance contributes its approved tool schemas to the next request; disabling removes them.

#### KV Cache effect

Replacing when the enabled set or a release's tool schemas change; reuse survives while the set stays unchanged.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits describe what you cannot do with this client today. They are current package constraints, not a task backlog.

- **Origin-only platform URL** — a deployment served under a path prefix is not supported; `platformUrl` must be a bare origin.
- **Guard is defense in depth** — the platform endpoint remains the enforcement point. A tool the endpoint advertises outside `allowedTools` is denied at dispatch but stays advertised until the instance reconnects.
- **Cleanup failure needs a restart** — an MCP instance that cannot confirm transport closure leaves an mcp-manager record that blocks remounting the same namespace until DSH restarts; the UI view reports an error.
- **Release changes require re-enabling** — a new or changed catalog release withdraws the previous authorization instead of silently upgrading; the user enables the current release again.
- **User scope only** — enablement is stored in the profile's Settings document; there is no shared or organization-scoped enablement in this package.
- **Token replacement replaces MCP connections** — the MCP transport keeps the Authorization header it connected with, so a token replacement drops and remounts active instances; catalog reads use the new token immediately. In-flight calls on the old connection are not preserved.
- **Build graph is external** — the controller owns workspace registration, tsconfig aggregates, bundles, and the lockfile; this package only declares its own manifest and project references.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Focused tests live under `tests/`. Run them with the local Vitest binary and without `NODE_USE_ENV_PROXY`, because Node samples that flag before a setup file can clear it. The composition suite boots a real Loader profile with mcp-manager, a keyless platform fixture serving both the catalog and Streamable HTTP MCP, real Settings persistence, and a restart over the same profile.

</details>
