/**
 * Lifecycle-bound in-memory access token for the Suiyi Host.
 *
 * Electron delivers the verified user's access token over the private Node IPC
 * channel. This module validates the delivery, owns the current value, expires
 * it, and notifies consumers. The token is never written to the environment,
 * argv, files, logs, Settings, a renderer, or a child process environment.
 *
 * @module @deepseek-ai/dsh-desktop-host/suiyi-access
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { SuiyiAccess as SuiyiAccessContract, SuiyiAccessToken } from '@deepseek-ai/dsh-plugin-hub-client/access'

/** Longest accepted bearer credential; the platform refuses longer values. */
const MAX_ACCESS_TOKEN_LENGTH = 16_384

/**
 * Validate one raw access-token value. A value that already carries a scheme,
 * whitespace, or an unbounded length is refused so the Host never sends a
 * malformed Authorization header.
 * @param value - candidate raw token.
 * @returns the token when acceptable.
 * @throws TypeError when the value is not a raw bearer token.
 */
export function validateAccessTokenValue(value: unknown): string {
  if (typeof value !== 'string' || value === '') {
    throw new TypeError('Suiyi access token must be a non-empty raw bearer token')
  }
  if (value.length > MAX_ACCESS_TOKEN_LENGTH || /\s/u.test(value) || /^Bearer\s/iu.test(value)) {
    throw new TypeError('Suiyi access token must not carry whitespace or a Bearer prefix')
  }
  return value
}

/**
 * Parse one IPC delivery. The message shape is shared with the Electron
 * sender; foreign or malformed values are rejected without echoing the token.
 * @param value - `message` payload received from the parent process.
 * @returns the validated delivery, or undefined for a foreign message.
 */
export function parseSuiyiAccessMessage(value: unknown): SuiyiAccessToken | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  if (!('type' in value) || value.type !== 'suiyi-access-token') return undefined
  if (!('accessToken' in value) || !('expiresAt' in value)) return undefined
  let accessToken: string
  try {
    accessToken = validateAccessTokenValue(value.accessToken)
  } catch {
    return undefined
  }
  const expiresAt = value.expiresAt
  if (typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt) || expiresAt <= 0) return undefined
  return { accessToken, expiresAt }
}

/**
 * Own the current verified access token and its expiry. One instance lives on
 * the Host context; the Electron side replaces the value when the login is
 * refreshed, and every consumer reads the current value at its next operation.
 */
export class SuiyiAccess extends Service implements SuiyiAccessContract {
  private token: SuiyiAccessToken | undefined
  private expiryTimer: ReturnType<typeof setTimeout> | undefined
  private readonly listeners = new Set<() => void>()

  /**
   * @param ctx - Host context; teardown clears the token and its timer.
   * @param initial - already-received delivery, when the Host buffered one before mounting.
   */
  constructor(ctx: Context, initial?: SuiyiAccessToken) {
    super(ctx, 'suiyiAccess')
    const parsed = initial === undefined ? undefined : parseDelivery(initial)
    if (parsed !== undefined) this.store(parsed)
    ctx.effect(() => () => {
      const listeners = [...this.listeners]
      this.token = undefined
      this.listeners.clear()
      this.clearTimer()
      for (const listener of listeners) listener()
    }, 'suiyiAccess: in-memory token')
  }

  /**
   * Current unexpired token, or undefined when none was delivered or the
   * delivery has expired.
   * @returns the current access token facts.
   */
  current(): SuiyiAccessToken | undefined {
    if (this.token === undefined) return undefined
    return this.token.expiresAt > Date.now() ? this.token : undefined
  }

  /**
   * Accept one delivery. A duplicate or an older delivery is ignored; a newer
   * one atomically replaces the current value and notifies subscribers.
   * @param value - parsed delivery or raw IPC message.
   * @returns true when the current value changed.
   */
  accept(value: unknown): boolean {
    const next = parseDelivery(value)
    if (next === undefined) return false
    if (next.expiresAt <= Date.now()) return false
    if (this.token !== undefined && next.expiresAt < this.token.expiresAt) return false
    if (this.token?.accessToken === next.accessToken && this.token.expiresAt === next.expiresAt) return false
    this.store(next)
    for (const listener of [...this.listeners]) listener()
    return true
  }

