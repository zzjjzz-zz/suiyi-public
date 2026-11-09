/**
 * Plugin center, browser half: the business catalog main panel and, outside the
 * Suiyi build, the Plugins page preview tab. Both surfaces list the
 * administrator-approved catalog through the `pluginHub` Remote, show each
 * plugin's release facts and approved tools, and add, disable, or remove this
 * account's authorization after an explicit permission confirmation.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.slots service and the ctx.remote Context merge come from these entries.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: the `plugins.tab` preview declaration and the independent center's own slots.
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { PluginHubController, type PluginHubFace } from './hub-store.ts'
import { PluginHubPanelIcon } from './PluginHubPanelIcon.tsx'
import { PluginHubPanel, PluginHubSection } from './PluginHubSection.tsx'
import { watchCatalog } from './watch-catalog.ts'
import { en, ja, es, fr, de, ru, pt, zh, type PluginHubLocaleKey } from './locales.ts'

export type { PluginHubFace, PluginHubState } from './hub-store.ts'
export type { PluginHubLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Plugin center copy. */
    'pluginHub': PluginHubLocaleKey
  }
}

export type { PluginHubPanelProps, PluginHubSectionProps } from './PluginHubSection.tsx'

/** Dictionary namespace owned by this plugin. */
const NS = 'pluginHub'

/** Main panel and sidebar entry id of the independent center. */
const PANEL_ID = 'plugin-hub' as MainPanelId

/** Services the surfaces read; the Remote namespace parks the fiber until the Host contributes it. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginHub']

/**
 * Register the business center under each build rule and follow live Host
 * enablement. The Suiyi center stays mounted across a disabled catalog; the
 * upstream preview tab exists only while the Host reports the hub enabled.
 * @param ctx - the browser plugin context.
 * @param controller - the catalog controller both surfaces read.
 * @param face - the injected face both registrations serve.
 * @param label - localized panel title.
 * @returns the subscription and registration disposer.
 */
function independentCenter(
  ctx: ClientContext, controller: PluginHubController, face: PluginHubFace, label: () => string,
): () => void {
  // The Suiyi build exposes the plugin center even while the Host has not
  // enabled its catalog, so the page can explain that state; other builds keep
  // the upstream rule that a disabled hub has no entry.
  const suiyi = process.env.DSH_CLIENT_BUILD_PROFILE === 'suiyi'
  let disposeCenter: (() => void) | undefined
  let disposeTab: (() => void) | undefined
  const sync = (): void => {
    const enabled = controller.store.getSnapshot().snapshot?.enabled === true
    const showCenter = suiyi || enabled
    const showTab = enabled && !suiyi
    if (showCenter !== (disposeCenter !== undefined)) {
      if (showCenter) {
        const main = ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: PANEL_ID, locale: NS, inject: () => face,
        }, PluginHubPanel))
        const sidebar = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: PANEL_ID, order: 10, locale: NS, label,
        }, PluginHubPanelIcon))
        disposeCenter = () => { sidebar(); main() }
      } else {
        disposeCenter?.()
        disposeCenter = undefined
      }
    }
    if (showTab !== (disposeTab !== undefined)) {
      if (showTab) {
        disposeTab = ctx.slots.inject('plugins.tab', () => ctx.slots.register({
          name: 'plugins.tab', id: 'hub', order: 20, label, locale: NS, inject: () => face,
        }, PluginHubSection))
      } else {
        disposeTab?.()
        disposeTab = undefined
      }
    }
  }
  sync()
  const unsubscribe = controller.store.subscribe(sync)
  return () => { unsubscribe(); disposeTab?.(); disposeCenter?.() }
}

/**
 * Contribute the business center and keep it current across Host generations.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-plugin-hub: dictionaries')
  const controller = new PluginHubController(ctx)
  ctx.effect(() => () => { controller.dispose() }, 'ui-plugin-hub: controller')
  // A restarted Host serves a fresh catalog; an unrendered tab stays idle.
  ctx.effect(() => ctx.on('connection/reset', () => { controller.connectionReset() }), 'ui-plugin-hub: host generation')
  const face = controller.face()
  const t = ctx.locale.bind(NS)
  ctx.effect(() => independentCenter(ctx, controller, face, () => t('title')), 'ui-plugin-hub: independent center')
  // One read feeds both surfaces; the Suiyi center renders its loading state until it lands.
  face.ensure()
  ctx.effect(() => watchCatalog(ctx.remote, controller), 'ui-plugin-hub: live catalog')
}
