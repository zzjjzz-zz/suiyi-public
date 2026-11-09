---
description: "Suiyi sidebar branding: the fluid ribbon mark, the single-line hanzi wordmark, Noto Sans SC typography, and the blue-cyan glass token layer with its ambient scene."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-suiyi

English | [中文](README.zh.md)

Suiyi controls use the prototype surface and line colours in both themes. Switches keep a white 14 px thumb on a 34 px track, with the same blue enabled fill in both themes.

## Summary

This package gives a `suiyi` client build the Suiyi identity: the prototype's fluid ribbon mark in the sidebar, blank-home hero, while waiting for model output and before each Assistant reply; the single-line Chinese wordmark; the Noto Sans SC text stack with 300-weight titles and a 500-weight wordmark; and one blue-cyan glass token layer with its ambient scene. The shipped Web and Desktop compositions load it by default, and the mutually exclusive build profiles keep the sidebar brand slots single-occupant: this plugin registers only under `suiyi`, while `ui-brand-official` only under `official`. Everything here is browser presentation; nothing reaches a model request.

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

`DSH_CLIENT_BUILD_PROFILE` selects which brand renders. A `suiyi` build shows the Suiyi sidebar mark and wordmark, marks the document body with the `suiyi` brand scope, and stacks the blue-cyan glass token layer; any other value leaves this plugin inert, so the shell fallbacks or the official brand stay in place. The profile is inlined at build time, so exactly one brand plugin occupies the single-occupant sidebar slots in any produced bundle.

### The artwork

The mark is the prototype ribbon: one body stroke and one tail stroke crossing the same silhouette, two white glass highlights, and a wake stroke. The four painted gradients read the `--dsw-brand-mark-wing-*` and `--dsw-brand-mark-wake-*` theme tokens, so the light and dark artwork each keep their prototype stops; the glass highlights are scheme-invariant artwork. The sidebar and hero marks drift through one 7.8 s loop with a glass glimmer. The Assistant reply mark runs a faster thinking drift while its step streams and stays still once the step settles.

The wordmark is a single line — the hanzi 遂意 in Chinese, the product name in other locales — set at 22 px, weight 500, and 0.04 em tracking. The prototype drops the romanization subline, so no second line exists.

Three marks share the artwork. The sidebar slot requests 24 px, the blank-home hero requests 96 px with the hero's own geometry class, and the Assistant reply slot requests 32 px plus `running`; each occupant keeps the host class on the artwork, so the surrounding hover target, reply column, and responsive sizing still apply. An unoccupied slot keeps the declaring surface's own fallback: the sidebar logo, the hero whale, and the reply-column glyph remain for every other profile.

The text stack is Noto Sans SC ahead of Source Han Sans SC, Noto Sans CJK SC, PingFang SC, and Microsoft YaHei. The Noto subsets ship with `ui-theme`, so the family needs no network; a user font list still precedes it. Page titles opt into the 300 weight through the token below.

The conversation composer and blank-home shortcut pills consume the `--dsw-brand-composer-*` and `--dsw-brand-shortcut-*` material tokens: the neutral defaults reproduce the current conversation surfaces, and this profile replaces them with the prototype's gradients, borders, shadows, and radii without any official-profile change.

The token layer re-tints the alias tokens (brand, background, border, label, state, sidebar fill) to the prototype's blue-cyan glass palette, carrying light and dark values. The ambient scene is the prototype's own layer stack, not a similar gradient: a halo cloud, two tilted ribbon rings with their veil, and the same blur radii, transforms, drift curves, and final opacities. The field keeps the reference cascade's opacity (`0.4472` light / `0.686` dark on desktop, `0.387` / `0.588` on compact layouts) and `saturate(0.86)`; the halo cloud, ribbon, and far ribbon sit at `0.7`, `0.65`, and `0.24`, with the veil at `0.52` dark on desktop and `0.45` on compact layouts. A body-level scene element paints it at `z-index: -1`, above the body background and below every application layer, and the plugin removes it on teardown. The scene reads through the application frame, so `--dsw-app-frame-fill` lets this profile clear that frame. The blank home shows this ambient directly — the hero surface rebinds `--dsw-alias-bg-base` to `transparent` — and active conversations clear the root background so the ambient continues behind the session bar and composer; the transcript's horizontal content wash (`--dsw-brand-content-wash`) and the composer fade (`--dsw-brand-scene-base`) are conversation-owned. Global pages keep one wash; a focused composer lifts the halo cloud to full opacity as the prototype does.

### Consuming the identity

Other packages read these tokens instead of copying the Suiyi palette; `ui-theme`'s `brand-identity.css` declares the same names with neutral defaults for every other profile.

