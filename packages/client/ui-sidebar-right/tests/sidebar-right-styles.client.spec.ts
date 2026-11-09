/** Right sidebar slide and reveal-flash style contracts. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/shell/SidebarRight.module.css', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
const host = String.raw`:global\(\[data-dockkit-host='dock'\]\)`

describe('SidebarRight.module.css', () => {
  it('starts docked items mounted by an opening at the closed position', () => {
    expect(css).toMatch(new RegExp(String.raw`@starting-style\s*\{\s*\.panel\[data-sidebar-right-opening\] ${host},[^{}]*\{`
      + String.raw`\s*transform: translateX\(var\(--dsh-sidebar-width\)\);\s*}\s*}`))
  })

  it('removes the open slide as well as the close slide for reduced motion', () => {
    expect(css).toMatch(new RegExp(String.raw`@media \(prefers-reduced-motion: reduce\)\s*\{[^{}]*`
      + String.raw`\.panel\[data-sidebar-right-open\] ${host}[^{}]*\{\s*transition: none;\s*}`))
  })

  it('draws the workbench as a bordered surface pane with the prototype tab density', () => {
    // A collapsed workbench keeps its box for the slide but must paint no
    // surface: a closed panel may not cover the conversation or the composer.
    const closed = /\.panel\s*\{([^{}]*)}/.exec(css)?.[1] ?? ''
    expect(closed).not.toMatch(/background:/)
    expect(closed).not.toMatch(/border-left:/)
    const open = /\.panel\[data-sidebar-right-open\]\s*\{([^{}]*)}/.exec(css)?.[1] ?? ''
    expect(open).toMatch(/background: var\(--dsw-alias-bg-layer-1\);/)
    expect(open).toMatch(/border-left: 1px solid var\(--dsw-alias-border-l3\);/)
    const chrome = /\.iconButton\s*\{([^{}]*)}/.exec(css)?.[1] ?? ''
    expect(chrome).toMatch(/width: 24px;/)
    expect(chrome).toMatch(/height: 24px;/)
    expect(css).toMatch(/\.panel :global\(\[data-dockkit-tab\]\)\s*\{\s*font-size: 12px;\s*}/)
  })

  it('slides the workbench domain bar with the docked content instead of leaving it over the conversation', () => {
    const slot = /\.workbenchBarSlot\s*\{([^{}]*)}/.exec(css)?.[1] ?? ''
    expect(slot).toMatch(/transform: translateX\(var\(--dsh-sidebar-width\)\);/)
    expect(slot).toMatch(/visibility: hidden;/)
    const openSlot = /\.panel\[data-sidebar-right-open\]\s+\.workbenchBarSlot\s*\{([^{}]*)}/.exec(css)?.[1] ?? ''
    expect(openSlot).toMatch(/transform: none;/)
    expect(openSlot).toMatch(/visibility: visible;/)
  })

  it('draws the reveal glow inside a docked pane above sticky code banners, and outside a floating panel over its own shadow', () => {
    const pane = String.raw`\.panel :global\(\[data-dockkit-pane\]\[data-sidebar-right-flash\]\)`
    const float = String.raw`\.panel :global\(\[data-dockkit-float\]\[data-sidebar-right-flash\]\)`
    const layer = new RegExp(String.raw`${pane}::after\s*\{([^{}]*)}`).exec(css)?.[1] ?? ''
    expect(layer).toMatch(/content: '';\s*position: absolute;\s*inset: 0;\s*z-index: 7;\s*pointer-events: none;/)
    expect(layer).toMatch(/--sidebar-right-flash-from:\s*inset /)
    expect(css).toMatch(new RegExp(String.raw`${pane}\s*\{\s*position: relative;\s*}`))
    const panel = new RegExp(String.raw`${float}\s*\{(\s*--sidebar-right-flash-from[^{}]*)}`).exec(css)?.[1] ?? ''
    expect(panel).toMatch(/--sidebar-right-flash-from:\s*var\(--dsw-elevation-prominent\),/)
    expect(panel).toMatch(/--sidebar-right-flash-to:\s*var\(--dsw-elevation-prominent\),/)
  })
})
