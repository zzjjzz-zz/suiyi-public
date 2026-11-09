// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as themeApply, inject as themeInject, ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { apply, inject } from '../src/client/index.ts'
import { SuiyiAssistantMark, SuiyiBrandMark, SuiyiBrandName, SuiyiHeroMark } from '../src/client/Brand.tsx'
import { NS } from '../src/client/locales.ts'
import { SUIYI_TOKENS } from '../src/client/tokens.ts'
import { BRAND_SCOPE_ATTRIBUTE, BRAND_SCOPE_VALUE } from '../src/client/scope.ts'
import { apply as hostApply } from '../src/index.ts'

afterEach(() => {
  cleanup()
  document.body.querySelectorAll('.dsh-suiyi-scene').forEach((node) => { node.remove() })
  document.body.removeAttribute(BRAND_SCOPE_ATTRIBUTE)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const HOLES = [
  'sidebar.brand.mark',
  'sidebar.brand.name',
  'conversation.hero.brand.mark',
  'conversation.chat.assistant.mark',
] as const

/** Read one token's two palette modes; the fixture must declare it. */
function modesOf(name: string): { light: string; dark: string } {
  const modes = SUIYI_TOKENS[name]
  if (modes === undefined) throw new Error(`missing brand token ${name}`)
  return modes
}

/** Package tests directory; jsdom replaces the global URL, so resolve paths by name. */
const HERE = dirname(fileURLToPath(import.meta.url))

/** Remote stand-in: ui-theme subscribes only to forwarded settings events. */
class StubRemote extends Service {
  constructor(ctx: Context) { super(ctx, 'remote') }
  $on(): () => void { return () => {} }
}

async function bench(declare = true) {
  const ctx = new Context()
  const slotsFiber = ctx.plugin(SlotRegistry)
  ctx.provide('locale', new LocaleRuntime(ctx))
  new StubRemote(ctx)
  const scope = stubConfigForm().scope
  ctx.provide('configForms', { get: () => scope } as never)
  await ctx.plugin({ inject: themeInject, apply: themeApply }).await()
  await slotsFiber.await()
  const slots = ctx.get('slots') as SlotRegistry
  const declareHoles = () => slots.register({
    name: 'root',
    children: Object.fromEntries(HOLES.map(name => [name, { kind: 'single', scope: 'root' }])),
  } as never, () => null)
  const disposeHoles = declare ? declareHoles() : undefined
  return { ctx, slots, declareHoles, disposeHoles }
}

const brandFiber = (ctx: Context) => ctx.plugin({ inject: [...inject], apply })

const TOKENS = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-module-platform',
  '--dsw-alias-bg-overlay',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-switch-thumb',
  '--dsw-brand-switch-on',
  '--dsw-alias-brand-primary',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-label-tertiary',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-state-idle-primary',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-state-warn-primary',
  '--dsw-specific-sidebar-fill',
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
  '--dsw-app-frame-fill',
  '--dsw-brand-composer-fill',
  '--dsw-brand-composer-border',
  '--dsw-brand-composer-shadow',
  '--dsw-brand-composer-focus-fill',
  '--dsw-brand-composer-focus-border',
  '--dsw-brand-composer-focus-shadow',
  '--dsw-brand-composer-material-content',
  '--dsw-brand-composer-sheen',
  '--dsw-brand-composer-inner-border',
  '--dsw-brand-composer-inner-shadow',
  '--dsw-brand-composer-placeholder-color',
  '--dsw-brand-shortcut-fill',
  '--dsw-brand-shortcut-border',
  '--dsw-brand-shortcut-radius',
  '--dsw-brand-shortcut-radius-compact',
  '--dsw-brand-shortcut-shadow',
  '--dsw-brand-mark-wing-1',
  '--dsw-brand-mark-wing-2',
  '--dsw-brand-mark-wing-3',
  '--dsw-brand-mark-wing-4',
  '--dsw-brand-mark-wake-1',
  '--dsw-brand-mark-wake-2',
  '--dsw-brand-mark-wake-3',
  '--dsw-brand-mark-wake-4',
  '--dsw-brand-mark-glow',
] as const

describe('suiyi browser-brand plugin', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares the slot, locale, and theme services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'theme'])
  })

  it('leaves other profiles untouched: no occupants, token layer, or brand scope', async () => {
    for (const profile of ['local', 'official', ''] as const) {
      vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', profile)
      const subject = await bench()
      const theme = subject.ctx.get('theme') as ThemeRuntime
      const fiber = brandFiber(subject.ctx)
      try {
        await fiber.await()
        for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(0)
        expect(theme.getTheme().active.tokens['--dsw-alias-brand-primary']).toBeUndefined()
        expect(document.body.getAttribute(BRAND_SCOPE_ATTRIBUTE)).toBeNull()
        expect(document.body.querySelector('.dsh-suiyi-scene')).toBeNull()
      } finally {
        await fiber.dispose()
      }
    }
  })

  it('fills every brand slot, stacks the token layer, and scopes the body only under the suiyi profile', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'suiyi')
    const subject = await bench()
    const theme = subject.ctx.get('theme') as ThemeRuntime
    const fiber = brandFiber(subject.ctx)
    try {
      await fiber.await()
      for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(1)
      expect(document.body.getAttribute(BRAND_SCOPE_ATTRIBUTE)).toBe(BRAND_SCOPE_VALUE)
      expect(document.body.querySelector('.dsh-suiyi-scene')).not.toBeNull()
      expect(theme.getTheme().active.tokens['--dsw-alias-brand-primary']).toBe('#2678ed')
      expect(theme.getTheme().active.tokens['--dsw-brand-wordmark-weight']).toBeUndefined()
      theme.setTheme('dark')
      expect(theme.getTheme().active.tokens['--dsw-alias-brand-primary']).toBe('#7bb5ff')
      expect(theme.getTheme().active.tokens['--dsw-brand-scene-base']).toBe('#061122')
    } finally {
      await fiber.dispose()
    }
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(0)
    expect(theme.getTheme().active.tokens['--dsw-alias-brand-primary']).toBeUndefined()
    expect(document.body.getAttribute(BRAND_SCOPE_ATTRIBUTE)).toBeNull()
    expect(document.body.querySelector('.dsh-suiyi-scene')).toBeNull()
  })

  it('restores a previously set brand scope attribute', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'suiyi')
    document.body.setAttribute(BRAND_SCOPE_ATTRIBUTE, 'previous')
    const subject = await bench()
    const fiber = brandFiber(subject.ctx)
    try {
      await fiber.await()
      expect(document.body.getAttribute(BRAND_SCOPE_ATTRIBUTE)).toBe(BRAND_SCOPE_VALUE)
    } finally {
      await fiber.dispose()
    }
    expect(document.body.getAttribute(BRAND_SCOPE_ATTRIBUTE)).toBe('previous')
  })

  it('fills declarations before or after apply and removes every occupant on teardown', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'suiyi')
    const before = await bench()
    const fiber = brandFiber(before.ctx)
    await fiber.await()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(1)

    before.disposeHoles?.()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(0)
    before.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(1)

    await fiber.dispose()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(0)

    const after = await bench(false)
    const lateFiber = brandFiber(after.ctx)
    await lateFiber.await()
    for (const hole of HOLES) expect(after.slots.entries(hole)).toHaveLength(0)
    after.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(after.slots.entries(hole)).toHaveLength(1)
    await lateFiber.dispose()
    for (const hole of HOLES) expect(after.slots.entries(hole)).toHaveLength(0)
  })

  it('exposes exactly the prototype glass palette with both palette modes', () => {
    expect(Object.keys(SUIYI_TOKENS)).toEqual([...TOKENS])
    for (const [name, modes] of Object.entries(SUIYI_TOKENS)) {
      expect(Object.keys(modes).sort(), name).toEqual(['dark', 'light'])
    }
    expect(SUIYI_TOKENS['--dsw-alias-bg-base']).toEqual({
      light: 'rgba(249, 252, 255, 0.70)',
      dark: 'rgba(8, 22, 43, 0.80)',
    })
    expect(SUIYI_TOKENS['--dsw-specific-sidebar-fill']).toEqual({
      light: 'rgba(242, 249, 255, 0.57)',
      dark: 'rgba(12, 29, 49, 0.64)',
    })
    expect(SUIYI_TOKENS['--dsw-brand-scene-cyan']).toEqual({ light: '#25b7e6', dark: '#1ab1e5' })
    expect(SUIYI_TOKENS['--dsw-brand-scene-blue']).toEqual({ light: '#1f76f6', dark: '#1668f7' })
    expect(SUIYI_TOKENS['--dsw-brand-scene-ice']).toEqual({ light: '#c0f0ff', dark: '#97e0ff' })
    expect(SUIYI_TOKENS['--dsw-brand-scene-veil']).toEqual({
      light: 'rgba(250, 253, 255, 0.44)',
      dark: 'rgba(5, 17, 35, 0.52)',
    })
    expect(SUIYI_TOKENS['--dsw-brand-scene-veil-compact']).toEqual({
      light: 'rgba(250, 253, 255, 0.44)',
      dark: 'rgba(5, 17, 35, 0.45)',
    })
    expect(SUIYI_TOKENS['--dsw-brand-scene-veil-size']).toEqual({ light: '43% 39%', dark: '45% 35%' })
    expect(SUIYI_TOKENS['--dsw-brand-scene-veil-position']).toEqual({ light: '58% 33%', dark: '58% 32%' })
    expect(SUIYI_TOKENS['--dsw-brand-scene-veil-size-compact']).toEqual({ light: '80% 35%', dark: '80% 36%' })
    expect(SUIYI_TOKENS['--dsw-brand-scene-veil-position-compact']).toEqual({ light: '50% 30%', dark: '50% 27%' })
    expect(SUIYI_TOKENS['--dsw-brand-scene-veil-fade-compact']).toEqual({ light: '82%', dark: '86%' })
    expect(SUIYI_TOKENS['--dsw-brand-scene-strength']).toEqual({ light: '0.4472', dark: '0.686' })
    expect(SUIYI_TOKENS['--dsw-brand-scene-strength-compact']).toEqual({ light: '0.387', dark: '0.588' })
    expect(SUIYI_TOKENS['--dsw-brand-page-wash']).toEqual({
      light: 'rgba(249, 252, 255, 0.62)',
      dark: 'rgba(8, 22, 43, 0.68)',
    })

    expect(SUIYI_TOKENS['--dsw-app-frame-fill']).toEqual({ light: 'transparent', dark: 'transparent' })
    expect(modesOf('--dsw-brand-composer-fill').dark).toContain('136deg')
    expect(modesOf('--dsw-brand-composer-border').light).toBe('1px solid rgba(167, 201, 236, 0.6)')
    expect(modesOf('--dsw-brand-composer-shadow').dark).toBe(
      'inset 0 1px rgba(207, 231, 255, 0.18), 0 16px 44px rgba(0, 8, 23, 0.27)')
    expect(modesOf('--dsw-brand-composer-inner-border').dark).toBe('rgba(187, 228, 255, 0.18)')
    expect(modesOf('--dsw-brand-composer-inner-shadow').dark).toBe('inset 1px 0 rgba(194, 235, 255, 0.12)')
    expect(SUIYI_TOKENS['--dsw-brand-shortcut-radius']).toEqual({ light: '19px', dark: '19px' })
    expect(SUIYI_TOKENS['--dsw-brand-shortcut-radius-compact']).toEqual({ light: '13px', dark: '13px' })
    expect(SUIYI_TOKENS['--dsw-brand-composer-placeholder-color']).toEqual({
      light: 'rgba(91, 114, 145, 0.85)',
      dark: 'rgba(165, 191, 220, 0.85)',
    })
    expect(SUIYI_TOKENS['--dsw-brand-shortcut-fill']).toEqual({
      light: 'rgba(255, 255, 255, 0.15)',
      dark: 'rgba(255, 255, 255, 0.15)',
    })
    expect(SUIYI_TOKENS['--dsw-brand-mark-wing-1']).toEqual({ light: '#aaecfa', dark: '#e5feff' })
    expect(SUIYI_TOKENS['--dsw-brand-mark-wake-4']).toEqual({ light: '#79def0', dark: '#9cebf2' })
  })

  it('keeps every brand token the stylesheet consumes resolvable', () => {
    const contract = readFileSync(join(HERE, '../../ui-theme/src/styles/brand-identity.css'), 'utf8')
    const declared = new Set([...contract.matchAll(/(--dsw-brand-[\w-]+):/g)].map(([, name = '']) => name))
    const stylesheet = readFileSync(join(HERE, '../src/client/brand.css'), 'utf8')
    const consumed = new Set([...stylesheet.matchAll(/var\((--dsw-brand-[\w-]+)/g)].map(([, name = '']) => name))
    expect([...consumed].sort()).toEqual(expect.arrayContaining([
      '--dsw-brand-font-family',
      '--dsw-brand-mark-glow',
      '--dsw-brand-scene-base',
      '--dsw-brand-scene-blue',
      '--dsw-brand-scene-cyan',
      '--dsw-brand-scene-ice',
      '--dsw-brand-wordmark-line-height',
      '--dsw-brand-wordmark-size',
      '--dsw-brand-wordmark-tracking',
      '--dsw-brand-wordmark-weight',
    ]))
    for (const name of consumed) expect(declared.has(name), name).toBe(true)
  })

  it('scopes every brand rule to the suiyi body attribute and ports the prototype scene', () => {
    const css = readFileSync(join(HERE, '../src/client/brand.css'), 'utf8')
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).toContain(`body[${BRAND_SCOPE_ATTRIBUTE}='suiyi']`)
    expect(code).not.toMatch(/\bhtml\b/)
    expect(code).not.toMatch(/\bbody\b(?!\[data-dsh-brand)/)
    expect(code).not.toMatch(/\[data-ds-dark-theme\]/)
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b|(?:rgb|hsl|oklch|lab)\(/i)
    // Prototype geometry, not a similar substitute: halo cloud, both ribbons,
    // the veil, and their blur radii and drift durations.
    expect(code).toContain('.dsh-suiyi-halo-cloud')
    expect(code).toContain('.dsh-suiyi-halo-ribbon')
    expect(code).toContain('.dsh-suiyi-halo-ribbon-far')
    expect(code).toContain('.dsh-suiyi-halo-veil')
    expect(code).toContain('blur(28px)')
    expect(code).toContain('blur(24px)')
    expect(code).toContain('blur(31px)')
    expect(code).toContain('rotate(-26deg) scaleY(0.64)')
    expect(code).toContain('rotate(-32deg) scaleY(0.65)')
    expect(code).toContain('24s ease-in-out infinite alternate')
    expect(code).toContain('26s ease-in-out infinite alternate')
    expect(code).toContain('31s ease-in-out infinite alternate')
    expect(code).toContain('prefers-reduced-motion: reduce')
    expect(code).toContain('z-index: -1')
    expect(code).toContain("'Noto Sans SC'")
    expect(code).toContain('--dsw-brand-title-weight: 300')
    expect(code).toContain('--dsw-brand-wordmark-weight: 500')
    expect(code).toContain('[data-global-panel]')
    expect(code).toContain('var(--dsw-brand-page-wash)')
    expect(code).toContain("[data-phase='hero']")
    expect(code).toContain('--dsw-alias-bg-base: transparent')
    expect(code).toContain("[data-phase='active']")
    expect(code).toContain("[data-phase='settling']")
    expect(code).toContain('background: transparent')
    expect(code).toContain('saturate(0.86)')
    expect(code).toContain('opacity: 0.7')
    expect(code).toContain('opacity: 0.65')
    expect(code).toContain('opacity: 0.24')
    expect(code).toContain(':has([data-composer-card]:focus-within)')
    expect(code).toContain('var(--dsw-brand-scene-strength-compact)')
    expect(code).toContain('var(--dsw-brand-scene-veil-compact)')
    expect(code).toContain('var(--dsw-brand-scene-veil-size)')
    expect(code).toContain('var(--dsw-brand-scene-veil-position)')
    expect(code).toContain('var(--dsw-brand-scene-veil-size-compact)')
    expect(code).toContain('var(--dsw-brand-scene-veil-position-compact)')
    expect(code).toContain('var(--dsw-brand-scene-veil-fade-compact)')
    expect(code).not.toContain('--dsw-brand-hero-wash')
  })

  it('runs one prototype thinking drift, the 2.4 s orbit, and the answer settle', () => {
    const css = readFileSync(join(HERE, '../src/client/brand.css'), 'utf8')
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
    // Exactly one drift rule owns the assistant mark; idle marks cannot inherit it.
    expect(code.match(/animation: dsh-suiyi-think 2\.8s ease-in-out infinite/gu)).toHaveLength(1)
    expect(code).toContain('.dsh-suiyi-mark:not([data-assistant]) .dsh-suiyi-ribbon')
    expect(code).toContain('.dsh-suiyi-mark[data-assistant][data-running] .dsh-suiyi-orbit')
    expect(code).toContain('animation: dsh-suiyi-think-orbit 2.4s linear infinite')
    expect(code).toContain('animation: dsh-suiyi-mark-settle 0.5s ease-out both')
    expect(code).toContain('@keyframes dsh-suiyi-think-orbit')
    expect(code).toContain('@keyframes dsh-suiyi-mark-settle')
    expect(code).toContain('transform: scale(1.06)')
    // The orbit stays hidden at rest and under reduced motion.
    expect(code).toMatch(/\.dsh-suiyi-orbit \{[^}]*opacity: 0;/u)
    expect(code).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.dsh-suiyi-orbit \{[^}]*opacity: 0;/u)
  })

  it('paints one ambient scene behind the application and removes it on teardown', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'suiyi')
    const subject = await bench()
    const fiber = brandFiber(subject.ctx)
    try {
      await fiber.await()
      const scenes = document.body.querySelectorAll('.dsh-suiyi-scene')
      expect(scenes).toHaveLength(1)
      const scene = scenes[0]!
      expect(document.body.firstElementChild).toBe(scene)
      expect(scene.getAttribute('aria-hidden')).toBe('true')
      expect(scene.querySelectorAll('.dsh-suiyi-scene-field')).toHaveLength(1)
      expect(scene.querySelectorAll('.dsh-suiyi-halo-cloud')).toHaveLength(1)
      expect(scene.querySelectorAll('.dsh-suiyi-halo-ribbon')).toHaveLength(2)
      expect(scene.querySelectorAll('.dsh-suiyi-halo-ribbon-far')).toHaveLength(1)
      expect(scene.querySelectorAll('.dsh-suiyi-halo-veil')).toHaveLength(1)
    } finally {
      await fiber.dispose()
    }
    expect(document.body.querySelector('.dsh-suiyi-scene')).toBeNull()
  })

  it('renders the single-line wordmark and the five-gradient ribbon mark with its orbit', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'suiyi')
    const subject = await bench()
    const locale = subject.ctx.get('locale') as LocaleRuntime
    const fiber = brandFiber(subject.ctx)
    try {
      await fiber.await()
      locale.setLocale('zh')
      const t = locale.bind(NS)
      const name = render(<SuiyiBrandName t={t} />)
      const wordmark = name.container.querySelector<HTMLElement>('.dsh-suiyi-name')
      expect(wordmark?.tagName).toBe('STRONG')
      expect(wordmark?.textContent).toBe('遂意')
      expect(wordmark?.children).toHaveLength(0)
      name.unmount()

      const mark = render(<SuiyiBrandMark size={34} t={t} />)
      const svg = mark.container.querySelector('svg')
      expect(svg?.getAttribute('width')).toBe('34')
      expect(svg?.getAttribute('role')).toBe('img')
      expect(svg?.getAttribute('aria-label')).toBe('遂意')
      const gradients = [...(svg?.querySelectorAll('linearGradient') ?? [])]
      expect(gradients).toHaveLength(5)
      const ids = gradients.map(gradient => gradient.id)
      expect(new Set(ids).size).toBe(5)
      expect(svg?.querySelectorAll('.dsh-suiyi-orbit')).toHaveLength(1)
      expect(svg?.querySelectorAll('.dsh-suiyi-orbit circle')).toHaveLength(1)
      for (const path of svg?.querySelectorAll('path') ?? []) {
        const fill = path.getAttribute('fill') ?? ''
        const reference = /^url\(#([^)]+)\)$/.exec(fill)?.[1]
        if (reference !== undefined) expect(ids).toContain(reference)
      }
      expect(svg?.querySelectorAll('path')).toHaveLength(5)
      expect(svg?.querySelector('.dsh-suiyi-ribbon')).not.toBeNull()
      const stops = [...(svg?.querySelectorAll('linearGradient') ?? [])]
        .flatMap(gradient => [...gradient.querySelectorAll('stop')])
        .map(stop => stop.getAttribute('stop-color') ?? '')
      expect(stops).toContain('var(--dsw-brand-mark-wing-1)')
      expect(stops).toContain('var(--dsw-brand-mark-wake-4)')
      mark.rerender(<SuiyiBrandMark size={24} t={t} />)
      expect(mark.container.querySelector('svg')?.getAttribute('width')).toBe('24')
    } finally {
      await fiber.dispose()
    }
  })

  it('renders the hero and Assistant marks with the host geometry class and exact size', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'suiyi')
    const subject = await bench()
    const locale = subject.ctx.get('locale') as LocaleRuntime
    const fiber = brandFiber(subject.ctx)
    try {
      await fiber.await()
      locale.setLocale('zh')
      const t = locale.bind(NS)

      const hero = render(<SuiyiHeroMark size={96} className="hero-geometry" t={t} />)
      const heroMark = hero.container.querySelector<SVGElement>('svg')
      expect(heroMark?.getAttribute('width')).toBe('96')
      expect(heroMark?.getAttribute('height')).toBe('96')
      expect(heroMark?.getAttribute('class')).toBe('dsh-suiyi-mark hero-geometry')
      expect(heroMark?.hasAttribute('data-assistant')).toBe(false)
      expect(heroMark?.hasAttribute('data-running')).toBe(false)
      hero.unmount()

      const assistant = render(
        <SuiyiAssistantMark size={32} running className="reply-geometry" t={t} />,
      )
      const assistantMark = assistant.container.querySelector<SVGElement>('svg')
      expect(assistantMark?.getAttribute('width')).toBe('32')
      expect(assistantMark?.getAttribute('class')).toBe('dsh-suiyi-mark reply-geometry')
      expect(assistantMark?.getAttribute('data-assistant')).toBe('')
      expect(assistantMark?.getAttribute('data-running')).toBe('')
      assistant.rerender(<SuiyiAssistantMark size={32} running={false} className="reply-geometry" t={t} />)
      expect(assistant.container.querySelector('svg')?.hasAttribute('data-running')).toBe(false)
      expect(assistant.container.querySelector('svg')?.getAttribute('data-assistant')).toBe('')
    } finally {
      await fiber.dispose()
    }
  })

  it('serves the brand copy through the registered dictionaries of both locales', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'suiyi')
    const subject = await bench()
    const locale = subject.ctx.get('locale') as LocaleRuntime
    const fiber = brandFiber(subject.ctx)
    try {
      await fiber.await()
      locale.setLocale('en')
      const t = locale.bind(NS)
      expect(t('mark.label')).toBe('Suiyi')
      expect(t('name.hanzi')).toBe('Suiyi')
      locale.setLocale('zh')
      expect(t('mark.label')).toBe('遂意')
      expect(t('name.hanzi')).toBe('遂意')
    } finally {
      await fiber.dispose()
    }
  })
})
