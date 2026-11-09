/**
 * Verified account identity that scopes every plugin hub decision.
 *
 * The platform Authorization header carries the verified user's access token;
 * the platform derives the account from that token. The launcher separately
 * supplies the issuer and subject of the same verified login; this module
 * validates those claims and derives the opaque scope written beside each
 * durable decision. A decision from another scope is never mounted, so
 * switching accounts cannot expose an earlier account's approved plugins. The
 * issuer and subject bind local storage only and never authorize a request.
 *
 * @module @deepseek-ai/dsh-plugin-hub-client/identity
 */

import { createHash } from 'node:crypto'

/**
 * Verified login facts that own one profile. Both values come from a validated
 * ID token; email, username, and display names never identify the account.
 */
export interface HubIdentity {
  /** Exact `iss` claim of the verified ID token. */
  readonly issuer: string
  /** Stable `sub` claim of the verified ID token. */
  readonly subject: string
}

/** Longest accepted issuer URL; a configuration bound, not a protocol value. */
const MAX_ISSUER_LENGTH = 2048

/** Longest accepted subject; Keycloak subjects are far shorter. */
const MAX_SUBJECT_LENGTH = 256

/** Environment variables the Host launcher may bind the account through. */
export const HUB_IDENTITY_ISSUER_ENV = 'DSH_SUIYI_IDENTITY_ISSUER'
/** Subject variable paired with {@link HUB_IDENTITY_ISSUER_ENV}; both name one identity. */
export const HUB_IDENTITY_SUBJECT_ENV = 'DSH_SUIYI_IDENTITY_SUBJECT'

/** Narrow view of the launcher's immutable environment snapshot. */
export interface HubLaunchEnvironment {
  /**
   * Resolve one name only from the inherited process layer.
   * @param name - environment variable name.
   * @param sources - allowed layers; callers pass `['process']`.
   * @returns the winning entry, or undefined when the layer has no value.
   */
  getFrom(name: string, sources: readonly ['process']): { readonly value: string } | undefined
}

/**
 * Resolve the account identity the launcher placed in the process environment.
 * Only the `process` layer is read, so a project or Harness-home `.env` file
 * can never claim another account. Both variables must be present together;
 * one alone is a launcher defect rather than an unbound profile.
 * @param environment - launcher snapshot, absent outside a dsh profile boot.
 * @returns the validated identity, or undefined when the launcher bound none.
 * @throws TypeError when exactly one variable is present or a value is invalid.
 */
export function hubIdentityFromLauncher(environment: HubLaunchEnvironment | undefined): HubIdentity | undefined {
  if (environment === undefined) return undefined
  const issuer = environment.getFrom(HUB_IDENTITY_ISSUER_ENV, ['process'])?.value
  const subject = environment.getFrom(HUB_IDENTITY_SUBJECT_ENV, ['process'])?.value
  if (issuer === undefined && subject === undefined) return undefined
  if (issuer === undefined || subject === undefined) {
    throw new TypeError(`plugin hub identity requires both ${HUB_IDENTITY_ISSUER_ENV} and ${HUB_IDENTITY_SUBJECT_ENV}`)
  }
  return validateHubIdentity({ issuer, subject })
}

/**
 * Validate one configured identity. The issuer must be a canonical https
 * origin-plus-path without credentials, query, fragment, trailing slash, or
 * surrounding whitespace; the subject must be a non-empty token without
 * whitespace.
 * @param value - configured identity fields.
 * @returns the validated identity.
 * @throws TypeError when either claim could not have come from a verified login.
 */
export function validateHubIdentity(value: HubIdentity): HubIdentity {
  const issuer = value.issuer
  if (issuer.length === 0 || issuer.length > MAX_ISSUER_LENGTH) {
    throw new TypeError('plugin hub identity issuer must be a non-empty https URL')
  }
  let parsed: URL
  try {
    parsed = new URL(issuer)
  } catch (error: unknown) {
    throw new TypeError('plugin hub identity issuer must be an absolute https URL', { cause: error })
  }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== ''
    || parsed.search !== '' || parsed.hash !== ''
    || (parsed.pathname !== '/' && parsed.pathname.endsWith('/'))
    || (parsed.pathname === '/' ? parsed.origin : parsed.origin + parsed.pathname) !== issuer) {
    throw new TypeError('plugin hub identity issuer must be a canonical https URL without credentials, query, fragment, or trailing slash')
  }
  const subject = value.subject
  if (subject.length === 0 || subject.length > MAX_SUBJECT_LENGTH || /\s/u.test(subject)) {
    throw new TypeError('plugin hub identity subject must be a non-empty token without whitespace')
  }
  return { issuer, subject }
}

/**
 * Derive the opaque scope persisted beside one account's decisions. The hash
 * keeps raw issuer and subject values out of Settings and Host diagnostics.
 * @param identity - verified login facts.
 * @returns lowercase sha256 hex of the issuer and subject pair.
 */
export function hubIdentityScope(identity: HubIdentity): string {
  return createHash('sha256').update(identity.issuer, 'utf8').update('\n').update(identity.subject, 'utf8').digest('hex')
}
