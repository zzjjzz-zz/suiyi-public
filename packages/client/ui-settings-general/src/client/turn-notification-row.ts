/** Registers the notification preference with the live Session service. */
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { TurnNotifications, browserTurnNotifications, type TurnNotificationSettings } from './turn-notifications.ts'
import { TurnNotificationRow, type TurnNotificationRowInjected } from './TurnNotificationRow.tsx'
import { GENERAL_SETTINGS_NAMESPACE } from './motion-preference.ts'

/**
 * Bind settings, completion observation and browser permission to one plugin lifetime.
 * @param ctx - client context owning General settings.
 */
export function installTurnNotificationRow(ctx: Context): void {
  ctx.inject(['uiSession'], (scoped) => {
    const connection = scoped.get('connection') as ConnectionHandle
    const notifications = new TurnNotifications(
      scoped.configForms.get<TurnNotificationSettings>(GENERAL_SETTINGS_NAMESPACE),
      listener => scoped.uiSession.onTurnCompleted(listener), browserTurnNotifications,
      () => scoped.locale.bind('settings')('turnComplete.title'),
    )
    scoped.effect(() => {
      notifications.start()
      const connect = (): void => { notifications.setConnected(connection.state.getSnapshot() === 'connected') }
      const focus = (): void => { notifications.refresh() }
      const offConnection = connection.state.subscribe(connect)
      const offReset = scoped.on('connection/reset', () => { notifications.reset() })
      window.addEventListener('focus', focus)
      connect()
      return () => {
        offConnection()
        offReset()
        window.removeEventListener('focus', focus)
        notifications.dispose()
      }
    }, 'ui-settings-general: completion notifications')
    scoped.effect(() => scoped.slots.inject('settings.general.item', () => scoped.slots.register({
      name: 'settings.general.item', id: 'turn-complete-notification', order: 2, locale: 'settings',
      inject: (): TurnNotificationRowInjected => ({
        hooks: { notification: notifications.state }, setEnabled: value => notifications.setEnabled(value),
      }),
    }, TurnNotificationRow)))
  })
}
