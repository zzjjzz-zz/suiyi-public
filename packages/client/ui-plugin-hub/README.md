---
description: "Business plugin center of the Suiyi web client: search the administrator-approved catalog, read a plugin's approved tools, confirm permissions, and add, disable, or remove this account's authorization."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-plugin-hub

English | [中文](README.zh.md)

## Summary

The **Plugin center** lists the plugins an administrator approved for the signed-in account and keeps internal Host bundles, loader rows, high-privilege tooling, and generative UI out of the Suiyi product surface. Search and category filters lead to cards showing artwork, release version, risk, and approved-tool count. A detail dialog explains the approved capabilities and permissions; adding requires explicit consent, and an added plugin can be enabled, disabled, or removed. The page reads only the Host's typed `pluginHub` Remote and shows an honest unavailable state when the catalog is not configured.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open **Plugin center** in the sidebar, or select its tab on the upstream Plugins page outside the Suiyi build. The page title and subtitle read **Plugin center** and **View the plugins available to this account**. The two tabs are **All plugins** and **Added**, whose count reflects authorized rows. Search sits on the same line as the tabs; the refresh control is an icon button with a tooltip. Category buttons follow the catalog order and end with **All**. The result line counts the shown cards and names the current account.

Cards follow the prototype's three-column grid at wide widths, two columns below 1100px, and one column below 640px. Each card shows the published artwork or the shared default, the category and approved-tool count, the release version, and lifecycle actions. A card that is not added shows its risk classification; an added card shows **Disabled**, **Enabled**, **Adding**, or **Needs retry**. A failed instance or failed action shows **Needs retry** and its sanitized Host detail. Hover elevation applies only to a hover-capable pointer, and every card action, category, tab, and dialog close control keeps a visible focus ring.

Selecting the title or **View permissions** opens the plugin dialog. It shows the administrator-approved catalog source, current state, risk level, identity scope, account scope, and server-enforced authorization. The facts are followed by the approved capabilities, the permission descriptions for those tools, and a note that the server enforces them. An added plugin offers **Disable** or **Enable** plus **Remove plugin**; a plugin that is not added offers **Review permissions and add**.

Adding opens a permission confirmation dialog. It repeats the approved tools and their descriptions, explains that the server enforces authorization, and keeps **Add plugin** disabled until the consent checkbox is selected. The Host call starts after confirmation; the card shows the adding state and then the Host's added-but-disabled, connected, or failed state. An added row that is not active shows the **Disabled** state and an **Enable** action; an active row shows **Disable**. Removing opens a separate confirmation and then withdraws authorization.

The independent center is registered in the Suiyi build even while the Host has not enabled the catalog, so the page can explain that state and offer **Check again**. Other builds keep the upstream rule that a disabled hub exposes no entry. The optional Plugins page tab exists only outside Suiyi and only while the Host reports the hub enabled.

An authorized failed instance keeps **Retry** and **Disable** so its approval can be withdrawn. A failed cleanup shows **Cleanup failed** and **Retry cleanup**; that action never grants authorization or adds the plugin again.

### Empty, loading, and error states

The first read renders four card skeletons. A disabled catalog replaces the grid with its explanation and **Check again**. An enabled catalog with no published rows shows **No plugins available** and a refresh action. A first-read failure names the Host reason with **Retry**; a later refresh failure keeps the shown catalog and adds a retry notice above it.

### Narrow screens and long text

The page keeps the frame's top clearance and 20px inline insets on a narrow screen. Cards stack in one column, dialogs keep their permission lists scrollable, long names and descriptions wrap, and the card description clamps to two lines. The search field takes a 16px face under a coarse pointer so iOS Safari does not zoom the page.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Registration

The sidebar entry uses the prototype’s layered outline at the size supplied by the sidebar.

