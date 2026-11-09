/** Filesystem ownership for the Electron-managed desktop installation. */

import { createHash } from 'node:crypto'
import { mkdirSync, lstatSync } from 'node:fs'
import { join, parse, resolve, sep } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Stable desktop installation paths under the shared Harness home. */
export interface DesktopPaths {
  readonly profile: string
  readonly lock: string
}

/**
 * Resolve every Electron-owned path without changing the shared data roots.
 * @param dshHome - Harness home shared with npm-installed dsh.
 * @returns immutable desktop path set.
 */
export function resolveDesktopPaths(dshHome: string = resolveDshHome()): DesktopPaths {
  return {
    profile: join(dshHome, 'profiles', 'desktop'),
    lock: join(dshHome, 'profiles', 'desktop', 'lock'),
  }
}

/** Sibling data roots: Chromium cleanup cannot reach persistent Host or agent data. */
export function suiyiDataPaths(appData: string) {
  const root = join(appData, 'Suiyi')
  return { userData: join(root, 'electron'), sessionData: join(root, 'chromium'),
    home: join(root, 'dsh-home'), agents: join(root, 'agents-home') }
}

/**
 * Verified identity facts accepted for per-user data partitioning. Only
 * `issuer` and `sub` from a validated ID token qualify; email, username, and
 * display names never partition data because they are reassignable.
 */
export interface SuiyiVerifiedIdentity {
  /** Exact `iss` claim value of a validated ID token. */
  readonly issuer: string
  /** Stable `sub` claim value of a validated ID token. */
  readonly sub: string
}

/**
 * Hash a verified (issuer, sub) pair into the fixed-length directory name.
 * The pair is what the identity center proves stable; raw values never
 * appear in a path, so usernames, emails, or profile edits cannot rename or
 * collide with a user's directory. Blank (empty or whitespace-only) or
 * non-string fields are rejected: they would otherwise give every malformed
 * identity the same directory.
 * @param verifiedIdentity - issuer and sub from a validated ID token.
 * @returns lowercase hex sha256 of the pair; stable across re-logins.
 * @throws when issuer or sub is not a non-empty, non-blank string.
 */
export function suiyiUserDirectory(verifiedIdentity: SuiyiVerifiedIdentity): string {
  if (typeof verifiedIdentity.issuer !== 'string' || verifiedIdentity.issuer.trim() === ''
    || typeof verifiedIdentity.sub !== 'string' || verifiedIdentity.sub.trim() === '') {
    throw new Error('Suiyi user storage requires a verified issuer and subject')
  }
  return createHash('sha256').update(`${verifiedIdentity.issuer}\n${verifiedIdentity.sub}`).digest('hex')
}

/**
 * Per-user data root, a sibling of the shared `electron`/`chromium` roots so
 * Chromium-scoped cleanup of those cannot reach persistent per-user Host or
 * agent data.
 * @param appData - OS per-application data root (Electron `appData`).
 * @param verifiedIdentity - issuer and sub from a validated ID token.
 * @returns the `<appData>/Suiyi/users/<sha256>` directory of this identity.
 */
function suiyiUserRoot(appData: string, verifiedIdentity: SuiyiVerifiedIdentity): string {
  return join(appData, 'Suiyi', 'users', suiyiUserDirectory(verifiedIdentity))
}

/**
 * Per-user data roots under the shared Suiyi installation. Distinct verified
 * identities get distinct roots; the same identity re-logs into the same
 * roots.
 * @param appData - OS per-application data root (Electron `appData`).
 * @param verifiedIdentity - issuer and sub from a validated ID token.
 * @returns user-scoped home and agents-home paths.
 */
export function suiyiUserPaths(appData: string, verifiedIdentity: SuiyiVerifiedIdentity) {
  const user = suiyiUserRoot(appData, verifiedIdentity)
  return { home: join(user, 'dsh-home'), agents: join(user, 'agents-home'),
    userData: join(user, 'electron'), sessionData: join(user, 'chromium') }
}

/**
 * Select the authenticated user's application data directory. Chromium's
 * sessionData path is fixed before Electron becomes ready and must not be
 * changed here; the Suiyi window uses a user-specific session partition.
 * This is not operating-system user isolation.
 * @param application - Electron application whose userData/sessionData move.
 * @param appData - OS per-application data root (Electron `appData`).
 * @param verifiedIdentity - issuer and sub from a validated ID token.
 * @returns the user-scoped path set the application now uses.
 * @throws when any user storage component is a symbolic link or junction.
 */
export function applySuiyiUserElectronStorage(application: {
  getPath(name: 'appData' | 'userData'): string
  setPath(name: 'userData', path: string): void
}, appData: string, verifiedIdentity: SuiyiVerifiedIdentity): ReturnType<typeof suiyiUserPaths> {
  const paths = initializeSuiyiUserStorage(appData, verifiedIdentity)
  application.setPath('userData', paths.userData)
  return paths
}

