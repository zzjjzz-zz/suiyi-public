// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { CatalogPlugin, PluginHubSnapshot, PluginInstanceView, PublishedTool } from '../src/client/contract.ts'
import type { PluginHubState } from '../src/client/hub-store.ts'
import { en, zh, type PluginHubLocaleKey } from '../src/client/locales.ts'
import { PluginHubPanel, PluginHubSection, type PluginHubPanelProps, type PluginHubSectionProps } from '../src/client/PluginHubSection.tsx'
import { PluginHubPanelIcon } from '../src/client/PluginHubPanelIcon.tsx'

afterEach(cleanup)

function translator(dictionary: Record<PluginHubLocaleKey, string>): PluginHubSectionProps['t'] {
  return ((key: PluginHubLocaleKey, params?: Record<string, string>): string =>
    Object.entries(params ?? {}).reduce<string>((text, [name, value]) => text.replaceAll(`{${name}}`, value), dictionary[key])) as PluginHubSectionProps['t']
}

function tool(name: string, description?: string): PublishedTool {
  return { name, ...description === undefined ? {} : { description }, inputSchema: { type: 'object' } }
}

function plugin(id: string, fields: Partial<CatalogPlugin> = {}): CatalogPlugin {
  return {
    pluginId: id,
    workloadId: `workload-${id}`,
    releaseVersion: '1.0.0',
    name: `Plugin ${id}`,
    description: `${id} description`,
    category: 'research',
    allowedTools: [tool('search', 'Search the web')],
    schemaFingerprint: 'sha256:abc',
    riskLevel: 'low',
    visibility: 'public',
    allowedRoles: [],
    status: 'published',
    mcpPath: `/api/v1/plugins/${id}/mcp?releaseVersion=1.0.0`,
    ...fields,
  }
}

const ALPHA = plugin('alpha', { name: 'Alpha Reader', category: 'research', description: 'Reads papers' })
const BETA = plugin('beta', {
  name: 'Beta Writer', category: 'writing', description: 'Writes notes', riskLevel: 'high',
  allowedTools: [tool('compose'), tool('polish', 'Polish a draft')],
})

function snapshot(fields: Partial<PluginHubSnapshot> = {}): PluginHubSnapshot {
  return { plugins: [ALPHA, BETA], catalogVersion: 'catalog-7', instances: [], enabled: true, ...fields }
}

function ready(fields: Partial<PluginHubState> = {}): PluginHubState {
  return { status: 'ready', snapshot: snapshot(), refreshing: false, failure: null, busy: {}, actionFailures: {}, ...fields }
}

function renderTab(state: PluginHubState = ready(), dictionary: Record<PluginHubLocaleKey, string> = en) {
  const store = createSnapshotStore<PluginHubState>(state)
  const locale = createSnapshotStore<LocaleSnapshot>({ active: dictionary === en ? 'en' : 'zh', locales: [], revision: 0 })
  const actions = {
    ensure: vi.fn(), reload: vi.fn(), refresh: vi.fn(), add: vi.fn(), remove: vi.fn(),
    enable: vi.fn(), disable: vi.fn(), retry: vi.fn(),
  }
  const props = {
    t: translator(dictionary), openPackage: vi.fn(), ...actions,
    useHub: bindSnapshotSelector(store), useLocale: bindSnapshotSelector(locale),
  } as PluginHubSectionProps
  render(<PluginHubSection {...props} />)
  const set = (next: Partial<PluginHubState>): void => { act(() => { store.set({ ...store.getSnapshot(), ...next }) }) }
  return { actions, set, store }
}

const open = (name: string): void => { fireEvent.click(screen.getByRole('button', { name: `Open ${name}` })) }

