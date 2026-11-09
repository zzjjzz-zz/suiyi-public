/** Cross-end assembly: the real Electron sender and the real Host token service over Node IPC. */
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { sendSuiyiAccessToken } from '../src/host-process.ts'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const fixture = join(import.meta.dirname, 'fixtures', 'suiyi-access-host.ts')
const children: ChildProcess[] = []

/** Wait for one typed message from the fixture. */
function nextMessage(child: ChildProcess, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error(`fixture did not send ${type}`)) }, 15_000)
    const receive = (message: unknown): void => {
      if (typeof message !== 'object' || message === null || !('type' in message) || message.type !== type) return
      clearTimeout(timer)
      child.off('message', receive)
      resolve(message as Record<string, unknown>)
    }
    child.on('message', receive)
  })
}

/** Spawn the fixture through tsx so it imports the real Cordis service source. */
function startFixture(): ChildProcess {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_USE_ENV_PROXY
  delete env.HTTP_PROXY
  delete env.HTTPS_PROXY
  delete env.http_proxy
  delete env.https_proxy
  delete env.ALL_PROXY
  delete env.all_proxy
  const child = spawn(process.execPath, ['--import', 'tsx/esm', fixture], {
    cwd: repositoryRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  children.push(child)
  return child
}

afterEach(() => {
  for (const child of children.splice(0)) child.kill('SIGTERM')
})

describe('Suiyi access token transport', () => {
  it('delivers and rotates the token through the Host private channel only', async () => {
    const child = startFixture()
    await nextMessage(child, 'mounted')
    const first = { accessToken: 'header.payload.signature', expiresAt: Date.now() + 60_000 }
    sendSuiyiAccessToken(child, first)
    const observed = await nextMessage(child, 'observed')
    expect(observed).toMatchObject({ accessToken: first.accessToken, expiresAt: first.expiresAt, env: null })
    expect((observed.argv as string[]).join(' ')).not.toContain(first.accessToken)

    const second = { accessToken: 'header.payload.rotated', expiresAt: Date.now() + 120_000 }
    sendSuiyiAccessToken(child, second)
    await expect(nextMessage(child, 'observed')).resolves.toMatchObject({
      accessToken: second.accessToken,
      expiresAt: second.expiresAt,
    })
  }, 30_000)
})
