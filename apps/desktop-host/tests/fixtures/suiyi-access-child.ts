/** Real Node IPC child exercising the Suiyi access receiver and service. */

import { Context } from '@deepseek-ai/cordis'
import { SuiyiAccess, SuiyiAccessInbox } from '../../src/suiyi-access.ts'

const ctx = new Context()
// Keep the concrete provider for inbox/accept; ctx.get() exposes the consumer interface only.
const access = new SuiyiAccess(ctx)
const inbox = new SuiyiAccessInbox()
inbox.attach(access)
process.on('message', (message: unknown) => {
  const accepted = inbox.accept(message)
  process.send?.({
    type: 'result',
    accepted,
    token: access.current()?.accessToken ?? null,
  })
})
process.send?.({ type: 'ready' })
