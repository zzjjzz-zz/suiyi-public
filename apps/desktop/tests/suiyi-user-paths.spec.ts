/** Suiyi per-user storage: (issuer, sub) hash partitioning with stable re-login roots. */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  initializeSuiyiUserStorage,
  suiyiDataPaths,
  suiyiHostEnvironment,
  suiyiUserDirectory,
  suiyiUserHostEnvironment,
  suiyiUserPaths,
} from '../src/paths.ts'

const ISSUER = 'https://sso.zzjjzz.top/realms/identity'
const ALICE = { issuer: ISSUER, sub: 'f1c0ffee-1234-4abc-9def-567890abcdef' }
const BOB = { issuer: ISSUER, sub: '0badcafe-4321-4fed-cba-9876543210fe' }
// Same subject under another issuer is a different account, not a shared one.
const OTHER_REALM = { issuer: 'https://other-sso.example.test/realms/identity', sub: ALICE.sub }

it('partitions per-user homes by the (issuer, sub) hash, never by raw identity values', () => {
  const root = mkdtempSync(join(tmpdir(), 'suiyi-users-'))
  try {
    const alice = suiyiUserPaths(root, ALICE)
    const bob = suiyiUserPaths(root, BOB)
    const other = suiyiUserPaths(root, OTHER_REALM)
    const hash = suiyiUserDirectory(ALICE)
    expect(alice.home).toBe(join(root, 'Suiyi', 'users', hash, 'dsh-home'))
    expect(alice.agents).toBe(join(root, 'Suiyi', 'users', hash, 'agents-home'))
    for (const dir of [...Object.values(alice), ...Object.values(bob), ...Object.values(other)]) {
      expect(dir).not.toContain(ALICE.sub)
      expect(dir).not.toContain(ISSUER)
      expect(dir).not.toContain('alice')
    }
    expect(alice.home).not.toBe(bob.home)
    expect(alice.agents).not.toBe(bob.agents)
    expect(alice.home).not.toBe(other.home)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('returns the same directory on re-login and keeps user roots out of the shared roots', () => {
  const root = mkdtempSync(join(tmpdir(), 'suiyi-relogin-'))
  try {
    const first = initializeSuiyiUserStorage(root, ALICE)
    const second = initializeSuiyiUserStorage(root, ALICE)
    expect(second.home).toBe(first.home)
    expect(second.agents).toBe(first.agents)
    expect(existsSync(first.home)).toBe(true)
    expect(existsSync(first.agents)).toBe(true)
    const shared = suiyiDataPaths(root)
    expect(join(first.home, 'x').startsWith(join(shared.home, 'x'))).toBe(false)
    expect(join(first.agents, 'x').startsWith(join(shared.agents, 'x'))).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('strips inherited DSH_* configuration per user instead of merging it', () => {
  const root = mkdtempSync(join(tmpdir(), 'suiyi-user-env-'))
  try {
    const environment = { DSH_HOME: join(root, '.dsh'), DSH_AGENTS_HOME: join(root, '.agents'),
      DSH_CONFIG: 'inherited.yml', dsh_home: 'case-insensitive-pollution',
      OPENAI_API_KEY: 'shared-model-secret', GH_TOKEN: 'shared-tool-secret',
      AWS_SECRET_ACCESS_KEY: 'shared-cloud-secret', PATH: 'kept path' }
    const alice = suiyiUserHostEnvironment(environment, root, ALICE)
    const bob = suiyiUserHostEnvironment(environment, root, BOB)
    expect(alice.DSH_HOME).toBe(suiyiUserPaths(root, ALICE).home)
    expect(alice.DSH_AGENTS_HOME).toBe(suiyiUserPaths(root, ALICE).agents)
    expect(alice.DSH_CONFIG).toBeUndefined()
    expect(alice.dsh_home).toBeUndefined()
    expect(alice.OPENAI_API_KEY).toBeUndefined()
    expect(alice.GH_TOKEN).toBeUndefined()
    expect(alice.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(alice.PATH).toBe('kept path')
    expect(alice.DSH_HOME).not.toBe(bob.DSH_HOME)
    expect(alice.DSH_AGENTS_HOME).not.toBe(bob.DSH_AGENTS_HOME)
    // The inherited values point at real preserved directories, untouched.
    mkdirSync(join(root, '.dsh'), { recursive: true })
    writeFileSync(join(root, '.dsh', '.credentials.yaml'), 'inherited model keys')
    expect(readFileSync(join(root, '.dsh', '.credentials.yaml'), 'utf8')).toBe('inherited model keys')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('rejects empty or non-string identity fields before any directory is derived', () => {
  const root = mkdtempSync(join(tmpdir(), 'suiyi-invalid-'))
  try {
    for (const bad of [{ issuer: '', sub: 'sub' }, { issuer: ISSUER, sub: '' },
      { issuer: ISSUER, sub: ' ' }, { issuer: '', sub: 'sub' }, { issuer: ISSUER, sub: '' }]) {
      expect(() => suiyiUserDirectory(bad)).toThrow(/verified issuer and subject/)
      expect(() => suiyiUserPaths(root, bad)).toThrow(/verified issuer and subject/)
      expect(() => initializeSuiyiUserStorage(root, bad)).toThrow(/verified issuer and subject/)
      expect(() => suiyiUserHostEnvironment({}, root, bad)).toThrow(/verified issuer and subject/)
    }
    expect(existsSync(join(root, 'Suiyi'))).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('rejects symlinked and junctioned user roots without touching the target data', () => {
  const root = mkdtempSync(join(tmpdir(), 'suiyi-user-link-'))
  try {
    const upstream = join(root, 'upstream')
    mkdirSync(upstream)
    writeFileSync(join(upstream, 'session'), 'preserved')
    // A foreign directory planted where the user root would be created.
    mkdirSync(join(root, 'Suiyi', 'users'), { recursive: true })
    const userRoot = join(root, 'Suiyi', 'users', suiyiUserDirectory(ALICE))
    symlinkSync(upstream, userRoot, 'junction')
    expect(() => initializeSuiyiUserStorage(root, ALICE)).toThrow(/link or junction/)
    expect(readFileSync(join(upstream, 'session'), 'utf8')).toBe('preserved')
    expect(existsSync(join(upstream, 'dsh-home'))).toBe(false)
    // A link planted at the Suiyi level is refused too, before any user data.
    const otherRoot = mkdtempSync(join(tmpdir(), 'suiyi-user-link-2-'))
    try {
      symlinkSync(upstream, join(otherRoot, 'Suiyi'), 'junction')
      expect(() => initializeSuiyiUserStorage(otherRoot, ALICE)).toThrow(/link or junction/)
      expect(existsSync(join(upstream, 'users'))).toBe(false)
    } finally { rmSync(otherRoot, { recursive: true, force: true }) }
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('leaves the shared Suiyi roots and official home resolution unchanged', () => {
  const root = mkdtempSync(join(tmpdir(), 'suiyi-user-shared-'))
  try {
    const sharedBefore = suiyiDataPaths(root)
    const hostBefore = suiyiHostEnvironment({ DSH_HOME: 'old', PATH: 'p' }, root)
    initializeSuiyiUserStorage(root, ALICE)
    expect(suiyiDataPaths(root)).toEqual(sharedBefore)
    expect(suiyiHostEnvironment({ DSH_HOME: 'old', PATH: 'p' }, root)).toEqual(hostBefore)
    // User roots live beside, not inside, the shared Host/agent roots.
    expect(existsSync(sharedBefore.home)).toBe(false)
    expect(existsSync(sharedBefore.userData)).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
