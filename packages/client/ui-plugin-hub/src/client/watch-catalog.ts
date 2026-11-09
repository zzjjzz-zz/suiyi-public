/** The shared Remote stream supervisor owns reconnect and cancellation. */
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { PluginHubSnapshot } from './contract.ts'
import type { PluginHubController } from './hub-store.ts'

/**
 * Follow catalog and connection changes for this browser plugin's lifetime.
 * @param remote - the Client Remote assembly that owns the stream supervisor.
 * @param controller - the controller that publishes accepted snapshots.
 * @returns the disposable stream subscription.
 */
export function watchCatalog(remote: ClientRemote, controller: PluginHubController): () => Promise<void> {
  const lifetime = { stopped: false }
  const unavailable = (): void => { if (!lifetime.stopped) controller.connectionUnavailable() }
  const stream = remote.$stream<PluginHubSnapshot>({
    name: 'plugin hub catalog',
    open: signal => remote.pluginHub.watch(signal),
    ended: () => new Error('plugin hub catalog stream ended'),
    carrierFailed: unavailable,
  })
  void (async () => {
    try {
      for await (const frame of stream) {
        if (lifetime.stopped) return
        frame.accept()
        controller.acceptSnapshot(frame.value)
      }
    } catch { unavailable() }
  })()
  return async () => { lifetime.stopped = true; await stream.dispose() }
}
