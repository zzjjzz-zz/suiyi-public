/** The visual-output row follows a provider that mounts late, changes, or withdraws. */
import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { VisualOutputReadiness } from '@deepseek-ai/dsh-client-ui-settings/client'
import { installVisualOutputRow } from '../src/client/visual-output-row.ts'
import { visualOutputRowFace } from './inject-face.client.ts'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({
    name: 'root',
    children: { 'settings.general.item': { kind: 'list', scope: 'root' } },
  } as never, () => null)
  await ctx.plugin({ inject: ['slots'], apply: installVisualOutputRow }).await()
  const rows = () => slots.entries('settings.general.item').filter(row => row.options.id === 'visual-output')
  return { ctx, slots, rows }
}

function provider(readiness: VisualOutputReadiness, enabled = false) {
  const readinessSource = createSnapshotStore(readiness)
  const enabledSource = createSnapshotStore(enabled)
  return {
    readinessSource,
    enabledSource,
    service: {
      readiness: readinessSource,
      enabled: enabledSource,
      setEnabled: async (next: boolean) => { enabledSource.set(next); return true },
    },
  }
}

it('keeps one not-installed row and swaps in a provider that mounts later', async () => {
  const { ctx, rows } = await bench()
  expect(rows()).toHaveLength(1)
  expect(rows()[0]!.options.priority).toBe(10)
  const fallbackFace = visualOutputRowFace(rows()[0]!)
  expect(fallbackFace.hooks.readiness.getSnapshot()).toEqual({ ready: false, reason: 'not-installed' })
  expect(await fallbackFace.setEnabled(true)).toBe(false)

  const live = provider({ ready: false, reason: 'isolation' })
  const withdraw = ctx.provide('visualOutput', live.service)
  await vi.waitFor(() => { expect(rows()).toHaveLength(2) })
  const providerRow = rows().find(row => (row.options.priority ?? 0) === 0)!
  const face = visualOutputRowFace(providerRow)
  expect(face.hooks.readiness.getSnapshot()).toEqual({ ready: false, reason: 'isolation' })
  live.readinessSource.set({ ready: true })
  expect(face.hooks.readiness.getSnapshot()).toEqual({ ready: true })
  expect(await face.setEnabled(true)).toBe(true)
  expect(live.enabledSource.getSnapshot()).toBe(true)

  live.readinessSource.set({ ready: false, reason: 'permission' })
  expect(face.hooks.readiness.getSnapshot()).toEqual({ ready: false, reason: 'permission' })

  withdraw()
  await vi.waitFor(() => { expect(rows()).toHaveLength(1) })
  expect(rows()[0]!.options.priority).toBe(10)
})

it('follows a replacement provider without keeping the old source', async () => {
  const { ctx, rows } = await bench()
  const first = provider({ ready: true })
  const withdrawFirst = ctx.provide('visualOutput', first.service)
  await vi.waitFor(() => { expect(rows()).toHaveLength(2) })
  const firstFace = visualOutputRowFace(rows().find(row => (row.options.priority ?? 0) === 0)!)
  expect(firstFace.hooks.readiness.getSnapshot()).toEqual({ ready: true })

  withdrawFirst()
  const second = provider({ ready: false, reason: 'isolation' })
  const withdrawSecond = ctx.provide('visualOutput', second.service)
  await vi.waitFor(() => {
    const face = visualOutputRowFace(rows().find(row => (row.options.priority ?? 0) === 0)!)
    expect(face.hooks.readiness.getSnapshot()).toEqual({ ready: false, reason: 'isolation' })
  })
  withdrawSecond()
  await vi.waitFor(() => { expect(rows()).toHaveLength(1) })
})