/**
 * Per-user Host environment, mirroring the shared-host rules: inherited
 * `DSH_*` configuration is replaced, never merged, so one account cannot
 * inherit another account's model keys or agent configuration.
 * @param environment - inherited process environment.
 * @param appData - OS per-application data root.
 * @param verifiedIdentity - issuer and sub from a validated ID token.
 * @returns Suiyi Host environment with `DSH_HOME`/`DSH_AGENTS_HOME` pointing at this user's roots.
 */
export function suiyiUserHostEnvironment(
  environment: NodeJS.ProcessEnv, appData: string, verifiedIdentity: SuiyiVerifiedIdentity,
): NodeJS.ProcessEnv {
  const paths = suiyiUserPaths(appData, verifiedIdentity)
  // Model and tool credentials must come from this user's own profile, not
  // an API key inherited from the Windows login shell or another process.
  return { ...Object.fromEntries(Object.entries(environment).filter(([key]) =>
    !/^DSH_/iu.test(key) && !/(?:^|_)(?:API_KEY|TOKEN|AUTH_TOKEN|ACCESS_KEY_ID|SECRET_ACCESS_KEY|SECRET|PASSWORD)$/iu.test(key))),
  DSH_DESKTOP_FLAVOR: 'suiyi',
  DSH_HOME: paths.home,
  DSH_AGENTS_HOME: paths.agents,
  // Non-secret verified identity the plugin hub scopes decisions by. The access
  // token never travels through the environment; it uses the private Host channel.
  DSH_SUIYI_IDENTITY_ISSUER: verifiedIdentity.issuer,
  DSH_SUIYI_IDENTITY_SUBJECT: verifiedIdentity.sub }
}

/**
 * Create one user's data roots, refusing links or junctions so a user
 * directory cannot point at upstream data or another user's roots. Every
 * component is checked before creating any child directory.
 * Only `Suiyi/users/<hash>` and its children are created; nothing is moved,
 * migrated, or deleted.
 * @param appData - OS per-application data root.
 * @param verifiedIdentity - issuer and sub from a validated ID token.
 * @returns the created user path set.
 * @throws when any component on the user path is a symbolic link or junction.
 */
export function initializeSuiyiUserStorage(appData: string, verifiedIdentity: SuiyiVerifiedIdentity): ReturnType<typeof suiyiUserPaths> {
  const paths = suiyiUserPaths(appData, verifiedIdentity)
  const userRoot = suiyiUserRoot(appData, verifiedIdentity)
  for (const path of [userRoot, ...Object.values(paths)]) ensureSuiyiDirectory(path)
  return paths
}

/** Check ancestors from the filesystem root before creating each missing directory. */
function ensureSuiyiDirectory(path: string): void {
  const absolute = resolve(path)
  const root = parse(absolute).root
  let current = root
  for (const part of absolute.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current, part)
    let stat
    try {
      stat = lstatSync(current)
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
      mkdirSync(current)
      stat = lstatSync(current)
    }
    if (stat.isSymbolicLink()) throw new Error('Suiyi user storage must not be a link or junction')
    if (!stat.isDirectory()) throw new Error('Suiyi user storage must be a directory')
  }
}

/** Replace inherited Harness configuration before resolving any Host paths or spawning a Host. */
export function suiyiHostEnvironment(environment: NodeJS.ProcessEnv, appData: string): NodeJS.ProcessEnv {
  const paths = suiyiDataPaths(appData)
  return { ...Object.fromEntries(Object.entries(environment).filter(([key]) => !/^DSH_/iu.test(key))),
    DSH_HOME: paths.home, DSH_AGENTS_HOME: paths.agents }
}

/** Set Electron storage before its first userData/log lookup and before claiming the instance lock. */
export function initializeSuiyiStorage(application: {
  getPath(name: 'appData'): string
  setPath(name: 'userData' | 'sessionData', path: string): void
  setName(name: string): void
}, environment: NodeJS.ProcessEnv): void {
  const appData = application.getPath('appData')
  const paths = suiyiDataPaths(appData)
  for (const path of [join(appData, 'Suiyi'), ...Object.values(paths)]) {
    mkdirSync(path, { recursive: true })
    if (lstatSync(path).isSymbolicLink()) throw new Error('Suiyi storage must not be a link or junction')
  }
  application.setName('Suiyi')
  application.setPath('userData', paths.userData)
  application.setPath('sessionData', paths.sessionData)
  const isolated = suiyiHostEnvironment(environment, appData)
  for (const key of Object.keys(environment)) {
    if (/^DSH_/iu.test(key) && !/^DSH_DESKTOP_/iu.test(key)) Reflect.deleteProperty(environment, key)
  }
  environment.DSH_HOME = isolated.DSH_HOME
  environment.DSH_AGENTS_HOME = isolated.DSH_AGENTS_HOME
}