  /**
   * Remove the current token and notify subscribers. Used when the Host stops
   * or an identity-changing token must be withdrawn.
   */
  clear(): void {
    if (this.token === undefined) return
    this.token = undefined
    this.clearTimer()
    for (const listener of [...this.listeners]) listener()
  }

  /**
   * Observe token changes; the listener reads {@link current} at its call.
   * @param listener - change recipient.
   * @returns disposer removing the listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Store one accepted value and arm its expiry notification. */
  private store(next: SuiyiAccessToken): void {
    this.token = next
    this.clearTimer()
    this.armExpiry(next)
  }

  /**
   * Arm the next expiry check. Node timers cap at a signed 32-bit delay, so a
   * far-future delivery is checked in bounded steps rather than firing early.
   * @param next - token whose expiry is observed.
   */
  private armExpiry(next: SuiyiAccessToken): void {
    // Node's documented timer ceiling; a longer delay fires immediately.
    const MAX_TIMER_DELAY_MS = 2_147_483_647
    const delay = Math.min(Math.max(next.expiresAt - Date.now(), 0), MAX_TIMER_DELAY_MS)
    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = undefined
      if (this.token?.accessToken !== next.accessToken) return
      if (Date.now() < next.expiresAt) {
        this.armExpiry(next)
        return
      }
      this.token = undefined
      for (const listener of [...this.listeners]) listener()
    }, delay)
    this.expiryTimer.unref()
  }

  /** Clear the expiry notification. */
  private clearTimer(): void {
    if (this.expiryTimer === undefined) return
    clearTimeout(this.expiryTimer)
    this.expiryTimer = undefined
  }
}

/**
 * Buffer token deliveries until the Host context's access service is mounted.
 *
 * A delivery received before {@link attach} is retained only in memory; later
 * deliveries are handed to the service, whose duplicate/stale/expiry rules
 * apply. Invalid or foreign messages are ignored without echoing the value.
 */
export class SuiyiAccessInbox {
  private service: SuiyiAccess | undefined
  private pending: SuiyiAccessToken | undefined

  /**
   * Accept one IPC message.
   * @param message - untrusted `process.on('message')` payload.
   * @returns true when a valid delivery was buffered or applied.
   */
  accept(message: unknown): boolean {
    const token = parseSuiyiAccessMessage(message)
    if (token === undefined) return false
    if (this.service === undefined) {
      this.pending = token
      return true
    }
    return this.service.accept(token)
  }

  /**
   * Read and clear the last delivery received before the service existed.
   * @returns the buffered delivery, or undefined when none arrived.
   */
  takePending(): SuiyiAccessToken | undefined {
    const pending = this.pending
    this.pending = undefined
    return pending
  }

  /**
   * Attach the mounted service. Any buffered delivery is applied immediately.
   * @param service - Host access-token service.
   */
  attach(service: SuiyiAccess): void {
    this.service = service
    const pending = this.takePending()
    if (pending !== undefined) service.accept(pending)
  }

  /** Stop forwarding deliveries while the Host is stopping. */
  detach(): void {
    this.service = undefined
    this.pending = undefined
  }
}

/**
 * Parse a delivery that may already be token facts or a raw IPC message.
 * @param value - delivery facts or IPC message.
 * @returns the validated delivery.
 */
function parseDelivery(value: unknown): SuiyiAccessToken | undefined {
  if (typeof value === 'object' && value !== null
    && 'accessToken' in value && 'expiresAt' in value && !('type' in value)) {
    try {
      const accessToken = validateAccessTokenValue(value.accessToken)
      const expiresAt = value.expiresAt
      if (typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt) || expiresAt <= 0) return undefined
      return { accessToken, expiresAt }
    } catch {
      return undefined
    }
  }
  return parseSuiyiAccessMessage(value)
}
