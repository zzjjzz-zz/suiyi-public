/**
 * Plugin center view shared by the business main panel and the optional Plugins
 * page tab: search one administrator-approved catalog, read a plugin's approved
 * tools and risk facts, confirm the permissions before adding it, and disable or
 * remove this account's authorization. Every live fact and action arrives
 * through injection; the view owns only its filters, open dialogs, and consent.
 */
import clsx from 'clsx'
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  Button, Checkbox, IconCheckOutlineRegular, IconChevronRightOutlineRegular, IconCloseOutlineRegular, IconInfoOutlineRegular,
  IconRefreshOutlineRegular, IconSearchOutlineRegular, IconShieldOutlineRegular, Input, Modal, PluginArtworkDefault,
  StateDot, Tag, Tooltip, type TagTone,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CatalogPlugin, PluginHubSnapshot, PluginInstanceView } from './contract.ts'
import type { HubActionFailure, HubActionKind, PluginHubFace, PluginHubState } from './hub-store.ts'
import { type PluginHubLocaleKey } from './locales.ts'
import { categoriesOf, instanceOf, isAdded, isOlderRelease, rowState, visiblePlugins, type HubRowState } from './presentation.ts'
import css from './PluginHubSection.module.css'

/** Props of the plugin center tab on the Plugins page. */
export type PluginHubSectionProps = PropsRuntime<'plugins.tab'> & PropsLocale<'pluginHub'> & InjectFace<PluginHubFace>

/** Props of the independent plugin center main panel. */
export type PluginHubPanelProps = PropsRuntime<'main'> & PropsLocale<'pluginHub'> & InjectFace<PluginHubFace>

/** What both registrations render; neither consumes the slot's owner props. */
type HubViewProps = PropsLocale<'pluginHub'> & InjectFace<PluginHubFace>

type Translate = PluginHubSectionProps['t']
type TabId = 'discover' | 'installed'

/** The injected actions, without the reactive sources the renderer binds as hooks. */
type HubActions = Pick<PluginHubFace, 'add' | 'remove' | 'enable' | 'disable' | 'retry'>

/** Artwork edge inside the 43px card frame, as on the prototype cards. */
const ICON = 22

const TINTS = [css.tintBlue, css.tintTeal, css.tintAmber] as const

const STATUS_KEYS = {
  enabled: 'statusEnabled', connecting: 'statusConnecting', error: 'statusError', 'cleanup-error': 'statusCleanupFailed',
} as const satisfies Record<Exclude<HubRowState, 'disabled'>, PluginHubLocaleKey>

const STATUS_TONES = {
  enabled: 'success', connecting: 'info', disabled: 'quiet', error: 'danger', 'cleanup-error': 'danger',
} as const satisfies Record<HubRowState, TagTone>

const BUSY_KEYS = {
  add: 'adding', remove: 'removing', enable: 'enabling', disable: 'disabling',
} as const satisfies Record<HubActionKind, PluginHubLocaleKey>

const BUSY_STATUS_KEYS = {
  add: 'statusBusyAdd', remove: 'statusRemoving', enable: 'statusEnabling', disable: 'statusDisabling',
} as const satisfies Record<HubActionKind, PluginHubLocaleKey>

const FAILURE_KEYS = {
  add: 'addFailed', remove: 'removeFailed', enable: 'enableFailed', disable: 'disableFailed',
} as const satisfies Record<HubActionKind, PluginHubLocaleKey>

const RISK_KEYS = {
  low: 'riskLow', medium: 'riskMedium', high: 'riskHigh',
} as const satisfies Record<CatalogPlugin['riskLevel'], PluginHubLocaleKey>

const RISK_TONES = {
  low: 'quiet', medium: 'warning', high: 'danger',
} as const satisfies Record<CatalogPlugin['riskLevel'], TagTone>

/** Stable tint variation so cards do not all share one accent; the catalog value itself stays untouched. */
function tintFor(pluginId: string): string {
  let hash = 0
  for (const character of pluginId) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0
  return TINTS[hash % TINTS.length] ?? ''
}

