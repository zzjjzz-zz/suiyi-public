/**
 * Suiyi brand occupants: the `suiyi`-gated sidebar brand slots plus the
 * blue-cyan glass alias-token layer over the active theme.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the theme service merge (ctx.theme).
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { SuiyiBrandMark, SuiyiBrandName } from './Brand.tsx'
import { SUIYI_TOKENS } from './tokens.ts'
import { en, ja, es, fr, de, ru, pt, zh, NS, type SuiyiKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Suiyi brand artwork copy. */
    suiyi: SuiyiKey
  }
}

/** Required services: the UI slot registry, the locale dictionaries, and the theme runtime. */
export const inject = ['slots', 'locale', 'theme']

/**
 * Fill the Suiyi sidebar artwork and stack the blue-cyan glass token layer.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  if (process.env.DSH_CLIENT_BUILD_PROFILE !== 'suiyi') return
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-brand-suiyi: dictionaries')
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark', locale: NS }, SuiyiBrandMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name', locale: NS }, SuiyiBrandName)
    }))
  ctx.effect(() => ctx.theme.overrideTokens('suiyi-brand', SUIYI_TOKENS), 'ui-brand-suiyi: token layer')
}
