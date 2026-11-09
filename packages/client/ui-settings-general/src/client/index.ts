/**
 * Settings shell and ownerless-copy plugin, browser half: renders the
 * `sidebar.settings` occupant — panel chrome, section navigation, and the
 * onboarding stage — and registers everything on the Settings pages that
 * belongs to no single feature: the trigger/header chrome content,
 * local-document action, General section, `settings` dictionaries, and the
 * Host release change confirmation.
 * Feature-owned rows and sections stay with their features.
 * Export discipline: packages/client/AGENTS.md.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the remoteAccess service merge (ctx.remoteAccess).
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
// Type-only: pulls the ctx.remote merge and its fixed Host facts.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the ctx.modules merge.
import type {} from '@deepseek-ai/dsh-client-modules/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { closeTopModal } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: the settings slot declarations plus the ctx.configForms Context
// merge. Cross-plugin collaboration goes through the service, never a value
// import (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-product-analytics/client'
import type {
  SettingsOnboardingStep, SettingsRootInjected, SettingsSectionRow,
} from './shell-contract.ts'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { createSettingsShellStore } from './shell-store.ts'
import { WelcomeRow, type WelcomeRowInjected } from './WelcomeRow.tsx'
import { SettingsRoot } from './SettingsRoot.tsx'
import { SettingsPage, type SettingsPageInjected } from './SettingsPage.tsx'
import { SuiyiIdentityController } from './suiyi-identity.ts'
import { DesktopSection, type DesktopSectionInjected } from './DesktopSection.tsx'
import type { DesktopSuiyiIdentityBridge } from '../types.ts'
import { DesktopUpdateBadge } from './DesktopUpdateIndicator.tsx'
import type { DesktopUpdateBridge } from '../types.ts'
import { DesktopChannelSource } from './desktop-channel-source.ts'
import { DesktopChannelRow, DesktopChannelToast } from './DesktopChannelRow.tsx'
import { DesktopUpdateSource } from './desktop-update-source.ts'
import { CloseLabel, HeaderContent, TriggerContent } from './chrome.tsx'
import { GeneralSection, type GeneralSectionInjected } from './GeneralSection.tsx'
import { groupGeneralRows, type GeneralGroup } from './general-groups.ts'
import { CurrentVersionRow } from './CurrentVersionRow.tsx'
import { DeveloperToolsRow, type DeveloperToolsRowInjected } from './DeveloperToolsRow.tsx'
import { ReduceMotionRow, type ReduceMotionRowInjected } from './ReduceMotionRow.tsx'
import { installVisualOutputRow } from './visual-output-row.ts'
import { installTurnNotificationRow } from './turn-notification-row.ts'
import {
  GENERAL_SETTINGS_NAMESPACE, ReducedMotionPreference, installReducedMotionPreference, type MotionSettings,
} from './motion-preference.ts'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { SettingsDocumentAction } from './SettingsDocumentAction.tsx'
import type { SettingsDocumentActionInjected } from './SettingsDocumentAction.tsx'
import { SettingsDocumentStore } from './settings-document-store.ts'
import { HostReleasePrompt, type HostReleasePromptInjected } from './HostReleasePrompt.tsx'
import { en, ja, es, fr, de, ru, pt, zh, type SettingsKey } from './locales.ts'

export type {
  CloseLabelProps, HeaderContentProps, TriggerContentProps,
} from './chrome.tsx'
export type {
  GeneralSectionComponentProps, GeneralSectionInjected,
} from './GeneralSection.tsx'
export type { GeneralGroup, GeneralGroupId, GeneralRowIdentity } from './general-groups.ts'
export type { SettingsDocumentActionInjected, SettingsDocumentActionProps } from './SettingsDocumentAction.tsx'
export type { SettingsDocumentState } from './settings-document-store.ts'
export { SettingsDocumentStore } from './settings-document-store.ts'
export type { SettingsKey } from './locales.ts'
export type { ReduceMotionRowInjected } from './ReduceMotionRow.tsx'
export type { VisualOutputRowInjected } from './VisualOutputRow.tsx'
export type { MotionSettings } from './motion-preference.ts'
export type {
  VisualOutputAvailability,
} from './visual-output.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Shell chrome + shell-owned General section copy. */
    settings: SettingsKey
  }
}