/** Published artwork or the shared default; only image sources a page may load are followed. */
function HubIcon({ pluginId, src, large = false }: {
  readonly pluginId: string
  readonly src: string | undefined
  readonly large?: boolean
}): ReactNode {
  const [failed, setFailed] = useState<string>()
  const frame = clsx(css.iconFrame, large && css.iconFrameLarge, tintFor(pluginId))
  if (src === undefined || src === failed || !/^(?:https?:|data:image\/)/iu.test(src)) {
    return <span className={frame} aria-hidden="true"><PluginArtworkDefault size={ICON} /></span>
  }
  return (
    <span className={frame} aria-hidden="true">
      <img className={css.iconImage} src={src} width={ICON} height={ICON} alt="" loading="lazy"
        referrerPolicy="no-referrer" onError={() => { setFailed(src) }} />
    </span>
  )
}

/** The risk classification the catalog assigned, or the row's enabled state once added. */
function statusOf(plugin: CatalogPlugin, instance: PluginInstanceView | undefined, installed: boolean,
  busy: HubActionKind | undefined, failure: HubActionFailure | undefined,
  t: Translate): { readonly text: string; readonly tone: TagTone } {
  if (busy !== undefined) return { text: t(BUSY_STATUS_KEYS[busy]), tone: 'info' }
  if (rowState(instance) === 'cleanup-error') return { text: t('statusCleanupFailed'), tone: 'danger' }
  if (failure !== undefined) return { text: t('statusError'), tone: 'danger' }
  if (!installed) return { text: t(RISK_KEYS[plugin.riskLevel]), tone: RISK_TONES[plugin.riskLevel] }
  const state = rowState(instance)
  if (state === 'disabled') return { text: t('statusDisabled'), tone: 'quiet' }
  return { text: t(STATUS_KEYS[state]), tone: STATUS_TONES[state] }
}

/** The localized sentence and the sanitized Host detail of a failed action. */
interface FailureLine {
  readonly text: string
  readonly detail: string | undefined
}

function actionFailureLine(instance: PluginInstanceView | undefined, failure: HubActionFailure | undefined,
  t: Translate): FailureLine | null {
  if (rowState(instance) === 'cleanup-error') return { text: t('cleanupFailedDetail'), detail: instance?.error }
  if (failure !== undefined) {
    return { text: t(FAILURE_KEYS[failure.kind]), detail: failure.message }
  }
  if (rowState(instance) !== 'error') return null
  return { text: t('statusError'), detail: instance?.error }
}

/** The one action a row offers in its current state; a failed action or instance offers a retry. */
function PluginAction({ plugin, instance, installed, busy, failure, t, onAdd, onEnable, onDisable, onRetry }: {
  readonly plugin: CatalogPlugin
  readonly instance: PluginInstanceView | undefined
  readonly installed: boolean
  readonly busy: HubActionKind | undefined
  readonly failure: HubActionFailure | undefined
  readonly t: Translate
  readonly onAdd: () => void
  readonly onEnable: () => void
  readonly onDisable: () => void
  readonly onRetry: () => void
}): ReactNode {
  if (busy !== undefined) {
    return (
      <Button variant="outline" size="sm" className={css.action} disabled icon={<StateDot state="ongoing" />}>
        {t(BUSY_KEYS[busy])}
      </Button>
    )
  }
  const state = rowState(instance)
  if (state === 'cleanup-error') {
    return <Button variant="outline" size="sm" className={css.action}
      aria-label={t('retryCleanupTitle', { name: plugin.name })} onClick={onDisable}>{t('retryCleanup')}</Button>
  }
  if (state === 'error' && installed) {
    return <div className={css.failureActions}>
      <Button variant="outline" size="sm" className={css.action} onClick={onRetry}>{t('retry')}</Button>
      <Button variant="ghost" size="sm" className={css.action}
        aria-label={t('disableTitle', { name: plugin.name })} onClick={onDisable}>{t('disable')}</Button>
    </div>
  }
  if (failure !== undefined || state === 'error') {
    return <Button variant="outline" size="sm" className={css.action} onClick={onRetry}>{t('retry')}</Button>
  }
  if (installed) {
    if (rowState(instance) === 'disabled') {
      return (
        <Button variant="primary" size="sm" className={css.action} aria-label={t('enableTitle', { name: plugin.name })}
          onClick={onEnable}>
          {t('enable')}
        </Button>
      )
    }
    return (
      <Button variant="ghost" size="sm" className={css.action} aria-label={t('disableTitle', { name: plugin.name })}
        onClick={onDisable}>
        {t('disable')}
      </Button>
    )
  }
  return (
    <Button variant="primary" size="sm" className={css.action} aria-label={t('addTitle', { name: plugin.name })}
      onClick={onAdd}>
      {t('add')}
    </Button>
  )
}