| Token | Role |
| --- | --- |
| `--dsw-brand-font-family` | Brand text stack (the wordmark and title surfaces). |
| `--dsw-brand-title-weight` | Page-title weight: 300 in this build. |
| `--dsw-brand-wordmark-weight` / `-size` / `-tracking` / `-line-height` | Wordmark metrics: 500, 22 px, 0.04 em, 1.4. |
| `--dsw-brand-scene-base` / `-cyan` / `-blue` / `-ice` | Ambient scene base colour and the three halo stops. |
| `--dsw-brand-content-wash` | Conversation wash that keeps content legible over the scene. |
| `--dsw-brand-page-wash` | Wash for global pages (plugin centre, settings) over the scene. |
| `--dsw-brand-scene-strength` / `-compact` | Scene-field opacity for desktop and compact layouts. |
| `--dsw-brand-scene-veil` / `-compact` | Veil tint for desktop and compact layouts. |
| `--dsw-brand-scene-veil-size` / `-position` / `-size-compact` / `-position-compact` / `-fade-compact` | Veil geometry for desktop and compact layouts. |
| `--dsw-brand-composer-fill` / `-border` / `-shadow` | Composer card background, border, and outer shadow. |
| `--dsw-brand-composer-focus-fill` / `-focus-border` / `-focus-shadow` | Composer card material while focused. |
| `--dsw-brand-composer-material-content` / `-sheen` / `-inner-border` / `-inner-shadow` | Separate 2px sheen and translucent inner edge, clipped without clipping input overlays. |
| `--dsw-brand-composer-placeholder-color` | Composer placeholder colour; the prototype's muted text at 85% opacity. |
| `--dsw-brand-shortcut-fill` / `-border` / `-radius` / `-radius-compact` / `-shadow` | Blank-home shortcut pills (compact variant below 640 px). |
| `--dsw-brand-glass-chrome` / `-nav` / `-toolbar` / `-edge` / `-shadow` | Glass material for chrome rows, navigation, toolbars, edges, and elevation. |
| `--dsw-brand-accent-ink` / `-soft` | Shared accent pair for navigation selections, settings categories, and workbench labels. |
| `--dsw-brand-mark-glow` | Artwork shadow colour around the mark. |
| `--dsw-app-frame-fill` | Application frame fill; `transparent` here so one ambient scene backs the window. |
| `--dsw-brand-mark-wing-1…4` / `-wake-1…4` | The mark's gradient stops. |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The occupants install as declaration-aware registration sets: each `ctx.slots.inject()` waits on its declaring surface, so a set works whether this row activates before or after the declarer, withdraws when the declaration collapses, and leaves no partial brand mix during HMR. The hero and Assistant marks take their owner types from `ui-conversation` and `ui-chat`; `ui-chat` keeps its Assistant mark owner interface out of its client entry, so that component restates the same fields. The token layer goes through `ctx.effect()` so plugin teardown removes the override layer with it. [`scope.ts`](src/client/scope.ts) sets `data-dsh-brand="suiyi"` on the document body through the same effect mechanism and restores the previous value on teardown; [`brand.css`](src/client/brand.css) selects on that attribute, so a build that loads the bundle yet renders another profile keeps its own font, glass, and background. The stylesheet references only tokens — the colour values live in [`tokens.ts`](src/client/tokens.ts) with both palette modes. The browser half is [`src/client/index.ts`](src/client/index.ts); the node half is an empty Loader seat.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the brand surface is not enough. They move from the slots this package occupies to the shell that renders them.

- [ui-sidebar](../ui-sidebar/README.md) — declares `sidebar.brand.mark` and `sidebar.brand.name` and renders their fallbacks.
- [ui-theme](../ui-theme/README.md) — owns `overrideTokens`, the brand-identity contract, and the offline font stylesheets this package layers onto.
- [ui-brand-official](../ui-brand-official/README.md) — the official brand occupant sharing these slots through profile partitioning.

-----

<a id="model-experience"></a>
## Model Experience

### Browser brand presentation

#### What the model sees

Nothing. The package fills the `sidebar.brand.mark`, `sidebar.brand.name`, `conversation.hero.brand.mark`, and `conversation.chat.assistant.mark`, and `conversation.chat.waiting.mark` slots with browser artwork; it registers no prompt section, tool schema, or model-visible text.

#### Token effect

None. The package adds no request content, so it changes no input or output token count.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define how brand presentation is supplied. They are current package constraints, not a brand-design comparison or a task backlog.

- **One occupant set** — alternative presentation belongs in another Cordis package occupying the same slots.
- **Profile partition is build-time** — the build profile is inlined into the browser bundle, so one bundle carries exactly one brand.
- **Mark size is each slot owner's** — the sidebar requests 24 px, the hero 96 px, and the Assistant reply 32 px; the artwork follows those edges rather than the prototype's 42 px sidebar logo, and the host class carries each surface's geometry.
- **The scene follows the platform background** — macOS Desktop keeps the transparent body its window vibrancy needs, so its frame keeps the platform material.
- **The frame must consume the fill token** — the scene needs AppFrame to paint `--dsw-app-frame-fill` with `var(--dsw-alias-bg-base)` as its fallback; a frame that stays opaque adds a second wash and flattens the scene.
- **Reduced motion is the OS preference** — the prototype's in-app motion switch has no DSH equivalent; the mark and scene follow `prefers-reduced-motion`.
- **The mark interactions stay out** — the prototype's pointer approach and click burst are not reproduced because the mark sits inside the sidebar identity, which is `aria-hidden` and not itself interactive.
- **The browser title is independent** — `DSH_CLIENT_TITLE` selects title text at build time rather than through a UI slot.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The artwork ships in the package: `Brand.tsx` holds the ribbon's five inline vector paths (body, both glass highlights, wake, wake stroke), the orbit ring, and the accessible label; `brand.css` holds the ambient geometry, layer opacities, and motion; `tokens.ts` carries the light/dark palette, glass, and scene values; the `locale/` dictionaries carry the mark and name copy. The ribbon gradients read `--dsw-brand-mark-wing-*` and `--dsw-brand-mark-wake-*`, and the ambient reads the `--dsw-brand-scene-*` contract.

</details>
