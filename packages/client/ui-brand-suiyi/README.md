---
description: "Suiyi sidebar branding: the ribbon mark, the two-line hanzi wordmark, and the blue-cyan glass token layer."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-suiyi

English | [中文](README.zh.md)

## Summary

This package gives a `suiyi` client build the Suiyi sidebar identity: the ribbon mark, the two-line Chinese wordmark over its romanization, and one blue-cyan glass token layer stacked on the active theme. The shipped Web and Desktop compositions load it by default, and the mutually exclusive build profiles keep the sidebar brand slots single-occupant: this plugin registers only under `suiyi`, while `ui-brand-official` registers only under `official`. Everything here is browser presentation; nothing reaches a model request.

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

The shipped Web and Desktop compositions already mount this plugin. A Suiyi desktop build activates it through its build profile; no configuration is needed and the row accepts none.

### Choosing the profile

`DSH_CLIENT_BUILD_PROFILE` selects which brand renders. A `suiyi` build shows the Suiyi sidebar mark and wordmark and stacks the blue-cyan glass token layer; any other value leaves this plugin inert, so the shell fallbacks or the official brand stay in place. The profile is inlined at build time, so exactly one brand plugin occupies the single-occupant sidebar slots in any produced bundle.

### The artwork

The mark is the Suiyi ribbon: one body stroke and one tail stroke crossing a tilted orbit line, drawn with gradients that reference the theme tokens, so light and dark schemes both stay legible. The name is a two-line wordmark — the hanzi 遂意 over the romanization `S U I Y I`. The token layer re-tints the alias tokens (brand, background, border, label, state, sidebar fill) to the blue-cyan glass palette, again carrying light and dark pairs. The idle drift is the only motion, and the reduced-motion preference disables it.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The two occupants install as one declaration-aware registration set: nested `ctx.slots.inject()` calls wait on the sidebar declaration, so the set works whether this row activates before or after the declarer, withdraws both occupants when the declaration collapses, and leaves no partial brand mix during HMR. The token layer goes through `ctx.effect()` so plugin teardown removes the override layer with it. The mark's gradient stops read `--dsw-alias-brand-primary` and `--dsw-alias-state-idle-primary` instead of fixed colors, so the artwork follows whatever layer stack is active. The browser half is [`src/client/index.ts`](src/client/index.ts); the node half is an empty Loader seat.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the brand surface is not enough. They move from the slots this package occupies to the shell that renders them.

- [ui-sidebar](../ui-sidebar/README.md) — declares `sidebar.brand.mark` and `sidebar.brand.name` and renders their fallbacks.
- [ui-theme](../ui-theme/README.md) — owns `overrideTokens` and the theme token stack this package layers onto.
- [ui-brand-official](../ui-brand-official/README.md) — the official brand occupant sharing these slots through profile partitioning.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define how brand presentation is supplied. They are current package constraints, not a brand-design comparison or a task backlog.

- **One occupant set** — alternative presentation belongs in another Cordis package occupying the same slots.
- **Profile partition is build-time** — the build profile is inlined into the browser bundle, so one bundle carries exactly one brand.
- **The browser title is independent** — `DSH_CLIENT_TITLE` selects title text at build time rather than through a UI slot.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
