/** In-memory access token delivery: shape, replacement, duplicate, expiry, inbox, and teardown. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  parseSuiyiAccessMessage,
  SuiyiAccess,
  SuiyiAccessInbox,
  validateAccessTokenValue,
} from '../src/suiyi-access.ts'

const MESSAGE = { type: 'suiyi-access-token', accessToken: 'header.payload.signature', expiresAt: 2_000_000_000_000 }

/** One mounted service with a disposable context. */
async function fixture(initial?: { accessToken: string; expiresAt: number }): Promise<{ ctx: Context; access: SuiyiAccess }> {
  const ctx = new Context()
  // The concrete provider, not the consumer-facing ctx.get() view: fixture assertions need accept/clear.
  const access = new SuiyiAccess(ctx, initial)
  return { ctx, access }
}

afterEach(() => { vi.useRealTimers() })

describe('Suiyi access service', () => {
  it('accepts only a raw access token', () => {
    expect(validateAccessTokenValue('header.payload.signature')).toBe('header.payload.signature')
    for (const value of ['', 'Bearer header.payload.signature', 'two words', 't'.repeat(16_385), 42, undefined]) {
      expect(() => validateAccessTokenValue(value)).toThrow()
    }
  })

  it('parses the IPC delivery and rejects foreign or malformed messages', () => {
    expect(parseSuiyiAccessMessage(MESSAGE)).toEqual({ accessToken: MESSAGE.accessToken, expiresAt: MESSAGE.expiresAt })
    expect(parseSuiyiAccessMessage({ ...MESSAGE, type: 'other' })).toBeUndefined()
    expect(parseSuiyiAccessMessage({ ...MESSAGE, accessToken: 'Bearer x' })).toBeUndefined()
    expect(parseSuiyiAccessMessage({ ...MESSAGE, expiresAt: 0 })).toBeUndefined()
    expect(parseSuiyiAccessMessage({ ...MESSAGE, expiresAt: 1.5 })).toBeUndefined()
    expect(parseSuiyiAccessMessage(null)).toBeUndefined()
    expect(parseSuiyiAccessMessage({ type: 'suiyi-access-token' })).toBeUndefined()
  })

  it('ignores duplicates, stale deliveries, and already-expired values', async () => {
    const expiresAt = Date.now() + 60_000
    const { ctx, access } = await fixture({ accessToken: 'one', expiresAt })
    try {
      expect(access.current()).toMatchObject({ accessToken: 'one' })
      expect(access.accept({ accessToken: 'one', expiresAt })).toBe(false)
      expect(access.accept({ accessToken: 'stale', expiresAt: Date.now() + 30_000 })).toBe(false)
      expect(access.accept({ accessToken: 'expired', expiresAt: Date.now() - 1 })).toBe(false)
      expect(access.current()).toMatchObject({ accessToken: 'one' })
      expect(access.accept({ accessToken: 'two', expiresAt: Date.now() + 90_000 })).toBe(true)
      expect(access.current()).toMatchObject({ accessToken: 'two' })
    } finally { await ctx.fiber.dispose() }
  })

  it('notifies subscribers on replacement and clear, and stops at expiry', async () => {
    vi.useFakeTimers()
    const { ctx, access } = await fixture({ accessToken: 'one', expiresAt: Date.now() + 1_000 })
    const changes: number[] = []
    const stop = access.subscribe(() => { changes.push(Date.now()) })
    try {
      access.accept({ accessToken: 'two', expiresAt: Date.now() + 5_000 })
      expect(changes).toHaveLength(1)
      access.clear()
      expect(access.current()).toBeUndefined()
      expect(changes).toHaveLength(2)
      stop()
      access.accept({ accessToken: 'three', expiresAt: Date.now() + 5_000 })
      expect(changes).toHaveLength(2)
      vi.advanceTimersByTime(5_001)
      expect(access.current()).toBeUndefined()
    } finally {
      stop()
      await ctx.fiber.dispose()
    }
  })

  it('notifies subscribers when the provider context is disposed and clears the token', async () => {
    const { ctx, access } = await fixture({ accessToken: 'one', expiresAt: Date.now() + 60_000 })
    let changes = 0
    access.subscribe(() => { changes += 1 })
    await ctx.fiber.dispose()
    expect(changes).toBe(1)
    expect(access.current()).toBeUndefined()
  })

  it('buffers a delivery that arrives before the service, applies it once, and ignores invalid messages', async () => {
    const inbox = new SuiyiAccessInbox()
    expect(inbox.accept({ ...MESSAGE, type: 'other' })).toBe(false)
    expect(inbox.accept({ ...MESSAGE, accessToken: 'Bearer x' })).toBe(false)
    expect(inbox.accept(MESSAGE)).toBe(true)
    const { ctx, access } = await fixture()
    try {
      inbox.attach(access)
      expect(access.current()).toMatchObject({ accessToken: MESSAGE.accessToken })
      expect(inbox.accept(MESSAGE)).toBe(false)
      inbox.detach()
      expect(inbox.accept({ ...MESSAGE, accessToken: 'after-detach' })).toBe(true)
    } finally { await ctx.fiber.dispose() }
  })
})