describe('PluginHubPanel', () => {
  it('keeps Disable beside Retry for an authorized failed instance', () => {
    const { actions } = renderTab(ready({ snapshot: snapshot({ instances: [{
      pluginId: 'alpha', releaseVersion: '1.0.0', state: 'error', added: true, authorized: true,
    }] }) }))
    fireEvent.click(screen.getByRole('button', { name: 'Disable Alpha Reader' }))
    expect(actions.disable).toHaveBeenCalledExactlyOnceWith('alpha')
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(actions.retry).toHaveBeenCalledExactlyOnceWith('alpha')
  })

  it.each([en, zh])('offers cleanup without enable or add after authorization was withdrawn', (dictionary) => {
    const { actions } = renderTab(ready({ snapshot: snapshot({ instances: [{
      pluginId: 'alpha', releaseVersion: '1.0.0', state: 'error', added: false, authorized: false,
    }] }) }), dictionary)
    const t = translator(dictionary)
    expect(screen.getByText(dictionary.statusCleanupFailed)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('retryCleanupTitle', { name: ALPHA.name }) }))
    expect(actions.disable).toHaveBeenCalledExactlyOnceWith('alpha')
    expect(actions.enable).not.toHaveBeenCalled()
    expect(actions.add).not.toHaveBeenCalled()
  })

  it('shows a list skeleton until the first catalog read lands', () => {
    const { actions } = renderTab({ ...ready(), status: 'loading', snapshot: null })
    expect(actions.ensure).toHaveBeenCalledOnce()
    expect(screen.getByRole('status', { name: en.loading })).toBeTruthy()
  })

  it('shows a failed first read with its Host reason and retries it', () => {
    const { actions } = renderTab({ ...ready(), status: 'error', snapshot: null, failure: { kind: 'load', message: 'catalog offline' } })
    expect(screen.getByText(en.loadFailed)).toBeTruthy()
    expect(screen.getByText('catalog offline')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(actions.reload).toHaveBeenCalledOnce()
  })

  it('omits a blank failure detail and retries from the panel', () => {
    const { actions } = renderTab({ ...ready(), status: 'error', snapshot: null, failure: { kind: 'load', message: '  ' } })
    expect(screen.getByText(en.loadFailed)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(actions.reload).toHaveBeenCalledOnce()
  })

  it('explains a disabled hub and checks again without listing plugins', () => {
    const { actions } = renderTab(ready({ snapshot: snapshot({ enabled: false }) }))
    expect(screen.getByText(en.disabledTitle)).toBeTruthy()
    expect(screen.getByText(en.disabledDescription)).toBeTruthy()
    expect(screen.queryByText('Alpha Reader')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.checkAgain }))
    expect(actions.refresh).toHaveBeenCalledOnce()
  })

  it('disables the check-again action while the hub state is being re-read', () => {
    renderTab(ready({ snapshot: snapshot({ enabled: false }), refreshing: true }))
    expect(screen.getByRole('button', { name: en.checkAgain }).hasAttribute('disabled')).toBe(true)
  })

  it('invites a refresh when the catalog is empty', () => {
    const { actions } = renderTab(ready({ snapshot: snapshot({ plugins: [] }) }))
    expect(screen.getByText(en.emptyTitle)).toBeTruthy()
    expect(screen.getByText(en.emptyDescription)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.refresh }))
    expect(actions.refresh).toHaveBeenCalledOnce()
  })

  it('lists the catalog with categories, risk, status, metadata, and a counted summary', () => {
    renderTab(ready({ snapshot: snapshot({ instances: [{ pluginId: 'beta', releaseVersion: '1.0.0', state: 'enabled', authorized: true, added: true }] }) }))
    expect(screen.getByText('Alpha Reader')).toBeTruthy()
    expect(screen.getByText('Beta Writer')).toBeTruthy()
    expect(screen.getByText('Showing 2 available plugins')).toBeTruthy()
    expect(screen.getByText('Current account')).toBeTruthy()
    expect(screen.getAllByText('research').length).toBeGreaterThan(1)
    expect(screen.getAllByText('writing').length).toBeGreaterThan(1)
    expect(screen.getByText(en.riskLow)).toBeTruthy()
    expect(screen.getByText(en.statusEnabled)).toBeTruthy()
    expect(screen.getAllByText('Version 1.0.0')).toHaveLength(2)
    expect(screen.getByText('1 tool')).toBeTruthy()
    expect(screen.getByText('2 tools')).toBeTruthy()
  })

  it('filters the added tab by authorized rows and keeps the count on the tab', () => {
    renderTab(ready({ snapshot: snapshot({ instances: [{ pluginId: 'beta', releaseVersion: '1.0.0', state: 'enabled', authorized: true, added: true }] }) }))
    expect(screen.getByRole('tab', { name: new RegExp(en.tabInstalled) }).textContent).toContain('1')
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(en.tabInstalled) }))
    expect(screen.getByText('Beta Writer')).toBeTruthy()
    expect(screen.queryByText('Alpha Reader')).toBeNull()
    expect(screen.getByText('Showing 1 added plugin')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: en.tabAll }))
    expect(screen.getByText('Alpha Reader')).toBeTruthy()
  })

  it('moves tab selection with the keyboard', () => {
    renderTab()
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(en.tabInstalled) }))
    const installed = screen.getByRole('tab', { name: new RegExp(en.tabInstalled) })
    fireEvent.keyDown(installed, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: en.tabAll }).getAttribute('aria-selected')).toBe('true')
  })

  it('filters by name, description, and approved tool, then clears the filters', () => {
    renderTab()
    const search = screen.getByRole('searchbox', { name: en.search })
    fireEvent.change(search, { target: { value: 'alpha' } })
    expect(screen.queryByText('Beta Writer')).toBeNull()
    expect(screen.getByText('Alpha Reader')).toBeTruthy()
    fireEvent.change(search, { target: { value: 'polish A DRAFT' } })
    expect(screen.queryByText('Alpha Reader')).toBeNull()
    expect(screen.getByText('Beta Writer')).toBeTruthy()
    fireEvent.change(search, { target: { value: 'nothing' } })
    expect(screen.getByText(en.noMatches)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.clearFilters }))
    expect(screen.getByText('Alpha Reader')).toBeTruthy()
    expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('')
  })

  it('filters by a category pill and clears the filter when the category disappears', () => {
    const { set } = renderTab()
    const group = screen.getByRole('group', { name: en.categoriesLabel })
    fireEvent.click(within(group).getByRole('button', { name: 'writing' }))
    expect(screen.queryByText('Alpha Reader')).toBeNull()
    expect(within(group).getByRole('button', { name: 'writing' }).getAttribute('aria-pressed')).toBe('true')
    set({ snapshot: snapshot({ plugins: [ALPHA] }) })
    expect(screen.getByText('Alpha Reader')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: en.categoriesLabel })).getByRole('button', { name: en.allCategories })
      .getAttribute('aria-pressed')).toBe('true')
  })

  it('opens a plugin page with its facts, capabilities, permissions, and approved tools', () => {
    const detailed = plugin('alpha', {
      name: 'Alpha Reader', description: 'Reads papers thoroughly', category: 'research', riskLevel: 'medium',
      visibility: 'roles', allowedRoles: ['analyst', 'reviewer'], releaseVersion: '1.2.0',
      allowedTools: [tool('search', 'Search the web'), tool('fetch')],
    })
    renderTab(ready({
      snapshot: snapshot({ plugins: [detailed], instances: [{ pluginId: 'alpha', releaseVersion: '1.1.0', state: 'enabled', authorized: true, added: true }] }),
    }))
    open('Alpha Reader')
    const dialog = screen.getByRole('dialog', { name: 'Alpha Reader' })
    expect(within(dialog).getByText('research · Version 1.2.0')).toBeTruthy()
    expect(within(dialog).getByText(en.riskMedium)).toBeTruthy()
    expect(within(dialog).getByText('analyst and reviewer')).toBeTruthy()
    expect(within(dialog).getByText(en.sourceValue)).toBeTruthy()
    expect(within(dialog).getByText(en.authorizationValue)).toBeTruthy()
    expect(within(dialog).getByText(en.featuresTitle)).toBeTruthy()
    expect(within(dialog).getByText(en.permissionsTitle)).toBeTruthy()
    expect(within(dialog).getAllByText('search').length).toBeGreaterThan(1)
    expect(within(dialog).getByText('Search the web')).toBeTruthy()
    expect(within(dialog).getAllByText('fetch').length).toBeGreaterThan(1)
    expect(within(dialog).getByText(en.toolDescriptionEmpty)).toBeTruthy()
    expect(within(dialog).getByRole('note').textContent).toContain(en.permissionNote)
    expect(within(dialog).getByText(en.versionOutdated)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: en.close }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('searchbox', { name: en.search })).toBeTruthy()
  })

  it('omits facts a plugin does not provide and shows no approved tools', () => {
    const bare = plugin('bare', {
      name: 'Bare', description: '', category: '  ', allowedTools: [], allowedRoles: [], riskLevel: 'low', visibility: 'public',
    })
    renderTab(ready({ snapshot: snapshot({ plugins: [bare] }) }))
    open('Bare')
    const dialog = screen.getByRole('dialog', { name: 'Bare' })
    expect(within(dialog).getByText(en.descriptionEmpty)).toBeTruthy()
    expect(within(dialog).getByText(en.toolsEmpty)).toBeTruthy()
    expect(within(dialog).getAllByText(en.identityAccount)).toHaveLength(2)
    expect(within(dialog).getAllByText(en.riskLow).length).toBeGreaterThan(0)
  })

  it('keeps long descriptions as the full text on the plugin page', () => {
    const long = `Reads every paper. ${'Detail '.repeat(40)}`.trim()
    renderTab(ready({ snapshot: snapshot({ plugins: [plugin('long', { name: 'Long', description: long })] }) }))
    open('Long')
    expect(within(screen.getByRole('dialog')).getByText(long)).toBeTruthy()
  })

  it('asks for permission confirmation before adding and requires the checkbox', () => {
    const { actions } = renderTab()
    fireEvent.click(screen.getByRole('button', { name: 'Add Alpha Reader' }))
    const dialog = screen.getByRole('dialog', { name: en.addTitle.replace('{name}', 'Alpha Reader') })
    expect(within(dialog).getByText(en.addIntro)).toBeTruthy()
    expect(within(dialog).getByText('Search the web')).toBeTruthy()
    const confirm = within(dialog).getByRole('button', { name: en.addConfirm })
    expect(confirm.hasAttribute('disabled')).toBe(true)
    fireEvent.click(within(dialog).getByRole('checkbox', { name: en.addConsent }))
    expect(confirm.hasAttribute('disabled')).toBe(false)
    fireEvent.click(confirm)
    expect(actions.add).toHaveBeenCalledWith('alpha')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the same permission confirmation from the plugin page', () => {
    const { actions } = renderTab()
    open('Alpha Reader')
    fireEvent.click(screen.getByRole('button', { name: en.addAction }))
    const dialog = screen.getByRole('dialog', { name: en.addTitle.replace('{name}', 'Alpha Reader') })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: en.addConsent }))
    fireEvent.click(within(dialog).getByRole('button', { name: en.addConfirm }))
    expect(actions.add).toHaveBeenCalledWith('alpha')
  })

  it('keeps an added but disabled plugin in Added and enables it without adding it again', () => {
    const installedView: PluginInstanceView = {
      pluginId: 'alpha', releaseVersion: '1.0.0', state: 'disabled', authorized: false, added: true,
    }
    const { actions } = renderTab(ready({ snapshot: snapshot({ instances: [installedView] }) }))
    expect(screen.getByText(en.statusDisabled)).toBeTruthy()
    expect(screen.getByRole('tab', { name: new RegExp(en.tabInstalled) }).textContent).toContain('1')
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(en.tabInstalled) }))
    expect(screen.getByText('Alpha Reader')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enable Alpha Reader' }))
    expect(actions.enable).toHaveBeenCalledWith('alpha')
    open('Alpha Reader')
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: en.removeAction })).toBeTruthy()
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enable Alpha Reader' })).toBeTruthy()
  })

  it('disables from the card and removes from the plugin page after confirmation', () => {
    const { actions } = renderTab(ready({
      snapshot: snapshot({ instances: [
        { pluginId: 'alpha', releaseVersion: '1.0.0', state: 'enabled', authorized: true, added: true },
        { pluginId: 'beta', releaseVersion: '1.0.0', state: 'enabled', authorized: true, added: true },
      ] }),
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Disable Alpha Reader' }))
    expect(actions.disable).toHaveBeenCalledWith('alpha')
    open('Beta Writer')
    fireEvent.click(screen.getByRole('button', { name: en.removeAction }))
    const dialog = screen.getByRole('dialog', { name: en.removeTitle.replace('{name}', 'Beta Writer') })
    expect(within(dialog).getByText(en.removeDescription)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: en.removeConfirm }))
    expect(actions.remove).toHaveBeenCalledWith('beta')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('offers disable while a plugin connects', () => {
    const { actions } = renderTab(ready({ snapshot: snapshot({ instances: [{ pluginId: 'alpha', releaseVersion: '1.0.0', state: 'connecting', authorized: true, added: true }] }) }))
    expect(screen.getByText(en.statusConnecting)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Disable Alpha Reader' }))
    expect(actions.disable).toHaveBeenCalledWith('alpha')
  })

  it('keeps lifecycle actions disabled while they run', () => {
    renderTab(ready({ busy: { alpha: 'add', beta: 'remove' } }))
    expect(screen.getByRole('button', { name: en.adding }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: en.removing }).hasAttribute('disabled')).toBe(true)
    cleanup()
    renderTab(ready({ snapshot: snapshot({ instances: [
      { pluginId: 'alpha', releaseVersion: '1.0.0', state: 'disabled', authorized: false, added: true },
      { pluginId: 'beta', releaseVersion: '1.0.0', state: 'enabled', authorized: true, added: true },
    ] }), busy: { alpha: 'enable', beta: 'disable' } }))
    expect(screen.getByRole('button', { name: en.enabling }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: en.disabling }).hasAttribute('disabled')).toBe(true)
  })

  it('surfaces a failed instance and retries it', () => {
    const { actions } = renderTab(ready({
      snapshot: snapshot({ instances: [{ pluginId: 'alpha', releaseVersion: '1.0.0', state: 'error', authorized: true, error: 'adapter crashed', added: true }] }),
    }))
    expect(screen.getAllByText(en.statusError).length).toBeGreaterThan(1)
    expect(screen.getByText('adapter crashed')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: en.retry })[0] as HTMLElement)
    expect(actions.retry).toHaveBeenCalledWith('alpha')
  })

  it('shows an instance error without a Host message on the card and the page', () => {
    renderTab(ready({ snapshot: snapshot({ instances: [{ pluginId: 'alpha', releaseVersion: '1.0.0', state: 'error', authorized: true, added: true }] }) }))
    expect(screen.getByRole('status').textContent).toBe(en.statusError)
    open('Alpha Reader')
    expect(within(screen.getByRole('dialog')).getByRole('status').textContent).toBe(en.statusError)
  })

  it('shows an add failure on its card and retries that operation', () => {
    const { actions } = renderTab(ready({ actionFailures: { alpha: { kind: 'add', message: 'tool start failed' } } }))
    expect(screen.getByText(en.addFailed)).toBeTruthy()
    expect(screen.getByText('tool start failed')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(actions.retry).toHaveBeenCalledWith('alpha')
  })

  it('shows a disable failure and retries it from the plugin page', () => {
    const { actions } = renderTab(ready({
      snapshot: snapshot({ instances: [{ pluginId: 'alpha', releaseVersion: '1.0.0', state: 'enabled', authorized: true, added: true }] }),
      actionFailures: { alpha: { kind: 'disable', message: 'still running' } },
    }))
    expect(screen.getByText(en.disableFailed)).toBeTruthy()
    open('Alpha Reader')
    expect(within(screen.getByRole('dialog')).getByText('still running')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: en.retry }))
    expect(actions.retry).toHaveBeenCalledWith('alpha')
  })

  it('refreshes on the toolbar action and disables it while the read runs', () => {
    const { actions } = renderTab()
    fireEvent.click(screen.getByRole('button', { name: en.refresh }))
    expect(actions.refresh).toHaveBeenCalledOnce()
    cleanup()
    renderTab(ready({ refreshing: true }))
    const button = screen.getByRole('button', { name: en.refresh })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
  })

  it('keeps the list beside a failed refresh notice and retries the read', () => {
    const { actions } = renderTab(ready({ failure: { kind: 'refresh', message: 'refresh offline' } }))
    expect(screen.getByText(en.refreshFailed)).toBeTruthy()
    expect(screen.getByText('refresh offline')).toBeTruthy()
    expect(screen.getByText('Alpha Reader')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(actions.reload).toHaveBeenCalledOnce()
  })

  it('names a failed read as a load failure and keeps its blank detail out', () => {
    renderTab(ready({ failure: { kind: 'load', message: '' } }))
    expect(screen.getByText(en.loadFailed)).toBeTruthy()
    expect(screen.getByText('Alpha Reader')).toBeTruthy()
  })

  it('loads only image artwork, keeps the referrer out, and falls back on a load error', () => {
    renderTab(ready({ snapshot: snapshot({ plugins: [plugin('alpha', { icon: 'https://cdn.example/a.png' })] }) }))
    const image = document.querySelector('img')
    expect(image?.getAttribute('referrerpolicy')).toBe('no-referrer')
    fireEvent.error(image as HTMLImageElement)
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('svg')).toBeTruthy()
  })

  it('rejects artwork with a non-image scheme', () => {
    renderTab(ready({ snapshot: snapshot({ plugins: [plugin('alpha', { icon: 'ftp://files.example/a.png' })] }) }))
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('svg')).toBeTruthy()
  })

  it('renders the same center as the independent main panel with a page heading', () => {
    const store = createSnapshotStore<PluginHubState>(ready())
    const locale = createSnapshotStore<LocaleSnapshot>({ active: 'en', locales: [], revision: 0 })
    const actions = {
      ensure: vi.fn(), reload: vi.fn(), refresh: vi.fn(), add: vi.fn(), remove: vi.fn(),
      enable: vi.fn(), disable: vi.fn(), retry: vi.fn(),
    }
    const props = {
      t: translator(en), ...actions,
      useHub: bindSnapshotSelector(store), useLocale: bindSnapshotSelector(locale),
    } as PluginHubPanelProps
    render(<PluginHubPanel {...props} />)
    expect(screen.getByRole('heading', { name: en.title, level: 1 })).toBeTruthy()
    expect(screen.getByText(en.subtitle)).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: en.search })).toBeTruthy()
    expect(screen.getByText('Alpha Reader')).toBeTruthy()
  })

  it('reuses the layers glyph for the sidebar entry', () => {
    const { container } = render(<PluginHubPanelIcon size={18} />)
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('18')
  })

  it('renders the center copy in the active locale', () => {
    renderTab(ready(), zh)
    expect(screen.getByRole('searchbox', { name: zh.search })).toBeTruthy()
    expect(screen.getByText(zh.riskHigh)).toBeTruthy()
    expect(screen.getByRole('tab', { name: zh.tabAll })).toBeTruthy()
  })
})