function PluginCard({ plugin, instance, installed, busy, failure, t, actions, onAdd, onOpen }: {
  readonly plugin: CatalogPlugin
  readonly instance: PluginInstanceView | undefined
  readonly installed: boolean
  readonly busy: HubActionKind | undefined
  readonly failure: HubActionFailure | undefined
  readonly t: Translate
  readonly actions: HubActions
  readonly onAdd: () => void
  readonly onOpen: () => void
}): ReactNode {
  const status = statusOf(plugin, instance, installed, busy, failure, t)
  const failed = actionFailureLine(instance, failure, t)
  const tools = plugin.allowedTools.length
  const category = plugin.category.trim()
  return (
    <li className={css.card} data-hub-plugin={plugin.pluginId}>
      <div className={css.cardTop}>
        <HubIcon pluginId={plugin.pluginId} src={plugin.icon} />
        <Tag tone={status.tone} className={css.statusPill}>{status.text}</Tag>
      </div>
      <button type="button" className={css.cardTitle} aria-label={t('openPlugin', { name: plugin.name })} onClick={onOpen}>
        <span>{plugin.name}</span>
        <IconChevronRightOutlineRegular size={14} aria-hidden="true" />
      </button>
      <p className={css.cardDescription}>{plugin.description.trim() === '' ? t('descriptionEmpty') : plugin.description}</p>
      <div className={css.cardMeta}>
        {category === '' ? null : <span>{category}</span>}
        <span>{t(tools === 1 ? 'toolsCountOne' : 'toolsCount', { count: String(tools) })}</span>
        <span>{t('versionMeta', { version: plugin.releaseVersion })}</span>
      </div>
      {failed === null ? null : (
        <p className={css.cardError} role="status">
          <StateDot state="error" />
          <span className={css.cardErrorText}>{failed.text}</span>
          {failed.detail === undefined ? null : <span className={css.cardErrorDetail}>{failed.detail}</span>}
        </p>
      )}
      <div className={css.cardFooter}>
        <button type="button" className={css.permissionsLink} onClick={onOpen}>
          <IconShieldOutlineRegular size={13} aria-hidden="true" />
          <span>{t('viewPermissions')}</span>
        </button>
        <PluginAction plugin={plugin} instance={instance} installed={installed} busy={busy} failure={failure} t={t}
          onAdd={onAdd}
          onEnable={() => { actions.enable(plugin.pluginId) }}
          onDisable={() => { actions.disable(plugin.pluginId) }}
          onRetry={() => { actions.retry(plugin.pluginId) }} />
      </div>
    </li>
  )
}

function ListSkeleton({ label }: { readonly label: string }): ReactNode {
  return (
    <ul className={css.grid} role="status" aria-label={label} aria-busy="true">
      {[0, 1, 2, 3].map(index => (
        <li key={index} className={css.card} aria-hidden="true">
          <span className={`${css.iconFrame} ${css.skeletonFill}`} />
          <span className={`${css.skeletonBar} ${css.skeletonTitle} ${css.skeletonFill}`} />
          <span className={`${css.skeletonBar} ${css.skeletonDescription} ${css.skeletonFill}`} />
          <span className={`${css.skeletonBar} ${css.skeletonMeta} ${css.skeletonFill}`} />
        </li>
      ))}
    </ul>
  )
}

function CenteredPanel({ icon, title, description, action }: {
  readonly icon: ReactNode
  readonly title: string
  readonly description?: string | undefined
  readonly action: ReactNode
}): ReactNode {
  return (
    <div className={css.panel}>
      {icon}
      <p className={css.panelTitle}>{title}</p>
      {description === undefined ? null : <p className={css.panelDescription}>{description}</p>}
      {action}
    </div>
  )
}

