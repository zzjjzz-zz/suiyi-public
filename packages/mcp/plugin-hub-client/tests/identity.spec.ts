/** Verified-account binding: claim validation and the opaque persisted scope. */

import { describe, expect, it } from 'vitest'
import {
  HUB_IDENTITY_ISSUER_ENV,
  HUB_IDENTITY_SUBJECT_ENV,
  hubIdentityFromLauncher,
  hubIdentityScope,
  validateHubIdentity,
  type HubIdentity,
} from '../src/identity.ts'

const IDENTITY: HubIdentity = { issuer: 'https://sso.example.test/realms/identity', subject: 'a6c1f0a2-3f95-4b56-9d2f-0a1e6a3b1c11' }

describe('hub identity', () => {
  it('accepts a canonical Keycloak issuer and a stable subject', () => {
    expect(validateHubIdentity(IDENTITY)).toEqual(IDENTITY)
    expect(validateHubIdentity({ issuer: 'https://sso.example.test', subject: 'subject-1' })).toEqual({
      issuer: 'https://sso.example.test',
      subject: 'subject-1',
    })
  })

  it('rejects an issuer that a verified https ID token could not report', () => {
    const cases: Array<[string, string]> = [
      ['', 'non-empty'],
      ['http://sso.example.test/realms/identity', 'canonical https URL'],
      ['https://user:secret@sso.example.test/realms/identity', 'without credentials'],
      ['https://:secret@sso.example.test/realms/identity', 'without credentials'],
      ['https://sso.example.test/realms/identity/', 'trailing slash'],
      ['https://sso.example.test/realms/identity?x=1', 'query'],
      ['https://sso.example.test/realms/identity#fragment', 'fragment'],
      ['https://sso.example.test:443/realms/identity', 'canonical https URL'],
      ['HTTPS://SSO.EXAMPLE.TEST/realms/identity', 'canonical https URL'],
      ['not a url', 'absolute https URL'],
      [`https://sso.example.test/${'a'.repeat(2048)}`, 'non-empty https URL'],
    ]
    for (const [issuer, message] of cases) {
      expect(() => validateHubIdentity({ issuer, subject: 'subject-1' })).toThrow(message)
    }
  })

  it('rejects a subject a verified login could not report', () => {
    for (const subject of ['', '   ', 'two words', 'line\nbreak', 's'.repeat(257)]) {
      expect(() => validateHubIdentity({ issuer: IDENTITY.issuer, subject })).toThrow('subject')
    }
  })

  it('resolves the launcher binding only from the inherited process layer', () => {
    const calls: Array<{ name: string; sources: readonly string[] }> = []
    const environment = (values: Record<string, string>): {
      getFrom(name: string, sources: readonly ['process']): { readonly value: string } | undefined
    } => ({
      getFrom(name, sources) {
        calls.push({ name, sources })
        const value = values[name]
        return value === undefined ? undefined : { value }
      },
    })
    expect(hubIdentityFromLauncher(undefined)).toBeUndefined()
    expect(hubIdentityFromLauncher(environment({}))).toBeUndefined()
    expect(() => hubIdentityFromLauncher(environment({ [HUB_IDENTITY_ISSUER_ENV]: IDENTITY.issuer }))).toThrow('requires both')
    expect(() => hubIdentityFromLauncher(environment({ [HUB_IDENTITY_SUBJECT_ENV]: IDENTITY.subject }))).toThrow('requires both')
    expect(hubIdentityFromLauncher(environment({
      [HUB_IDENTITY_ISSUER_ENV]: IDENTITY.issuer,
      [HUB_IDENTITY_SUBJECT_ENV]: IDENTITY.subject,
    }))).toEqual(IDENTITY)
    expect(() => hubIdentityFromLauncher(environment({
      [HUB_IDENTITY_ISSUER_ENV]: 'http://insecure.example.test',
      [HUB_IDENTITY_SUBJECT_ENV]: IDENTITY.subject,
    }))).toThrow('canonical https URL')
    expect(calls.every(call => call.sources.length === 1 && call.sources[0] === 'process')).toBe(true)
    expect(new Set(calls.map(call => call.name))).toEqual(new Set([HUB_IDENTITY_ISSUER_ENV, HUB_IDENTITY_SUBJECT_ENV]))
  })

  it('derives a stable opaque scope from the issuer and subject pair', () => {
    const scope = hubIdentityScope(IDENTITY)
    expect(scope).toMatch(/^[0-9a-f]{64}$/)
    expect(hubIdentityScope({ ...IDENTITY })).toBe(scope)
    expect(hubIdentityScope({ ...IDENTITY, issuer: 'https://other.example.test/realms/identity' })).not.toBe(scope)
    expect(hubIdentityScope({ ...IDENTITY, subject: 'another-subject' })).not.toBe(scope)
    expect(scope).not.toContain(IDENTITY.subject)
  })
})
