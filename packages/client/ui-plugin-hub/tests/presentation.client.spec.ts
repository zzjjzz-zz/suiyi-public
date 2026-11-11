import { describe, expect, it } from 'vitest'
import type { CatalogPlugin, PluginInstanceView, PublishedTool } from '../src/client/contract.ts'
import { categoriesOf, instanceOf, isActive, isAdded, isOlderRelease, rowState, visiblePlugins } from '../src/client/presentation.ts'

function tool(name: string, description?: string): PublishedTool {
  return { name, ...description === undefined ? {} : { description }, inputSchema: { type: 'object' } }
}

function plugin(id: string, fields: Partial<CatalogPlugin> = {}): CatalogPlugin {
  return {
    pluginId: id,
    workloadId: `workload-${id}`,
    releaseVersion: '1.0.0',
    name: `Plugin ${id}`,
    description: `Description of ${id}`,
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

const snapshot = (plugins: CatalogPlugin[], instances: PluginInstanceView[] = []) => ({
  plugins, catalogVersion: 'catalog-7', instances, enabled: true,
})

describe('visiblePlugins', () => {
  const plugins = [
    plugin('alpha', { name: 'Alpha Reader', category: 'research', description: 'Reads papers' }),
    plugin('beta', { name: 'Beta Writer', category: 'writing', description: 'Writes notes', allowedTools: [tool('compose', 'Compose a draft')] }),
    plugin('gamma', { name: 'Gamma', category: '', description: '' }),
  ]

  it('keeps catalog order for an empty query', () => {
    expect(visiblePlugins(plugins, { text: '  ', category: null }).map(item => item.pluginId)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('matches names, ids, categories, descriptions, and approved tools without case', () => {
    expect(visiblePlugins(plugins, { text: 'alpha', category: null }).map(item => item.pluginId)).toEqual(['alpha'])
    expect(visiblePlugins(plugins, { text: 'GAMMA', category: null }).map(item => item.pluginId)).toEqual(['gamma'])
    expect(visiblePlugins(plugins, { text: 'writing', category: null }).map(item => item.pluginId)).toEqual(['beta'])
    expect(visiblePlugins(plugins, { text: 'papers', category: null }).map(item => item.pluginId)).toEqual(['alpha'])
    expect(visiblePlugins(plugins, { text: 'compose a draft', category: null }).map(item => item.pluginId)).toEqual(['beta'])
  })

  it('combines the text and category filters', () => {
    expect(visiblePlugins(plugins, { text: 'reader', category: 'writing' })).toEqual([])
    expect(visiblePlugins(plugins, { text: '', category: 'research' }).map(item => item.pluginId)).toEqual(['alpha'])
  })
})

describe('categoriesOf', () => {
  it('deduplicates, skips empty declarations, and keeps catalog order', () => {
    const plugins = [
      plugin('a', { category: 'Tools' }),
      plugin('b', { category: 'Design' }),
      plugin('c', { category: 'Tools' }),
      plugin('d', { category: '' }),
      plugin('e', { category: '  ' }),
    ]
    expect(categoriesOf(plugins)).toEqual(['Tools', 'Design'])
  })
})

describe('instanceOf and rowState', () => {
  const instances: PluginInstanceView[] = [
    { pluginId: 'alpha', releaseVersion: '1.0.0', state: 'enabled', authorized: true, added: true },
    { pluginId: 'beta', releaseVersion: '0.9.0', state: 'error', authorized: true, error: 'starting failed', added: true },
    { pluginId: 'gamma', releaseVersion: '1.0.0', state: 'connecting', authorized: true, added: true },
    { pluginId: 'delta', releaseVersion: '1.0.0', state: 'disabled', authorized: false, added: false },
  ]

  it('finds the instance of a plugin and reports a missing one as not enabled', () => {
    const catalog = snapshot([plugin('alpha'), plugin('missing')], instances)
    expect(instanceOf(catalog, 'beta')).toMatchObject({ state: 'error' })
    expect(instanceOf(catalog, 'missing')).toBeUndefined()
    expect(rowState(undefined)).toBe('disabled')
  })

  it('maps every instance state to its row state', () => {
    for (const instance of instances) expect(rowState(instance)).toBe(instance.state)
  })

  it('reads the Host added flag, including a failed or connecting row', () => {
    const catalog = snapshot([plugin('alpha'), plugin('beta'), plugin('missing')], instances)
    expect(isAdded(catalog, 'alpha')).toBe(true)
    expect(isAdded(catalog, 'beta')).toBe(true)
    expect(isAdded(catalog, 'gamma')).toBe(true)
    expect(isAdded(catalog, 'delta')).toBe(false)
    expect(isAdded(catalog, 'missing')).toBe(false)
  })

  it('keeps an added but disabled row and treats a removed row as not added', () => {
    const paused: PluginInstanceView = {
      pluginId: 'paused', releaseVersion: '1.0.0', state: 'disabled', authorized: false, added: true,
    }
    const removed: PluginInstanceView = {
      pluginId: 'removed', releaseVersion: '1.0.0', state: 'disabled', authorized: false, added: false,
    }
    const catalog = snapshot([plugin('paused'), plugin('removed')], [paused, removed])
    expect(isAdded(catalog, 'paused')).toBe(true)
    expect(isAdded(catalog, 'removed')).toBe(false)
    expect(isActive(paused)).toBe(false)
    expect(isActive(instances[0])).toBe(true)
  })

  it('reports a release older than the catalog only when the instance trails it', () => {
    const current = plugin('alpha')
    expect(isOlderRelease(current, instances[0])).toBe(false)
    expect(isOlderRelease(current, instances[1])).toBe(true)
    expect(isOlderRelease(current, undefined)).toBe(false)
  })
})