The browser plugin contributes the dictionaries and a controller. In the Suiyi build (`DSH_CLIENT_BUILD_PROFILE=suiyi`) it registers the `sidebar.panellist` entry and the `plugin-hub` main panel for the plugin's lifetime; outside that build both exist exactly while the Host reports the hub enabled, and an optional `plugins.tab` entry is registered alongside them. The plugin injects `remote.pluginHub`, so its fiber parks until the Host contributes that namespace.

### State and reads

`PluginHubController` publishes one snapshot store. The plugin reads the catalog once on load and `ensure()` stays idempotent. `reload()` repeats a failed read; `refresh()` asks the Host to reconcile the published catalog and is ignored while another read runs. Only the latest read of the connection generation publishes, so an answer from before a reset is dropped. A failed read keeps the last snapshot and publishes a localized failure notice with the sanitized Host message. Live `watch` frames update the same store.

### Lifecycle actions

One operation per plugin runs at a time. The permission-confirmation flow calls `add(pluginId)`; an added row calls `enable(pluginId)` or `disable(pluginId)`; **Remove** calls `removeInstance(pluginId)`. The controller uses the generated typed `pluginHub` Remote directly, reads `added` from each instance, and has no browser-side compatibility fallback. Success re-reads the catalog so an added-but-disabled or connecting instance appears without another upstream refresh. Failure keeps the row state and offers a retry of the same operation. A connection reset clears in-flight actions and their failures, and a late answer from the previous generation is dropped.

### Seam ownership

`src/client/contract.ts` imports the Host-owned `/types` declarations and reads `ctx.remote.pluginHub` from the generated Client Remote assembly. Published artwork accepts only `http(s)` and `data:image/` sources with `referrerpolicy="no-referrer"`, and every Host message shown is the sanitized failure message. The page never reads credentials or platform configuration.

</details>

-----

<a id="model-experience"></a>
## Model Experience

### Plugin tools enabled through the Host

#### What the model sees

No text from this package. Enabling a catalog plugin asks the Host's `pluginHub` Remote to mount the approved MCP tools; the Host and plugin own their schemas and results.

#### Token effect

No direct tokens. Enabled tools add their schemas and results through the Host on later requests.

#### KV Cache effect

None from this package. Adding, removing, or replacing a plugin's tools can invalidate the affected prefix through the Host.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Directory membership is Host-owned** — `added`, `add`, `enable`, `disable`, and `removeInstance` come from the typed `pluginHub` Remote. The browser shows and requests those states but never derives or persists a separate installation record.
- **Whole catalog reads** — the center lists every visible plugin the Host returns and filters locally; there is no paged or server-side search.
- **Catalog availability gates the data** — an unconfigured or disabled hub explains itself instead of showing sample plugins. No business data is fabricated in the browser.
- **Host owns approval and enforcement** — the browser directory and the action states are not authorization. The administrator approves the catalog and the server enforces the tool calls.
- **Wire strings shown verbatim** — category names and tool descriptions are Host-owned declarations, so they appear as published rather than being translated.
- **The Suiyi build has no internal bundle manager** — `ui-plugin-manager` returns without registering under `DSH_CLIENT_BUILD_PROFILE=suiyi`; built-in Host bundles and rows are managed through the profile, not this page.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The component suite renders the catalog, tab, filter, card, detail, permission, added-but-disabled, remove, loading, disabled, empty, and failure states with a snapshot store. The browser-plugin suite covers the Suiyi center registration and the upstream enablement-gated tab. The controller suite covers read ordering, late settlements, retries, disposal, and the typed add/enable/disable/remove path. The stylesheet suite checks hover-capable pointers, the three-to-two-to-one grid, wrapping, focus rings, token-only colors, and reduced motion.

The host dependency is `@deepseek-ai/dsh-plugin-hub-client` plus its `pluginHub` Remote namespace, already wired into the Web application bundle. Without that service the plugin fiber stays pending and no center appears; the coordinator owns boot composition and the Host service configuration.

</details>
