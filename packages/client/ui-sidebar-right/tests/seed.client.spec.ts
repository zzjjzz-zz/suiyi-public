// @vitest-environment jsdom
/** The default workbench seed prefers real session content over the empty guide. */
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { defaultSeed } from '../src/client/contract/seed.ts'
import { SidebarRightTabRegistry } from '../src/client/tab-registry.ts'
import { guideDefinition } from '../src/client/tabs/guide/definition.ts'

const t = ((key: string) => key) as Parameters<typeof guideDefinition>[0]

const contexts: Context[] = []
afterEach(async () => {
  for (const context of contexts.splice(0)) await context.fiber.dispose()
})

function registry(): SidebarRightTabRegistry {
  const context = new Context()
  contexts.push(context)
  const tabs = new SidebarRightTabRegistry(context)
  tabs.register(guideDefinition(t))
  return tabs
}

describe('defaultSeed', () => {
  it('starts on the real files page when that provider is registered', () => {
    const tabs = registry()
    tabs.register({ id: 'test/files', kind: 'files', title: () => 'Files' })
    expect(defaultSeed(tabs)).toEqual({ kind: 'files', title: 'Files' })
  })

  it('keeps the sole guide entry when files is absent', () => {
    const tabs = registry()
    tabs.register({ id: 'test/notes', kind: 'notes', title: () => 'Notes', guide: [{ id: 'notes', order: 1, title: () => 'Notes' }] })
    expect(defaultSeed(tabs)).toEqual({ kind: 'notes', title: 'Notes' })
  })

  it('falls back to the guide when the registry offers several doors', () => {
    const tabs = registry()
    for (const kind of ['a', 'b']) {
      tabs.register({ id: `test/${kind}`, kind, title: () => kind, guide: [{ id: kind, order: 1, title: () => kind }] })
    }
    expect(defaultSeed(tabs)).toEqual({ kind: 'guide', title: 'tab.guide.title' })
  })
})
