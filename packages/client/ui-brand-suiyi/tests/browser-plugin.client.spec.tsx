// @vitest-environment jsdom
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as themeApply, inject as themeInject, ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { apply, inject } from '../src/client/index.ts'
import { SuiyiBrandMark, SuiyiBrandName } from '../src/client/Brand.tsx'
import { NS } from '../src/client/locales.ts'
import { SUIYI_TOKENS } from '../src/client/tokens.ts'
import { apply as hostApply } from '../src/index.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const HOLES = ['sidebar.brand.mark', 'sidebar.brand.name'] as const

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

describe('suiyi browser-brand plugin', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares the slot, locale, and theme services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'theme'])
  })

  it('leaves other profiles untouched: no occupants and no token layer', async () => {
    for (const profile of ['local', 'official', ''] as const) {
      vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', profile)
      const subject = await bench()
      const theme = subject.ctx.get('theme') as ThemeRuntime
      const fiber = brandFiber(subject.ctx)
      try {
        await fiber.await()
        for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(0)
        expect(theme.getTheme().active.tokens['--dsw-alias-brand-primary']).toBeUndefined()
      } finally {
        await fiber.dispose()
      }
    }
  })

  it('fills both slots and stacks the token layer only under the suiyi profile', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'suiyi')
    const subject = await bench()
    const theme = subject.ctx.get('theme') as ThemeRuntime
    const fiber = brandFiber(subject.ctx)
    try {
      await fiber.await()
      for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(1)
      expect(theme.getTheme().active.tokens['--dsw-alias-brand-primary']).toBe('#4285f4')
      theme.setTheme('dark')
      expect(theme.getTheme().active.tokens['--dsw-alias-brand-primary']).toBe('#8ab4f8')
    } finally {
      await fiber.dispose()
    }
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(0)
    expect(theme.getTheme().active.tokens['--dsw-alias-brand-primary']).toBeUndefined()
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

  it('exposes exactly the declared blue-cyan glass tokens with both palette modes', () => {
    expect(Object.keys(SUIYI_TOKENS)).toEqual([
      '--dsw-alias-bg-base',
      '--dsw-alias-bg-layer-1',
      '--dsw-alias-bg-layer-2',
      '--dsw-alias-bg-overlay',
      '--dsw-alias-border-l1',
      '--dsw-alias-border-l2',
      '--dsw-alias-brand-primary',
      '--dsw-alias-label-primary',
      '--dsw-alias-label-secondary',
      '--dsw-alias-state-error-primary',
      '--dsw-alias-state-idle-primary',
      '--dsw-alias-state-success-primary',
      '--dsw-alias-state-warn-primary',
      '--dsw-specific-sidebar-fill',
    ])
    for (const modes of Object.values(SUIYI_TOKENS)) {
      expect(Object.keys(modes).sort()).toEqual(['dark', 'light'])
    }
    expect(SUIYI_TOKENS['--dsw-alias-brand-primary']).toEqual({ light: '#4285f4', dark: '#8ab4f8' })
  })

  it('renders the two-line wordmark and the mark from both requested sizes', async () => {
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
      expect(wordmark?.querySelector('.dsh-suiyi-name-hanzi')?.textContent).toBe('遂意')
      expect(wordmark?.querySelector('.dsh-suiyi-name-roman')?.textContent).toBe('S U I Y I')
      expect(wordmark?.querySelector('.dsh-suiyi-name-roman')?.getAttribute('aria-label')).toBe('遂意的汉语拼音')
      name.unmount()

      const mark = render(<SuiyiBrandMark size={34} t={t} />)
      const svg = mark.container.querySelector('svg')
      expect(svg?.getAttribute('width')).toBe('34')
      expect(svg?.getAttribute('role')).toBe('img')
      expect(svg?.getAttribute('aria-label')).toBe('遂意')
      expect(svg?.querySelectorAll('linearGradient')).toHaveLength(3)
      mark.rerender(<SuiyiBrandMark size={24} t={t} />)
      expect(mark.container.querySelector('svg')?.getAttribute('width')).toBe('24')
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
      expect(t('name.roman')).toBe('S U I Y I')
      expect(t('name.romanLabel')).toBe('Suiyi pinyin')
      locale.setLocale('zh')
      expect(t('mark.label')).toBe('遂意')
      expect(t('name.hanzi')).toBe('遂意')
      expect(t('name.romanLabel')).toBe('遂意的汉语拼音')
    } finally {
      await fiber.dispose()
    }
  })
})
