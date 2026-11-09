/**
 * Consumer contract for the desktop-provided, in-memory Suiyi access token.
 *
 * The Host provider (`apps/desktop-host`) owns validation, expiry, and
 * replacement; this package only reads the current token at each catalog,
 * MCP, and invocation operation. Types only — no runtime code.
 *
 * @module @deepseek-ai/dsh-plugin-hub-client/access
 */

import type {} from '@deepseek-ai/cordis'

/** One accepted access-token delivery. */
export interface SuiyiAccessToken {
  /** Raw bearer token; never logged or persisted. */
  readonly accessToken: string
  /** Access-token expiry in epoch milliseconds. */
  readonly expiresAt: number
}

/**
 * Lifecycle-bound current token exposed by the desktop Host.
 * `current` returns undefined when no delivery was accepted or it expired.
 */
export interface SuiyiAccess {
  /**
   * Read the current unexpired token for one catalog, MCP, or invocation
   * operation. It is undefined when no delivery was accepted, the delivery
   * expired, or the provider cleared it.
   * @returns the current token facts, or undefined when none is usable.
   */
  current(): SuiyiAccessToken | undefined
  /**
   * Observe replacement, expiry, and clear events.
   * @param listener - change recipient; it reads {@link current} at its call.
   * @returns disposer removing the listener.
   */
  subscribe(listener: () => void): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional desktop-provided current user access token. */
    suiyiAccess: SuiyiAccess
  }
}
