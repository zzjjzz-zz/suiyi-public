/** Real Host access service child used by the cross-end transport assembly test. */
import { Context } from '@deepseek-ai/cordis'
import { SuiyiAccess, SuiyiAccessInbox } from '../../../desktop-host/src/suiyi-access.ts'

const inbox = new SuiyiAccessInbox()
const ctx = new Context()
const access = new SuiyiAccess(ctx, inbox.takePending())
inbox.attach(access)
// The Host entry installs this branch in its private message handler.
process.on('message', (message: unknown) => {
  if (typeof message !== 'object' || message === null || !('type' in message)
    || message.type !== 'suiyi-access-token') return
  inbox.accept(message)
  setImmediate(() => {
    const current = access.current()
    process.send?.({
      type: 'observed',
      accessToken: current?.accessToken ?? null,
      expiresAt: current?.expiresAt ?? null,
      env: process.env.DSH_SUIYI_ACCESS_TOKEN ?? null,
      argv: process.argv,
    })
  })
})
process.send?.({ type: 'mounted' })