function Browser({ snapshot, state, t, tab, onTab, refresh, text, category, onText, onCategory, onOpen, onAdd, actions }: {
  readonly snapshot: PluginHubSnapshot
  readonly state: PluginHubState
  readonly t: Translate
  readonly tab: TabId
  readonly onTab: (tab: TabId) => void
  readonly refresh: () => void
  readonly text: string
  readonly category: string | null
  readonly onText: (text: string) => void
  readonly onCategory: (category: string | null) => void
  readonly onOpen: (pluginId: string) => void
  readonly onAdd: (pluginId: string) => void
  readonly actions: HubActions
}): ReactNode {
  const categories = categoriesOf(snapshot.plugins)
  // A category the catalog no longer declares leaves the query, without a state write during render.
  const activeCategory = category !== null && categories.includes(category) ? category : null
  const matching = visiblePlugins(snapshot.plugins, { text, category: activeCategory })
  const rows = tab === 'installed' ? matching.filter(plugin => isAdded(snapshot, plugin.pluginId)) : matching
  const added = snapshot.plugins.filter(plugin => isAdded(snapshot, plugin.pluginId)).length
  const clear = (): void => { onText(''); onCategory(null); onTab('discover') }
  const tabOrder: TabId[] = ['discover', 'installed']
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const current = tabOrder.indexOf(tab)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabOrder.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabOrder.length) % tabOrder.length
    onTab(tabOrder[next] ?? 'discover')
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }
  return (
    <>
      <div className={css.toolbar}>
        <div className={css.tabs} role="tablist" aria-label={t('title')}>
          <button type="button" role="tab" aria-selected={tab === 'discover'} tabIndex={tab === 'discover' ? 0 : -1}
            className={clsx(css.tab, tab === 'discover' && css.tabActive)} onClick={() => { onTab('discover') }}
            onKeyDown={onTabKeyDown}>
            {t('tabAll')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'installed'} tabIndex={tab === 'installed' ? 0 : -1}
            className={clsx(css.tab, tab === 'installed' && css.tabActive)} onClick={() => { onTab('installed') }}
            onKeyDown={onTabKeyDown}>
            {t('tabInstalled')}
            {added === 0 ? null : <small className={css.tabCount}>{added}</small>}
          </button>
        </div>
        <div className={css.searchArea}>
          <Input className={css.search ?? ''} type="search" icon={<IconSearchOutlineRegular size={17} />} value={text}
            placeholder={t('search')} aria-label={t('search')} onChange={(event) => { onText(event.target.value) }} />
          <Tooltip label={t('refresh')}>
            <Button variant="ghost" size="sm" className={css.refresh} disabled={state.refreshing}
              aria-busy={state.refreshing} aria-label={t('refresh')} onClick={refresh}>
              {state.refreshing ? <StateDot state="ongoing" /> : <IconRefreshOutlineRegular size={17} />}
            </Button>
          </Tooltip>
        </div>
      </div>
      {categories.length === 0 ? null : (
        <div className={css.categories} role="group" aria-label={t('categoriesLabel')}>
          <button type="button" className={clsx(css.category, activeCategory === null && css.categoryActive)}
            aria-pressed={activeCategory === null} onClick={() => { onCategory(null) }}>
            {t('allCategories')}
          </button>
          {categories.map(item => (
            <button type="button" key={item} className={clsx(css.category, activeCategory === item && css.categoryActive)}
              aria-pressed={activeCategory === item} onClick={() => { onCategory(item) }}>
              {item}
            </button>
          ))}
        </div>
      )}
      <div className={css.resultsHead}>
        <span>{t(tab === 'installed'
          ? rows.length === 1 ? 'resultsInstalledOne' : 'resultsInstalled'
          : rows.length === 1 ? 'resultsAvailableOne' : 'resultsAvailable', { count: String(rows.length) })}</span>
        <span>{t('resultsScope')}</span>
      </div>
      {rows.length === 0
        ? (
          <CenteredPanel
            icon={<IconSearchOutlineRegular size={35} />}
            title={tab === 'installed' && text.trim() === '' && activeCategory === null
              ? t('installedEmptyTitle')
              : t('noMatches')}
            description={tab === 'installed' && text.trim() === '' && activeCategory === null
              ? t('installedEmptyDescription')
              : undefined}
            action={<Button variant="ghost" size="sm" onClick={clear}>{t('clearFilters')}</Button>}
          />
        )
        : (
          <ul className={css.grid} aria-busy={state.refreshing} aria-label={t('title')}>
            {rows.map(plugin => (
              <PluginCard key={plugin.pluginId} plugin={plugin} instance={instanceOf(snapshot, plugin.pluginId)}
                installed={isAdded(snapshot, plugin.pluginId)} busy={state.busy[plugin.pluginId]}
                failure={state.actionFailures[plugin.pluginId]} t={t} actions={actions}
                onAdd={() => { onAdd(plugin.pluginId) }} onOpen={() => { onOpen(plugin.pluginId) }} />
            ))}
          </ul>
        )}
    </>
  )
}

