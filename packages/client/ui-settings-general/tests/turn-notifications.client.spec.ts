/** Completion notification consent, transport lifetime and write failures. */
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SessionTurnCompletion, SessionTurnCompletionListener } from '@deepseek-ai/dsh-client-ui-session/client'
import {
  TurnNotifications, type TurnNotificationPort, type TurnNotificationSettings,
} from '../src/client/turn-notifications.ts'

const completion: SessionTurnCompletion = {
  sessionId: 'session-notification' as SessionTurnCompletion['sessionId'], turn: 1, title: 'Local work', reason: 'completed',
}

function bench(enabled = false) {
  const source = createSnapshotStore<ConfigFormSnapshot<TurnNotificationSettings>>({
    status: 'ready', value: { turnCompleteNotification: enabled }, base: {}, user: {}, revision: 1, writable: true,
  })
  const set = vi.fn<ConfigForm<TurnNotificationSettings>['set']>(async (_field, value) => {
    if (typeof value !== 'boolean') throw new TypeError('Expected boolean preference')
    source.update((draft) => { draft.value = { turnCompleteNotification: value }; draft.revision = (draft.revision ?? 0) + 1 })
    return true
  })
  const form: ConfigForm<TurnNotificationSettings> = {
    getSnapshot: () => source.getSnapshot(), subscribe: listener => source.subscribe(listener), set,
    mutate: async () => true, unset: async () => true,
  }
  let permission: ReturnType<TurnNotificationPort['permission']> = 'default'
  const request = vi.fn<TurnNotificationPort['requestPermission']>(async () => { permission = 'granted'; return permission })
  const deliveries: { close: ReturnType<typeof vi.fn>; failed: () => void }[] = []
  const show = vi.fn<TurnNotificationPort['show']>((_title, _completion, closed, failed) => {
    const close = vi.fn(closed)
    deliveries.push({ close, failed })
    return close
  })
  let listener: SessionTurnCompletionListener | undefined
  const subscribe = vi.fn((next: SessionTurnCompletionListener) => {
    listener = next
    return () => { if (listener === next) listener = undefined }
  })
  const controller = new TurnNotifications(form, subscribe, { permission: () => permission, requestPermission: request, show }, () => 'Answer complete')
  controller.start()
  controller.setConnected(true)
  return { controller, source, set, request, show, deliveries, subscribe,
    permission: (next: typeof permission) => { permission = next },
    emit: () => { listener?.(completion) },
  }
}

describe('completion notifications', () => {
  it('requests consent only from enabling, then follows accepted settings and closes on disable', async () => {
    const b = bench()
    expect(b.request).not.toHaveBeenCalled()
    expect(b.subscribe).not.toHaveBeenCalled()
    await b.controller.setEnabled(true)
    expect(b.request).toHaveBeenCalledOnce()
    expect(b.set).toHaveBeenCalledWith('turnCompleteNotification', true)
    b.emit()
    expect(b.show).toHaveBeenCalledWith('Answer complete', completion, expect.any(Function), expect.any(Function))
    await b.controller.setEnabled(false)
    expect(b.deliveries[0]?.close).toHaveBeenCalledOnce()
    b.emit()
    expect(b.show).toHaveBeenCalledOnce()
    b.controller.dispose()
  })

  it('does not save or subscribe after a pending permission request crosses a Host reset', async () => {
    const b = bench()
    let grant: (value: NotificationPermission) => void = () => { throw new Error('Permission promise not initialized') }
    b.request.mockReturnValueOnce(new Promise((resolve) => { grant = resolve }))
    const pending = b.controller.setEnabled(true)
    expect(b.request).toHaveBeenCalledOnce()
    b.controller.reset()
    grant('granted')
    await pending
    expect(b.set).not.toHaveBeenCalled()
    expect(b.subscribe).not.toHaveBeenCalled()
    expect(b.controller.state.getSnapshot().writable).toBe(false)
    b.controller.dispose()
  })

  it('retains saved intent while revoked permission stops delivery and allows disabling', async () => {
    const b = bench(true)
    b.permission('granted')
    b.controller.refresh()
    b.emit()
    b.permission('denied')
    b.emit()
    expect(b.show).toHaveBeenCalledOnce()
    expect(b.controller.state.getSnapshot()).toMatchObject({ requested: true, enabled: false, reason: 'denied' })
    expect(b.deliveries[0]?.close).toHaveBeenCalledOnce()
    await b.controller.setEnabled(false)
    expect(b.controller.state.getSnapshot().requested).toBe(false)
    b.controller.dispose()
  })

  it('keeps refused writes off and reports asynchronous delivery failure without affecting the turn', async () => {
    const b = bench()
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      b.permission('granted')
      b.set.mockResolvedValueOnce(false)
      await b.controller.setEnabled(true)
      expect(b.controller.state.getSnapshot()).toMatchObject({ requested: false, enabled: false, reason: 'error' })
      expect(b.subscribe).not.toHaveBeenCalled()
      await b.controller.setEnabled(true)
      b.emit()
      b.deliveries[0]?.failed()
      expect(b.controller.state.getSnapshot()).toMatchObject({ requested: true, enabled: false, reason: 'error' })
      expect(b.deliveries[0]?.close).toHaveBeenCalledOnce()
      b.emit()
      expect(b.show).toHaveBeenCalledOnce()
    } finally { b.controller.dispose(); report.mockRestore() }
  })

  it('disconnect and disposal close notifications and invalidate later completions', async () => {
    const b = bench()
    await b.controller.setEnabled(true)
    b.emit()
    b.controller.setConnected(false)
    expect(b.deliveries[0]?.close).toHaveBeenCalledOnce()
    b.emit()
    expect(b.show).toHaveBeenCalledOnce()
    b.controller.dispose()
    b.controller.setConnected(true)
    b.emit()
    expect(b.show).toHaveBeenCalledOnce()
  })
})
