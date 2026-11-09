/** The brand identity contract exposes one neutral default for every profile. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseRules } from './stylesheet-scan.ts'

const css = readFileSync(new URL('../src/styles/brand-identity.css', import.meta.url), 'utf8')
const rules = parseRules(css)
const declarations = rules[0]?.declarations ?? []

const CONTRACT = [
  '--dsw-brand-font-family',
  '--dsw-brand-title-weight',
  '--dsw-brand-wordmark-weight',
  '--dsw-brand-wordmark-size',
  '--dsw-brand-wordmark-tracking',
  '--dsw-brand-wordmark-line-height',
  '--dsw-brand-scene-base',
  '--dsw-brand-scene-cyan',
  '--dsw-brand-scene-blue',
  '--dsw-brand-scene-ice',
  '--dsw-brand-scene-veil',
  '--dsw-brand-scene-veil-compact',
  '--dsw-brand-scene-veil-size',
  '--dsw-brand-scene-veil-position',
  '--dsw-brand-scene-veil-size-compact',
  '--dsw-brand-scene-veil-position-compact',
  '--dsw-brand-scene-veil-fade-compact',
  '--dsw-brand-scene-strength',
  '--dsw-brand-scene-strength-compact',
  '--dsw-brand-content-wash',
  '--dsw-brand-page-wash',
  '--dsw-brand-glass-chrome',
  '--dsw-brand-glass-nav',
  '--dsw-brand-glass-toolbar',
  '--dsw-brand-glass-edge',
  '--dsw-brand-glass-shadow',
  '--dsw-brand-accent-ink',
  '--dsw-brand-accent-soft',
  '--dsw-brand-mark-glow',
  '--dsw-brand-composer-fill',
  '--dsw-brand-composer-border',
  '--dsw-brand-composer-shadow',
  '--dsw-brand-composer-focus-fill',
  '--dsw-brand-composer-focus-border',
  '--dsw-brand-composer-focus-shadow',
  '--dsw-brand-composer-placeholder-color',
  '--dsw-brand-shortcut-fill',
  '--dsw-brand-shortcut-border',
  '--dsw-brand-shortcut-radius',
  '--dsw-brand-shortcut-radius-compact',
  '--dsw-brand-shortcut-shadow',
  '--dsw-app-frame-fill',
] as const

/** Value of one contract token in the single declaring rule. */
function value(name: string): string | undefined {
  return declarations.find(([property]) => property === name)?.[1]
}

describe('brand identity contract', () => {
  it('declares the whole contract once on body, where the user font list lives', () => {
    expect(rules).toHaveLength(1)
    expect(rules[0]?.selectors).toEqual(['body'])
    expect(declarations.map(([name]) => name).sort()).toEqual([...CONTRACT].sort())
  })

  it('keeps the official typography as the implicit default', () => {
    expect(value('--dsw-brand-font-family')).toBe('var(--dsw-font-family)')
    expect(value('--dsw-brand-title-weight')).toBe('600')
    expect(value('--dsw-brand-wordmark-weight')).toBe('600')
    expect(value('--dsw-brand-wordmark-size')).toBe('17px')
    expect(value('--dsw-brand-wordmark-tracking')).toBe('0.08em')
    expect(value('--dsw-brand-wordmark-line-height')).toBe('1.1')
  })

  it('leaves the stock surface and material untouched until a brand overrides them', () => {
    expect(value('--dsw-brand-scene-base')).toBe('var(--dsw-alias-bg-base)')
    expect(value('--dsw-brand-content-wash')).toBe('var(--dsw-alias-bg-base)')
    expect(value('--dsw-brand-page-wash')).toBe('var(--dsw-alias-bg-base)')
    expect(value('--dsw-brand-scene-cyan')).toBe('transparent')
    expect(value('--dsw-brand-scene-blue')).toBe('transparent')
    expect(value('--dsw-brand-scene-ice')).toBe('transparent')
    expect(value('--dsw-brand-scene-veil')).toBe('transparent')
    expect(value('--dsw-brand-scene-veil-compact')).toBe('transparent')
    expect(value('--dsw-brand-scene-veil-size')).toBe('43% 39%')
    expect(value('--dsw-brand-scene-veil-position')).toBe('58% 33%')
    expect(value('--dsw-brand-scene-veil-size-compact')).toBe('80% 35%')
    expect(value('--dsw-brand-scene-veil-position-compact')).toBe('50% 30%')
    expect(value('--dsw-brand-scene-veil-fade-compact')).toBe('82%')
    expect(value('--dsw-brand-scene-strength')).toBe('1')
    expect(value('--dsw-brand-scene-strength-compact')).toBe('1')
    expect(value('--dsw-brand-glass-chrome')).toBe('var(--dsw-alias-bg-layer-1)')
    expect(value('--dsw-brand-glass-nav')).toBe('var(--dsw-specific-sidebar-fill)')
    expect(value('--dsw-brand-glass-toolbar')).toBe('var(--dsw-alias-bg-layer-1)')
    expect(value('--dsw-brand-glass-edge')).toBe('var(--dsw-alias-border-l1)')
    expect(value('--dsw-brand-glass-shadow')).toBe('transparent')
    expect(value('--dsw-brand-accent-ink')).toBe('var(--dsw-alias-state-business-primary)')
    expect(value('--dsw-brand-accent-soft')).toBe('var(--dsw-alias-state-business-tertiary)')
    expect(value('--dsw-brand-mark-glow')).toBe('transparent')
    expect(value('--dsw-app-frame-fill')).toBe('var(--dsw-alias-bg-base)')
    expect(value('--dsw-brand-composer-fill')).toContain('linear-gradient')
    expect(value('--dsw-brand-composer-border')).toContain('0.5px solid')
    expect(value('--dsw-brand-composer-shadow')).toContain('inset 0 1px')
    expect(value('--dsw-brand-composer-placeholder-color')).toBe('var(--dsw-alias-label-caption)')
    expect(value('--dsw-brand-shortcut-radius')).toBe('999px')
    expect(value('--dsw-brand-shortcut-radius-compact')).toBe('999px')
    expect(value('--dsw-brand-shortcut-shadow')).toBe('none')
  })

  it('carries no literal palette value that a brand could inherit by accident', () => {
    for (const [name, declared] of declarations) {
      expect(declared, name).not.toMatch(/#[0-9a-f]{3,8}\b|(?:rgb|hsl|oklch|lab)\(/i)
    }
  })
})
