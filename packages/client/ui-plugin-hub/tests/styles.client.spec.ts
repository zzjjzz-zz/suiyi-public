/**
 * Plugin center stylesheet rules, asserted against the CSS text on disk.
 *
 * jsdom resolves neither width breakpoints nor `hover`, so these gates read the
 * sheet: hover affordances stay behind a hover-capable pointer, the prototype's
 * three-to-two-to-one card grid remains reachable, permission dialogs keep
 * their fact table, long text wraps, focus stays visible, and every color is a
 * theme token.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/PluginHubSection.module.css', import.meta.url)), 'utf8')
/** Comment bodies blanked, so prose about `:hover` is not read as a rule. */
const rules = css.replace(/\/\*[\s\S]*?\*\//g, text => ' '.repeat(text.length))

/** Every `:hover` state with the media query it sits in, read from the sheet's own blocks. */
function hoverStates(source: string): { line: string; hoverMedia: boolean }[] {
  const stack: (string | null)[] = []
  const found: { line: string; hoverMedia: boolean }[] = []
  for (const token of source.matchAll(/@media[^{]*\{|:hover|\{|\}/g)) {
    const text = token[0]
    if (text === '}') {
      stack.pop()
      continue
    }
    if (text === '{') {
      stack.push(null)
      continue
    }
    if (text.startsWith('@media')) {
      stack.push(text.slice(0, -1))
      continue
    }
    const index = token.index ?? 0
    const start = source.lastIndexOf('\n', index) + 1
    const end = source.indexOf('\n', index)
    found.push({
      line: source.slice(start, end === -1 ? undefined : end).trim(),
      hoverMedia: stack.some(frame => frame !== null && /hover:\s*hover/.test(frame)),
    })
  }
  return found
}

function ruleBody(selector: string): string {
  const start = rules.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`PluginHubSection.module.css has no \`${selector}\` rule`)
  const open = rules.indexOf('{', start)
  return rules.slice(open + 1, rules.indexOf('}', open))
}

describe('plugin center stylesheet', () => {
  it('keeps every hover affordance behind a hover-capable pointer', () => {
    const hovered = hoverStates(rules)
    expect(hovered.length).toBeGreaterThan(0)
    for (const state of hovered) expect({ line: state.line, hoverMedia: state.hoverMedia }).toMatchObject({ hoverMedia: true })
  })

  it('follows the prototype card grid through its two narrower breakpoints', () => {
    expect(ruleBody('.grid')).toContain('repeat(3, minmax(0, 1fr))')
    const wide = /@media \(max-width: 1100px\) \{([\s\S]*?)\n\}/.exec(rules)?.[1]
    expect(wide).toContain('.grid')
    expect(wide).toContain('repeat(2, minmax(0, 1fr))')
    const narrow = /@media \(max-width: 640px\) \{([\s\S]*?)\n\}/.exec(rules)?.[1]
    expect(narrow).toBeDefined()
    expect(narrow).toContain('.grid')
    expect(narrow).toContain('grid-template-columns: 1fr')
    expect(narrow).toContain('.dialogActions > button')
    expect(narrow).toContain('flex: 1')
  })

  it('wraps long descriptions, permission text, and failure details', () => {
    expect(ruleBody('.cardDescription')).toContain('overflow-wrap: anywhere')
    expect(ruleBody('.cardDescription')).toContain('-webkit-line-clamp: 2')
    expect(ruleBody('.dialogDescription')).toContain('overflow-wrap: anywhere')
    expect(ruleBody('.permissions small')).toContain('overflow-wrap: anywhere')
    expect(ruleBody('.cardErrorDetail')).toContain('overflow-wrap: anywhere')
    expect(ruleBody('.panelDescription')).toContain('overflow-wrap: anywhere')
  })

  it('keeps keyboard focus visible on the card, tabs, actions, and dialog close', () => {
    const focus = /\.cardTitle:focus-visible[\s\S]*?\{([\s\S]*?)\}/.exec(rules)?.[1]
    expect(focus).toContain('var(--dsw-focus-ring-width)')
    expect(rules).toContain('.permissionsLink:focus-visible')
    expect(rules).toContain('.category:focus-visible')
    expect(rules).toContain('.tab:focus-visible')
    expect(rules).toContain('.dialogClose:focus-visible')
  })

  it('takes every color from theme tokens', () => {
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/iu)
  })

  it('keeps the prototype page and dialog insets', () => {
    const section = ruleBody('.section')
    expect(section).toContain('max-width: 1280px')
    expect(ruleBody('.page')).toContain('var(--dsh-frame-top-clearance, 0px)')
    const narrow = /@media \(max-width: 767px\) \{([\s\S]*?)\n\}/.exec(rules)?.[1]
    expect(narrow).toContain('.page')
    expect(narrow).toContain('padding-inline: 20px')
    expect(ruleBody('.dialogCard.dialogCard')).toContain('min(590px, calc(100vw - 32px))')
  })

  it('draws neutral separators at the shared hairline weight', () => {
    expect(ruleBody('.facts > div')).toContain('0.5px solid var(--dsw-alias-border-l2)')
    expect(ruleBody('.cardFooter')).toContain('0.5px solid var(--dsw-alias-border-l3)')
  })

  it('honors reduced motion and keeps coarse-pointer fields from zooming', () => {
    const reduce = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(rules)?.[1]
    expect(reduce).toContain('.card')
    expect(reduce).toContain('animation: none')
    const coarse = /@media \(pointer: coarse\) \{([\s\S]*?)\n\}/.exec(rules)?.[1]
    expect(coarse).toContain('font-size: 16px')
  })
})
