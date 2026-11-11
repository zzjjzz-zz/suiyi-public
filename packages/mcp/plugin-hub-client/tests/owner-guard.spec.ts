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

/** Child-to-parent edges; the absence of an entry means an independent Agent. */
function lineage(edges: ReadonlyMap<object, object | undefined>): {
  isChild: (agent: object) => boolean
  parentOf: (agent: object) => object | undefined
} {
  return {
    isChild: agent => edges.has(agent),
    parentOf: agent => edges.get(agent),
  }
}

describe('hub invocation ownership across subagent generations', () => {
  it('tightens an admitted owner-child turn on later guest steering without an empty input clearing it', () => {
    const parent = {}
    const child = {}
    const owners = new HubInvocationOwners(lineage(new Map([[child, parent]])))
    owners.noteStep(parent, 1, [OWNER])
    owners.adopt(child)
    owners.noteStep(child, 1, [OWNER])
    owners.noteStep(child, 1, [])
    expect(owners.permits(child)).toBe(true)
    owners.noteStep(child, 1, [GUEST])
    expect(owners.permits(child)).toBe(false)
    owners.noteStep(child, 1, [])
    owners.noteStep(child, 1, [OWNER])
    expect(owners.permits(child)).toBe(false)
  })

  it('refuses descendants of a live creator that has never admitted owner input', () => {
    const parent = {}
    const child = {}
    const grandchild = {}
    const owners = new HubInvocationOwners(lineage(new Map([[child, parent], [grandchild, child]])))
    owners.adopt(child)
    owners.noteStep(child, 1, [OWNER])
    owners.adopt(grandchild)
    owners.noteStep(grandchild, 1, [OWNER])
    expect(owners.permits(child)).toBe(false)
    expect(owners.permits(grandchild)).toBe(false)
  })

  it('lets an owner-attributed child of an owner parent call, including through a grandchild', () => {
    const edges = new Map<object, object | undefined>()
    const owners = new HubInvocationOwners(lineage(edges))
    const parent = {}
    const child = {}
    const grandchild = {}
    owners.noteStep(parent, 1, [OWNER])
    edges.set(child, parent)
    owners.adopt(child)
    owners.noteStep(child, 1, [undefined])
    edges.set(grandchild, child)
    owners.adopt(grandchild)
    owners.noteStep(grandchild, 1, [])
    owners.noteStep(grandchild, 2, [])
    expect(owners.permits(parent)).toBe(true)
    expect(owners.permits(child)).toBe(true)
    expect(owners.permits(grandchild)).toBe(true)
  })

  it('keeps a guest-born child and every later generation blocked after the parent becomes owner', () => {
    const edges = new Map<object, object | undefined>()
    const owners = new HubInvocationOwners(lineage(edges))
    const parent = {}
    const child = {}
    const grandchild = {}
    owners.noteStep(parent, 1, [GUEST])
    edges.set(child, parent)
    owners.adopt(child)
    owners.noteStep(child, 1, [GUEST])
    owners.noteStep(parent, 2, [OWNER])
    owners.noteStep(child, 2, [OWNER])
    edges.set(grandchild, child)
    owners.adopt(grandchild)
    owners.noteStep(grandchild, 1, [OWNER])
    expect(owners.permits(parent)).toBe(true)
    expect(owners.permits(child)).toBe(false)
    expect(owners.permits(grandchild)).toBe(false)
  })

  it('freezes a guest ceiling when the parent is only guest-steered during the spawning turn', () => {
    const edges = new Map<object, object | undefined>()
    const owners = new HubInvocationOwners(lineage(edges))
    const parent = {}
    const child = {}
    owners.noteStep(parent, 1, [OWNER])
    owners.noteStep(parent, 1, [GUEST])
    edges.set(child, parent)
    owners.adopt(child)
    owners.noteStep(child, 1, [OWNER])
    expect(owners.permits(child)).toBe(false)
  })

  it('still refuses a child that was never adopted, such as a resumed historical child', () => {
    const edges = new Map<object, object | undefined>()
    const owners = new HubInvocationOwners(lineage(edges))
    const parent = {}
    const resumed = {}
    owners.noteStep(parent, 1, [OWNER])
    edges.set(resumed, parent)
    owners.noteStep(resumed, 1, [OWNER])
    expect(owners.permits(resumed)).toBe(false)
  })

  it('refuses a child whose creator is not live at adoption', () => {
    const edges = new Map<object, object | undefined>()
    const owners = new HubInvocationOwners(lineage(edges))
    const orphan = {}
    edges.set(orphan, undefined)
    owners.adopt(orphan)
    owners.noteStep(orphan, 1, [OWNER])
    expect(owners.permits(orphan)).toBe(false)
  })

  it('blocks a guest input inside an owner child turn but restores on a later owner turn', () => {
    const edges = new Map<object, object | undefined>()
    const owners = new HubInvocationOwners(lineage(edges))
    const parent = {}
    const child = {}
    owners.noteStep(parent, 1, [OWNER])
    edges.set(child, parent)
    owners.adopt(child)
    owners.noteStep(child, 1, [GUEST])
    expect(owners.permits(child)).toBe(false)
    owners.noteStep(child, 1, [OWNER])
    expect(owners.permits(child)).toBe(false)
    owners.noteStep(child, 2, [])
    expect(owners.permits(child)).toBe(false)
    owners.noteStep(child, 3, [OWNER])
    expect(owners.permits(child)).toBe(true)
  })
})