function DialogHeader({ plugin, t, onClose }: {
  readonly plugin: CatalogPlugin
  readonly t: Translate
  readonly onClose: () => void
}): ReactNode {
  const category = plugin.category.trim()
  return (
    <header className={css.dialogHeader}>
      <HubIcon pluginId={plugin.pluginId} src={plugin.icon} large />
      <div className={css.dialogHeading}>
        <h3>{plugin.name}</h3>
        <small>{category === '' ? t('versionMeta', { version: plugin.releaseVersion })
          : `${category} · ${t('versionMeta', { version: plugin.releaseVersion })}`}</small>
      </div>
      <button type="button" className={css.dialogClose} aria-label={t('close')} onClick={onClose}>
        <IconCloseOutlineRegular size={16} />
      </button>
    </header>
  )
}

function PermissionList({ plugin, t }: { readonly plugin: CatalogPlugin; readonly t: Translate }): ReactNode {
  if (plugin.allowedTools.length === 0) return <p className={css.muted}>{t('toolsEmpty')}</p>
  return (
    <ul className={css.permissions} aria-label={t('permissionsTitle')}>
      {plugin.allowedTools.map(tool => (
        <li key={tool.name}>
          <IconShieldOutlineRegular size={17} aria-hidden="true" />
          <div>
            <strong>{tool.name}</strong>
            <small>{tool.description === undefined || tool.description.trim() === '' ? t('toolDescriptionEmpty') : tool.description}</small>
          </div>
        </li>
      ))}
    </ul>
  )
}

function PluginDetail({ plugin, snapshot, t, language, busy, failure, actions, onClose, onAdd, onRemove }: {
  readonly plugin: CatalogPlugin
  readonly snapshot: PluginHubSnapshot
  readonly t: Translate
  readonly language: string
  readonly busy: HubActionKind | undefined
  readonly failure: HubActionFailure | undefined
  readonly actions: HubActions
  readonly onClose: () => void
  readonly onAdd: () => void
  readonly onRemove: () => void
}): ReactNode {
  const instance = instanceOf(snapshot, plugin.pluginId)
  const installed = isAdded(snapshot, plugin.pluginId)
  const status = statusOf(plugin, instance, installed, busy, failure, t)
  const failed = actionFailureLine(instance, failure, t)
  const roles = plugin.allowedRoles.length === 0
    ? t('identityAccount')
    : new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(plugin.allowedRoles)
  const identity = plugin.visibility === 'roles' ? roles
    : plugin.visibility === 'private' ? t('identityPrivate') : t('identityAccount')
  return (
    <Modal open onClose={onClose} title={plugin.name} headless className={css.dialogCard ?? ''}>
      <div className={css.dialogContent}>
        <DialogHeader plugin={plugin} t={t} onClose={onClose} />
        <p className={css.dialogDescription}>{plugin.description.trim() === '' ? t('descriptionEmpty') : plugin.description}</p>
        {failed === null ? null : (
          <p className={css.dialogFailure} role="status">
            <StateDot state="error" />
            <span>{failed.text}</span>
            {failed.detail === undefined ? null : <span className={css.cardErrorDetail}>{failed.detail}</span>}
          </p>
        )}
        <dl className={css.facts}>
          <div><dt>{t('source')}</dt><dd>{t('sourceValue')}</dd></div>
          <div><dt>{t('state')}</dt><dd><Tag tone={status.tone} className={css.statusPill}>{status.text}</Tag></dd></div>
          <div><dt>{t('risk')}</dt><dd><Tag tone={RISK_TONES[plugin.riskLevel]} className={css.statusPill}>{t(RISK_KEYS[plugin.riskLevel])}</Tag></dd></div>
          <div><dt>{t('identityScope')}</dt><dd>{identity}</dd></div>
          <div><dt>{t('scope')}</dt><dd>{t('scopeValue')}</dd></div>
          <div><dt>{t('authorization')}</dt><dd>{t('authorizationValue')}</dd></div>
        </dl>
        <section className={css.dialogSection}>
          <h4>{t('featuresTitle')}</h4>
          {plugin.allowedTools.length === 0 ? null : (
            <div className={css.features}>
              {plugin.allowedTools.map(tool => (
                <span key={tool.name}><IconCheckOutlineRegular size={15} aria-hidden="true" />{tool.name}</span>
              ))}
            </div>
          )}
        </section>
        <section className={css.dialogSection}>
          <h4>{t('permissionsTitle')}</h4>
          <PermissionList plugin={plugin} t={t} />
          <div className={css.note} role="note">
            <IconInfoOutlineRegular size={16} aria-hidden="true" />
            <span>{t('permissionNote')}</span>
          </div>
        </section>
        <div className={css.dialogActions}>
          {installed
            ? <Button variant="ghost" className={css.dangerAction} onClick={onRemove}>{t('removeAction')}</Button>
            : null}
          {installed || rowState(instance) === 'cleanup-error'
            ? (
              <PluginAction plugin={plugin} instance={instance} installed busy={busy} failure={failure} t={t}
                onAdd={onAdd}
                onEnable={() => { actions.enable(plugin.pluginId) }}
                onDisable={() => { actions.disable(plugin.pluginId) }}
                onRetry={() => { actions.retry(plugin.pluginId) }} />
            )
            : <Button variant="primary" className={css.dialogPrimary} onClick={onAdd}>{t('addAction')}</Button>}
        </div>
        {isOlderRelease(plugin, instance) ? <p className={css.versionNote}>{t('versionOutdated')}</p> : null}
      </div>
    </Modal>
  )
}

