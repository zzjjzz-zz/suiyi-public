/** Real Node IPC delivery into the desktop Host access receiver. */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const childPath = fileURLToPath(new URL('./fixtures/suiyi-access-child.ts', import.meta.url))
const root = fileURLToPath(new URL('../../../', import.meta.url))

interface ChildResult {
  readonly type: 'ready' | 'result'
  readonly accepted?: boolean
  readonly token?: string | null
}

describe('Suiyi access IPC receiver', () => {
  let child: ReturnType<typeof spawn> | undefined

  afterEach(() => {
    child?.removeAllListeners()
    child?.disconnect()
    child?.kill()
    child = undefined
  })

  it('receives a token from a real parent send, applies it once, and ignores a duplicate', async () => {
    const running = spawn(process.execPath, ['--import', 'tsx', childPath], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    child = running
    const expiresAt = Date.now() + 60_000
    const results: ChildResult[] = []
    const done = Promise.withResolvers<undefined>()
    running.on('message', (message: unknown) => {
      if (typeof message !== 'object' || message === null || !('type' in message)) return
      const result = message as ChildResult
      results.push(result)
      if (result.type === 'ready') {
        running.send({
          type: 'suiyi-access-token',
          accessToken: 'ipc-fixture-token',
          expiresAt,
        })
        return
      }
      if (results.filter(entry => entry.type === 'result').length === 1) {
        running.send({
          type: 'suiyi-access-token',
          accessToken: 'ipc-fixture-token',
          expiresAt,
        })
        return
      }
      if (results.filter(entry => entry.type === 'result').length === 2) {
        running.send({ type: 'suiyi-access-token', accessToken: 'Bearer invalid', expiresAt: Date.now() + 60_000 })
        return
      }
      done.resolve(undefined)
    })
    running.stderr?.setEncoding('utf8')
    await new Promise<void>((resolve, reject) => {
      running.once('spawn', () => { resolve() })
      running.once('error', reject)
    })
    await Promise.race([
      done.promise,
      new Promise<never>((_, reject) => setTimeout(() => { reject(new Error('IPC receiver did not answer')) }, 15_000)),
    ])
    const resultsOnly = results.filter(entry => entry.type === 'result')
    expect(resultsOnly).toHaveLength(3)
    expect(resultsOnly[0]).toMatchObject({ accepted: true, token: 'ipc-fixture-token' })
    expect(resultsOnly[1]).toMatchObject({ accepted: false, token: 'ipc-fixture-token' })
    expect(resultsOnly[2]).toMatchObject({ accepted: false, token: 'ipc-fixture-token' })
  }, 20_000)
})
