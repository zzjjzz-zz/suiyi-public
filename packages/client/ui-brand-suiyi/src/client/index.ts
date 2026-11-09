/**
 * Suiyi build identity: the `suiyi`-gated brand occupants (sidebar, blank-home
 * hero, and Assistant reply mark), the blue-cyan glass alias-token layer over
 * the active theme, and the body scope that turns on the Noto Sans SC
 * typography and ambient scene.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
// Type-only: pulls the theme service merge (ctx.theme).
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { SuiyiAssistantMark, SuiyiBrandMark, SuiyiBrandName, SuiyiHeroMark } from './Brand.tsx'
import { installBrandScope } from './scope.ts'
import { installBrandScene } from './scene.ts'
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
 * Fill the Suiyi brand slots, mark the body as a Suiyi build, and stack the
 * blue-cyan glass token layer. Every effect belongs to this plugin's fiber, so
 * a profile change or teardown restores the official identity and the
 * declaring surfaces' own fallbacks.
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
  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.mark', locale: NS }, SuiyiHeroMark))
  ctx.slots.inject('conversation.chat.assistant.mark', () =>
    ctx.slots.register({ name: 'conversation.chat.assistant.mark', locale: NS }, SuiyiAssistantMark))
  ctx.slots.inject('conversation.chat.waiting.mark', () =>
    ctx.slots.register({ name: 'conversation.chat.waiting.mark', locale: NS }, SuiyiAssistantMark))
  ctx.effect(() => ctx.theme.overrideTokens('suiyi-brand', SUIYI_TOKENS), 'ui-brand-suiyi: token layer')
  installBrandScope(ctx)
  installBrandScene(ctx)
}