function AddDialog({ plugin, t, onClose, onConfirm }: {
  readonly plugin: CatalogPlugin
  readonly t: Translate
  readonly onClose: () => void
  readonly onConfirm: () => void
}): ReactNode {
  const [consent, setConsent] = useState(false)
  return (
    <Modal open onClose={onClose} title={t('addTitle', { name: plugin.name })} headless className={css.dialogCard ?? ''}>
      <div className={css.dialogContent}>
        <DialogHeader plugin={plugin} t={t} onClose={onClose} />
        <p className={css.dialogDescription}>{t('addIntro')}</p>
        <PermissionList plugin={plugin} t={t} />
        <div className={css.note} role="note">
          <IconInfoOutlineRegular size={16} aria-hidden="true" />
          <span>{t('permissionNote')}</span>
        </div>
        <Checkbox checked={consent} onChange={setConsent} label={t('addConsent')} className={css.consent} />
        <p className={css.consentDetail}>{t('addConsentDetail')}</p>
        <div className={css.dialogActions}>
          <Button variant="ghost" className={css.dialogAction} onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" className={css.dialogAction} disabled={!consent} onClick={onConfirm}>
            {t('addConfirm')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function RemoveDialog({ plugin, t, onClose, onConfirm }: {
  readonly plugin: CatalogPlugin
  readonly t: Translate
  readonly onClose: () => void
  readonly onConfirm: () => void
}): ReactNode {
  return (
    <Modal open onClose={onClose} title={t('removeTitle', { name: plugin.name })} headless className={css.dialogCard ?? ''}>
      <div className={css.dialogContent}>
        <header className={css.confirmHeader}>
          <h3>{t('removeTitle', { name: plugin.name })}</h3>
          <button type="button" className={css.dialogClose} aria-label={t('close')} onClick={onClose}>
            <IconCloseOutlineRegular size={16} />
          </button>
        </header>
        <p className={css.dialogDescription}>{t('removeDescription')}</p>
        <div className={css.dialogActions}>
          <Button variant="ghost" className={css.dialogAction} onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" className={clsx(css.dialogAction, css.dangerPrimary)} onClick={onConfirm}>
            {t('removeConfirm')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function PluginHubView(props: HubViewProps): ReactNode {
  const { t } = props
  const state = props.useHub(snapshot => snapshot)
  const language = props.useLocale(snapshot => snapshot.active)
  const [tab, setTab] = useState<TabId>('discover')
  const [text, setText] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [addId, setAddId] = useState<string | null>(null)
  const [removeId, setRemoveId] = useState<string | null>(null)
  useEffect(() => { props.ensure() }, [props.ensure])
  const snapshot = state.snapshot
  const find = (pluginId: string | null): CatalogPlugin | undefined =>
    pluginId === null || snapshot === null || !snapshot.enabled
      ? undefined
      : snapshot.plugins.find(plugin => plugin.pluginId === pluginId)
  const detail = find(detailId)
  const adding = find(addId)
  const removing = find(removeId)
  const actions: HubActions = {
    add: props.add, remove: props.remove, enable: props.enable, disable: props.disable, retry: props.retry,
  }
  const openDetail = (pluginId: string): void => { setDetailId(pluginId) }
  const openAdd = (pluginId: string): void => { setDetailId(null); setAddId(pluginId) }
  const openRemove = (pluginId: string): void => { setDetailId(null); setRemoveId(pluginId) }
  let body: ReactNode
  if (snapshot === null) {
    body = state.status === 'error'
      ? (
        <CenteredPanel icon={<StateDot state="error" />} title={t('loadFailed')}
          description={state.failure?.message.trim() === '' ? undefined : state.failure?.message}
          action={<Button variant="outline" size="sm" onClick={props.reload}>{t('retry')}</Button>} />
      )
      : <ListSkeleton label={t('loading')} />
  } else if (!snapshot.enabled) {
    body = (
      <CenteredPanel icon={<PluginArtworkDefault size={48} />} title={t('disabledTitle')} description={t('disabledDescription')}
        action={<Button variant="outline" size="sm" disabled={state.refreshing} onClick={props.refresh}>{t('checkAgain')}</Button>} />
    )
  } else if (snapshot.plugins.length === 0) {
    body = (
      <CenteredPanel icon={<PluginArtworkDefault size={48} />} title={t('emptyTitle')} description={t('emptyDescription')}
        action={<Button variant="outline" size="sm" disabled={state.refreshing} onClick={props.refresh}>{t('refresh')}</Button>} />
    )
  } else {
    body = (
      <Browser snapshot={snapshot} state={state} t={t}
        tab={tab} onTab={setTab} refresh={props.refresh} text={text} category={category}
        onText={setText} onCategory={setCategory} onOpen={openDetail} onAdd={openAdd} actions={actions} />
    )
  }
  const failure = state.failure === null || snapshot === null ? null : (
    <div className={css.failure}>
      <p className={css.error} role="status">
        <StateDot state="error" />
        <span>{t(state.failure.kind === 'refresh' ? 'refreshFailed' : 'loadFailed')}</span>
      </p>
      {state.failure.message.trim() === '' ? null : <span className={css.failureDetail}>{state.failure.message}</span>}
      <Button variant="outline" size="sm" onClick={props.reload}>{t('retry')}</Button>
    </div>
  )
  return (
    <div className={css.section} data-plugin-tab="hub">
      {failure}
      {body}
      {snapshot === null || !snapshot.enabled ? null : (
        <p className={css.footerNote}>
          <IconInfoOutlineRegular size={15} aria-hidden="true" />
          <span>{t('catalogNote')}</span>
        </p>
      )}
      {detail === undefined ? null : (
        <PluginDetail plugin={detail} snapshot={snapshot as PluginHubSnapshot} t={t} language={language}
          busy={state.busy[detail.pluginId]} failure={state.actionFailures[detail.pluginId]} actions={actions}
          onClose={() => { setDetailId(null) }}
          onAdd={() => { openAdd(detail.pluginId) }}
          onRemove={() => { openRemove(detail.pluginId) }} />
      )}
      {adding === undefined ? null : (
        <AddDialog plugin={adding} t={t} onClose={() => { setAddId(null) }}
          onConfirm={() => { actions.add(adding.pluginId); setAddId(null) }} />
      )}
      {removing === undefined ? null : (
        <RemoveDialog plugin={removing} t={t} onClose={() => { setRemoveId(null) }}
          onConfirm={() => { actions.remove(removing.pluginId); setRemoveId(null) }} />
      )}
    </div>
  )
}

/**
 * Render the plugin center as a Plugins page tab.
 * @param props - owner props, localized copy, and the injected hub face.
 * @returns the catalog toolbar with its filters and cards, one plugin page, or a state panel.
 */
export function PluginHubSection(props: PluginHubSectionProps): ReactNode {
  return <div className={css.tabView}><PluginHubView {...props} /></div>
}

/**
 * Render the plugin center as the independent main panel selected from the sidebar.
 * @param props - localized copy and the injected hub face; the main slot passes no owner data.
 * @returns the page heading and the same catalog view the tab shows.
 */
export function PluginHubPanel(props: PluginHubPanelProps): ReactNode {
  return (
    <div className={css.page}>
      <header className={css.pageHeader}>
        <h1>{props.t('title')}</h1>
        <p>{props.t('subtitle')}</p>
      </header>
      <PluginHubView {...props} />
    </div>
  )
}