/** Dictionary namespace owned by this plugin (shell chrome + General copy). */
const NS = 'settings'

/** Whether this bundle is the Suiyi product client, where internal surfaces stay hidden. */
function isSuiyiBuild(): boolean {
  return process.env.DSH_CLIENT_BUILD_PROFILE === 'suiyi'
}

/**
 * Required services (cordis fiber inject). The target slots are declared by
 * ui-settings' apply, whose activation order relative to this one is NOT
 * constrained; registrations depend on their slots through `slots.inject()`.
 */
export const inject = ['slots', 'locale', 'connection', 'remote', 'remote.settings', 'configForms', 'shortcuts', 'modules', 'remoteAccess', 'layout']

/**
 * Register the `settings` dictionaries, the chrome content, and the General
 * section, each once its slot declaration is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // The Suiyi product client exposes business preferences only; internal
  // coding-view controls stay out of its settings surface.
  if (!isSuiyiBuild()) {
    ctx.slots.inject('settings.general.item', () => ctx.slots.register({
      name: 'settings.general.item', id: 'developer-tools', order: 15, locale: NS,
      inject: (): DeveloperToolsRowInjected => ({
        hooks: { developerTools: ctx.configForms.developerTools.enabled },
        setEnabled: async (enabled) => {
          const settings = ctx.configForms.get<{ enabled: boolean }>('ui-settings')
          const previous = settings.getSnapshot().value?.enabled
          const timestamp = Date.now()
          await ctx.configForms.developerTools.setEnabled(enabled)
          if (previous !== undefined && previous !== enabled && settings.getSnapshot().value?.enabled === enabled) {
            ctx.get('productAnalytics')?.track('code_work_view_toggle', { is_enabled: enabled }, timestamp)
          }
        },
      }),
    }, DeveloperToolsRow))
  }
  // Version information follows the core preferences.
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item', id: 'current-version', order: 100, locale: NS,
  }, CurrentVersionRow))
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-settings-general: dictionaries')
  // General preferences owned by this shell: the generated-output gate and
  // the explicit reduced-motion choice. The gate never executes generated
  // code; it reads the mounted provider's readiness and preference.
  const motionPreference = new ReducedMotionPreference(
    ctx.configForms.get<MotionSettings>(GENERAL_SETTINGS_NAMESPACE),
  )
  installReducedMotionPreference(ctx, motionPreference)
  installVisualOutputRow(ctx)
  installTurnNotificationRow(ctx)
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item', id: 'reduced-motion', order: 12, locale: NS,
    inject: (): ReduceMotionRowInjected => ({
      hooks: { reducedMotion: motionPreference.enabled },
      setReduceMotion: reduceMotion => motionPreference.setReduceMotion(reduceMotion),
    }),
  }, ReduceMotionRow))
  const connection = ctx.get('connection') as ConnectionHandle
  const carrier = (globalThis as typeof globalThis & { dshDesktop?: { protocolVersion: number; updates?: DesktopUpdateBridge } }).dshDesktop
  const desktopUpdate = new DesktopUpdateSource(carrier?.protocolVersion === 1 ? carrier.updates : undefined)
  ctx.effect(() => () => { desktopUpdate.dispose() }, 'ui-settings-general: desktop update carrier')
  const channelBridge = carrier?.protocolVersion === 1 ? carrier.updates?.channels : undefined
  if (channelBridge !== undefined) {
    const channel = new DesktopChannelSource(channelBridge)
    ctx.effect(() => () => { channel.dispose() }, 'ui-settings-general: desktop channel')
    ctx.slots.inject('settings.general.item', () => ctx.slots.register({
      name: 'settings.general.item', id: 'desktop-update-channel', order: 95, locale: NS,
      inject: () => ({ hooks: { channel: channel.store }, select: (value: 'nightly' | 'stable') => channel.select(value) }),
    }, DesktopChannelRow))
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay', id: 'desktop-channel-toast', locale: NS,
      inject: () => ({ hooks: { channel: channel.store },
        dismiss: (sequence: number) => { channel.dismissNotice(sequence) }, openConfiguration: () => { desktopUpdate.open() } }),
    }, DesktopChannelToast))
  }

  ctx.slots.inject('sidebar.toggle.badge', () => ctx.slots.register({
    name: 'sidebar.toggle.badge', locale: NS,
    inject: () => ({ hooks: { desktopUpdate: desktopUpdate.store, connectionState: connection.state } }),
  }, DesktopUpdateBadge))

  // Copy freshness is framework-owned: components read the standard `t`
  // seat, and the nav label is a thunk the owner resolves per render — no
  // locale/change re-registration wiring.
  const t = ctx.locale.bind(NS)
  // The shared ConfigForm mirror updates after document commits and reconnects.
  // The Suiyi product client keeps raw configuration files out of reach.
  const documentController = !isSuiyiBuild() && ctx.remote.$host.isLoopback
    ? new SettingsDocumentStore(ctx, ctx.configForms.describe())
    : undefined
  const documentInjected = documentController === undefined
    ? undefined
    : (): SettingsDocumentActionInjected => ({
      controller: documentController,
      hooks: { snapshot: documentController.store },
    })
  ctx.effect(() => () => { documentController?.dispose() }, 'ui-settings-general: document action directory')
  // The settings shell: this package occupies the sidebar-owned hole and
  // declares the settings slots. Ledger → nav-row projection as an observable
  // source (uSES contract: getSnapshot returns the cached rows until the
  // ledger version moves). Labels may be locale-following thunks, so the cache
  // key includes the locale revision and subscribers ride both sources.
  let rowsVersion = -1
  let rowsRevision = -1
  let rows: readonly SettingsSectionRow[] = []
  let onboardingVersion = -1
  let onboardingSteps: readonly SettingsOnboardingStep[] = []
  const sectionsSource: ObservableSnapshot<readonly SettingsSectionRow[]> = {
    getSnapshot: () => {
      const version = ctx.slots.getVersion('settings.section')
      const revision = ctx.locale.getSnapshot().revision
      if (version !== rowsVersion || revision !== rowsRevision) {
        rowsVersion = version
        rowsRevision = revision
        rows = ctx.slots.entries('settings.section')
          .map(e => ({
            /* v8 ignore next -- list-slot registration requires id (SlotCore rejects an entry without one) */
            id: e.options.id ?? '',
            order: e.options.order ?? 0,
            label: resolveSlotLabel(e.options.label) ?? '',
          }))
          .sort((a, b) => a.order - b.order)
      }
      return rows
    },
    subscribe: (listener) => {
      const offLedger = ctx.slots.subscribe('settings.section', listener)
      const offLocale = ctx.locale.subscribe(listener)
      return () => {
        offLedger()
        offLocale()
      }
    },
  }
  const onboardingSource: ObservableSnapshot<readonly SettingsOnboardingStep[]> = {
    getSnapshot: () => {
      const version = ctx.slots.getVersion('settings.onboarding')
      if (version !== onboardingVersion) {
        onboardingVersion = version
        onboardingSteps = ctx.slots.entries('settings.onboarding')
          .map(e => ({
            /* v8 ignore next -- list-slot registration requires id */
            id: e.options.id ?? '',
            order: e.options.order ?? 0,
          }))
          .sort((a, b) => a.order - b.order)
      }
      return onboardingSteps
    },
    subscribe: listener => ctx.slots.subscribe('settings.onboarding', listener),
  }
  const suiyiBridge = (globalThis as typeof globalThis & {
    dshDesktop?: { suiyiIdentity?: DesktopSuiyiIdentityBridge }
  }).dshDesktop?.suiyiIdentity
  const openSuiyiWelcome = suiyiBridge?.openWelcome
  if (isSuiyiBuild()) ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item', id: 'welcome', order: 101, locale: NS,
    inject: (): WelcomeRowInjected => ({
      openWelcome: openSuiyiWelcome === undefined ? undefined : () => openSuiyiWelcome.call(suiyiBridge),
    }),
  }, WelcomeRow))
  const suiyiIdentity = new SuiyiIdentityController(suiyiBridge)
  ctx.effect(() => {
    suiyiIdentity.start()
    return () => { suiyiIdentity.dispose() }
  }, 'ui-settings-general: Suiyi identity')
  const shellInjected = (page: SettingsRootInjected['page']): SettingsRootInjected => ({
    openDesktopUpdate: () => { desktopUpdate.open() },
    reconnect: () => { connection.reconnect() },
    signIn: () => { void suiyiIdentity.signIn() },
    signOut: () => { void suiyiIdentity.signOut() },
    ...(page === undefined ? {} : { page }),
    hooks: {
      shortcuts: ctx.shortcuts.catalog,
      desktopUpdate: desktopUpdate.store,
      connectionState: connection.state,
      sections: sectionsSource,
      onboardingSteps: onboardingSource,
      suiyiIdentity: suiyiIdentity.store,
    },
  })
  // The settings shell reads this host's configuration, so it follows access to its description.
  // Suiyi opens a real main-panel page; the official build keeps the modal shell.
  ctx.remoteAccess.whenAccess('settings/describe', () => {
    const page = isSuiyiBuild() ? ctx.layout : undefined
    const pageId = 'settings' as MainPanelId
    const shellHandle = createSettingsShellStore()
    const shellInstance = shellHandle.create()
    const shellStore: typeof shellHandle = { ...shellHandle, create: () => shellInstance }
    const openPage = (): void => {
      shellInstance.actions.open()
      page?.selectPanel(pageId)
    }
    const closePage = (): void => {
      shellInstance.actions.close()
      page?.selectPanel(null)
    }
    const pageFace = page === undefined ? undefined : { open: openPage, close: closePage }
    const disposeCommand = ctx.shortcuts.register({
      id: 'settings.open' as ShortcutCommandId, label: () => t('shortcut.open'), aliases: ['settings', 'preferences'],
      defaults: {
        'desktop:macos': { code: 'Comma', modifiers: ['primary'] },
        'desktop:windows': { code: 'Comma', modifiers: ['primary'] },
        'desktop:linux': { code: 'Comma', modifiers: ['primary'] },
        'web:macos': { code: 'Comma', modifiers: ['primary', 'alt'] },
        'web:windows': { code: 'Comma', modifiers: ['primary', 'alt'] },
      },
      regions: ['page', 'editable', 'terminal'], modals: page === undefined ? ['settings'] : [],
      resolve: ({ modal }) => {
        if (modal !== null && modal !== 'settings') return { status: 'blocked', reason: 'modal' }
        return { status: 'handled', run: () => {
          if (page !== undefined) {
            if (page.panelInfo.getSnapshot().activePanelId === pageId) closePage()
            else openPage()
          } else if (modal === 'settings') closeTopModal(document)
          else shellInstance.actions.open()
        } }
      },
    })
    const children = {
      'settings.launcher': { kind: 'single', scope: 'root' } as const,
      'settings.trigger': { kind: 'single', scope: 'root' } as const,
      'settings.onboarding': { kind: 'list', scope: 'root' } as const,
      ...(page === undefined ? {
        'settings.header': { kind: 'single', scope: 'root' } as const,
        'settings.action': { kind: 'list', scope: 'root' } as const,
        'settings.close': { kind: 'single', scope: 'root' } as const,
        'settings.section': { kind: 'list', scope: 'root' } as const,
        'settings.section.icon': { kind: 'list', scope: 'root', inline: true } as const,
      } : {}),
    }
    const disposeSlot = ctx.slots.inject('sidebar.settings', () => ctx.slots.register({
      name: 'sidebar.settings',
      locale: NS,
      store: shellStore,
      children,
      inject: () => shellInjected(pageFace),
    }, SettingsRoot))
    const pageInjected = (): SettingsPageInjected => ({ hooks: { sections: sectionsSource }, close: closePage })
    const disposePage = page === undefined ? () => {} : ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main',
      key: pageId,
      locale: NS,
      store: shellStore,
      children: {
        'settings.header': { kind: 'single', scope: 'root' },
        'settings.action': { kind: 'list', scope: 'root' },
        'settings.close': { kind: 'single', scope: 'root' },
        'settings.section': { kind: 'list', scope: 'root' },
        'settings.section.icon': { kind: 'list', scope: 'root', inline: true },
      },
      inject: pageInjected,
    }, SettingsPage))
    // Navigation and the settings store stay the same fact: selecting another
    // main panel leaves settings, and another entry point shows as selected.
    const disposeDesktop = page === undefined ? () => {} : ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section', id: 'desktop', order: 30, label: () => t('nav.desktop'), locale: NS,
      inject: (): DesktopSectionInjected => ({
        hooks: { desktopUpdate: desktopUpdate.store },
        openUpdate: () => { desktopUpdate.open() },
      }),
    }, DesktopSection))
    const disposeSync = page === undefined ? () => {} : ctx.effect(() => {
      const following = page.panelInfo.subscribe(() => {
        const active = page.panelInfo.getSnapshot().activePanelId
        const open = shellInstance.getSnapshot().open
        if (active === pageId) {
          if (!open) shellInstance.actions.open()
        } else if (open) shellInstance.actions.close()
      })
      return () => { following() }
    }, 'ui-settings-general: settings page navigation sync')
    return () => { disposeCommand(); disposeSlot(); disposePage(); disposeDesktop(); disposeSync() }
  })

  ctx.slots.inject('settings.trigger', () =>
    ctx.slots.register({ name: 'settings.trigger', locale: NS }, TriggerContent))
  ctx.slots.inject('settings.header', () =>
    ctx.slots.register({ name: 'settings.header', locale: NS }, HeaderContent))
  if (documentInjected !== undefined) {
    ctx.slots.inject('settings.action', () => ctx.slots.register({
      name: 'settings.action',
      id: 'open-document',
      order: 0,
      locale: NS,
      inject: documentInjected,
    }, SettingsDocumentAction))
  }
  ctx.slots.inject('settings.close', () =>
    ctx.slots.register({ name: 'settings.close', locale: NS }, CloseLabel))
  // The General section renders one card per prototype group. The cache keeps
  // the snapshot reference stable until the item ledger changes.
  let groupsVersion = -1
  let groups: readonly GeneralGroup[] = []
  const groupsSource: ObservableSnapshot<readonly GeneralGroup[]> = {
    getSnapshot: () => {
      const version = ctx.slots.getVersion('settings.general.item')
      if (version !== groupsVersion) {
        groupsVersion = version
        groups = groupGeneralRows(ctx.slots.entries('settings.general.item').map(entry => ({
          /* v8 ignore next -- list-slot registration requires id */
          id: entry.options.id ?? '',
          order: entry.options.order ?? 0,
        })))
      }
      return groups
    },
    subscribe: listener => ctx.slots.subscribe('settings.general.item', listener),
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'general',
    order: 0,
    label: () => t('general.nav'),
    locale: NS,
    inject: (): GeneralSectionInjected => ({ hooks: { groups: groupsSource } }),
    children: { 'settings.general.item': { kind: 'list', scope: 'root' } },
  }, GeneralSection))
  // The page's module system applies no plugin update from another Host release; this dialog offers the reload.
  const releasePromptInjected = (): HostReleasePromptInjected => ({
    dismissRelease: () => { ctx.modules.entries.dismissRelease() },
    reloadPage: () => { globalThis.location.reload() },
    hooks: { releaseChange: ctx.modules.entries.releaseChange },
  })
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'host-release-change', locale: NS, inject: releasePromptInjected,
  }, HostReleasePrompt))
}
