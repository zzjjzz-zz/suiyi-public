/** Per-Agent turn attribution: isolation, same-turn stickiness, recovery, and trusted in-process calls. */

import { describe, expect, it } from 'vitest'
import { HubInvocationOwners } from '../src/owner-guard.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    /** A non-owner caller used to prove attribution and blocking. */
    'owner-guard-guest': { readonly kind: 'owner-guard-guest'; readonly guest: string }
  }
}

const OWNER = { kind: 'owner' }
const GUEST = { kind: 'owner-guard-guest', guest: 'alpha' }

describe('hub invocation ownership', () => {
  it('keeps identities A and B isolated', () => {
    const owners = new HubInvocationOwners()
    const a = {}
    const b = {}
    owners.noteStep(a, 1, [OWNER])
    expect(owners.permits(a)).toBe(true)
    expect(owners.permits(b)).toBe(false)
    owners.noteStep(b, 1, [GUEST])
    expect(owners.permits(a)).toBe(true)
    expect(owners.permits(b)).toBe(false)
  })

  it('stays blocked when a guest input is followed by owner input in the same turn', () => {
    const owners = new HubInvocationOwners()
    const agent = {}
    owners.noteStep(agent, 1, [GUEST])
    expect(owners.permits(agent)).toBe(false)
    owners.noteStep(agent, 1, [OWNER])
    expect(owners.permits(agent)).toBe(false)
    owners.noteStep(agent, 1, [undefined])
    expect(owners.permits(agent)).toBe(false)
  })

  it('does not unblock when the same turn receives any non-owner alongside the owner', () => {
    const owners = new HubInvocationOwners()
    const agent = {}
    owners.noteStep(agent, 1, [OWNER])
    owners.noteStep(agent, 1, [OWNER, GUEST])
    expect(owners.permits(agent)).toBe(false)
    owners.noteStep(agent, 1, [OWNER])
    expect(owners.permits(agent)).toBe(false)
  })

  it('preserves the current state when the same turn has no principal input', () => {
    const owners = new HubInvocationOwners()
    const allowed = {}
    const blocked = {}
    owners.noteStep(allowed, 1, [OWNER])
    owners.noteStep(blocked, 1, [GUEST])
    owners.noteStep(allowed, 1, [])
    owners.noteStep(blocked, 1, [])
    expect(owners.permits(allowed)).toBe(true)
    expect(owners.permits(blocked)).toBe(false)
  })

  it('recovers on a new turn with an explicit owner or undefined principal', () => {
    const owners = new HubInvocationOwners()
    const agent = {}
    owners.noteStep(agent, 1, [GUEST])
    owners.noteStep(agent, 2, [OWNER])
    expect(owners.permits(agent)).toBe(true)
    owners.noteStep(agent, 3, [GUEST])
    owners.noteStep(agent, 4, [undefined])
    expect(owners.permits(agent)).toBe(true)
  })

  it('blocks a new turn with empty principals even after an allowed turn', () => {
    const owners = new HubInvocationOwners()
    const agent = {}
    owners.noteStep(agent, 1, [OWNER])
    expect(owners.permits(agent)).toBe(true)
    owners.noteStep(agent, 2, [])
    expect(owners.permits(agent)).toBe(false)
  })

  it('rejects null and anonymous objects as non-owner attribution', () => {
    const owners = new HubInvocationOwners()
    const nullAgent = {}
    const anonymousAgent = {}
    owners.noteStep(nullAgent, 1, [null])
    owners.noteStep(anonymousAgent, 1, [{}])
    expect(owners.permits(nullAgent)).toBe(false)
    expect(owners.permits(anonymousAgent)).toBe(false)
    owners.noteStep(nullAgent, 2, [OWNER, null])
    expect(owners.permits(nullAgent)).toBe(false)
    owners.noteStep(anonymousAgent, 2, [{}])
    expect(owners.permits(anonymousAgent)).toBe(false)
  })

  it('refuses an Agent with no attribution and permits the trusted in-process call', () => {
    const owners = new HubInvocationOwners()
    const unattributed = {}
    expect(owners.permits(unattributed)).toBe(false)
    owners.noteStep(unattributed, 1, [])
    expect(owners.permits(unattributed)).toBe(false)
    expect(owners.permits(undefined)).toBe(true)
    owners.noteStep(unattributed, 1, [GUEST])
    expect(owners.permits(undefined)).toBe(true)
  })
})
