/** User-enabled system notifications for live, normally completed answers. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SessionTurnCompletion, SessionTurnCompletionListener } from '@deepseek-ai/dsh-client-ui-session/client'

/** Persisted intent; browser permission remains local to this client. */
export interface TurnNotificationSettings {
  turnCompleteNotification: boolean
}

/** Browser notification operations, supplied separately from persisted settings. */
export interface TurnNotificationPort {
  /** @returns the current browser permission, or unsupported. */
  permission(): NotificationPermission | 'unsupported'
  /** @returns permission requested directly from the user's toggle gesture. */
  requestPermission(): Promise<NotificationPermission>
  /**
   * @param title - localized notification title.
   * @param completion - Session title and completed turn identity; no answer text.
   * @param closed - release tracking after browser dismissal.
   * @param failed - report asynchronous notification delivery failure.
   * @returns a disposer closing this notification.
   */
  show(title: string, completion: SessionTurnCompletion, closed: () => void, failed: () => void): () => void
}

/** Current notification permission and accepted preference for the settings row. */
export interface TurnNotificationState {
  requested: boolean
  enabled: boolean
  writable: boolean
  reason: 'unsupported' | 'denied' | 'permission' | 'error' | null
}

/** Owns live subscriptions and closes notifications on disconnect or disposal. */
export class TurnNotifications {
  /** Observable settings-row state. */
  readonly state = createSnapshotStore<TurnNotificationState>({ requested: false, enabled: false, writable: false, reason: null })
  private offForm: (() => void) | undefined
  private offCompletion: (() => void) | undefined
  private readonly open = new Map<string, () => void>()
  private generation = 0
  private connected = false
  private awaitingSettings = false
  private failed = false
  private disposed = false

  /**
   * @param form - Host-accepted notification intent and ordered writer.
   * @param subscribe - live successful turn-completion source.
   * @param port - browser notification operations.
   * @param title - current localized notification title.
   */
  constructor(private readonly form: ConfigForm<TurnNotificationSettings>,
    private readonly subscribe: (listener: SessionTurnCompletionListener) => () => void,
    private readonly port: TurnNotificationPort, private readonly title: () => string) {}

  /** Follow settings until disposal; permission is never requested on startup. */
  start(): void {
    if (this.offForm !== undefined || this.disposed) return
    this.offForm = this.form.subscribe(() => {
      if (this.form.getSnapshot().status === 'ready') this.awaitingSettings = false
      this.refresh()
    })
    this.refresh()
  }

  /**
   * Follow transport availability, invalidating in-flight permission requests on disconnect.
   * @param connected - whether the current Host connection is available.
   */
  setConnected(connected: boolean): void {
    if (this.connected === connected) return
    this.connected = connected
    if (!connected) this.generation += 1
    this.refresh()
  }

  /** Invalidate the old Host's permission requests and wait for refreshed settings. */
  reset(): void {
    this.generation += 1
    this.awaitingSettings = true
    this.refresh()
  }

  /** Re-read permission on window focus or after a settings change. */
  refresh(): void {
    if (this.disposed) return
    const form = this.form.getSnapshot()
    const permission = this.port.permission()
    const writable = this.connected && !this.awaitingSettings && form.status === 'ready' && form.writable
    const enabled = writable && form.value?.turnCompleteNotification === true && permission === 'granted' && !this.failed
    const reason = this.failed ? 'error' : permission === 'unsupported' || permission === 'denied' ? permission
      : form.value?.turnCompleteNotification && permission === 'default' ? 'permission' : null
    this.state.set({ requested: form.value?.turnCompleteNotification === true, enabled, writable, reason })
    if (enabled && this.offCompletion === undefined) this.offCompletion = this.subscribe((completion) => { this.notify(completion) })
    else if (!enabled) this.stop()
  }

  /**
   * Request permission from the gesture before persisting enabled intent.
   * @param enabled - requested preference.
   * @returns settlement after permission and the Host write; stale operations have no effect.
   */
  async setEnabled(enabled: boolean): Promise<void> {
    if (this.disposed || !this.state.getSnapshot().writable) return
    const generation = ++this.generation
    this.failed = false
    try {
      if (enabled) {
        let permission = this.port.permission()
        if (permission === 'default') permission = await this.port.requestPermission()
        if (generation !== this.generation || this.disposed) return
        if (permission !== 'granted') { this.refresh(); return }
      }
      if (!await this.form.set('turnCompleteNotification', enabled)) throw new Error('Notification preference was not saved')
    } catch (error) {
      if (generation !== this.generation || this.disposed) return
      this.failed = true
      console.error('ui-settings-general: completion notification preference failed', error)
    }
    if (generation === this.generation) this.refresh()
  }

  /** Release subscriptions, pending permission requests and owned notifications. */
  dispose(): void {
    this.disposed = true
    this.generation += 1
    this.offForm?.()
    this.offForm = undefined
    this.stop()
  }

  private notify(completion: SessionTurnCompletion): void {
    this.refresh()
    if (!this.state.getSnapshot().enabled) return
    const generation = this.generation
    const key = `${completion.sessionId}:${completion.turn}`
    this.open.get(key)?.()
    const failed = (): void => {
      if (this.disposed || generation !== this.generation) return
      this.failed = true
      this.refresh()
    }
    try {
      const close = this.port.show(this.title(), completion, () => { this.open.delete(key) }, failed)
      if (this.failed || this.disposed || generation !== this.generation) close()
      else this.open.set(key, close)
    } catch (error) {
      console.error('ui-settings-general: completion notification delivery failed', error)
      failed()
    }
  }

  private stop(): void {
    this.offCompletion?.()
    this.offCompletion = undefined
    for (const close of this.open.values()) close()
    this.open.clear()
  }
}

/** Browser-backed implementation; permissions are read again for every completion. */
export const browserTurnNotifications: TurnNotificationPort = {
  permission: () => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  requestPermission: () => Notification.requestPermission(),
  show: (title, completion, closed, failed) => {
    const notification = new Notification(title, { body: completion.title, tag: `${completion.sessionId}:${completion.turn}` })
    notification.onclose = closed
    notification.onerror = failed
    return () => { notification.close() }
  },
}
