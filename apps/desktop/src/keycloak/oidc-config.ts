/** Build-selected Suiyi identity-center configuration; public client, no secrets. */

/** Issuer of the unified Suiyi identity center; strictly matched during discovery. */
export const SUIYI_OIDC_ISSUER = 'https://sso.zzjjzz.top/realms/identity'

/** Public OIDC client id registered in the identity center; no client secret is shipped. */
export const SUIYI_OIDC_CLIENT_ID = 'suiyi-desktop'

/**
 * Read-only local override for the issuer, for development and future server
 * migration. The packaged default stays fixed; a per-machine file may only
 * replace it with an https issuer whose discovery document matches exactly.
 */
export const SUIYI_OIDC_ISSUER_SETTING = 'suiyi-oidc-issuer.json'

/**
 * Resolve the effective issuer for this installation. Only a missing override
 * file (ENOENT) keeps the packaged default; any other read error, malformed
 * JSON, or non-https issuer is rejected so a broken override cannot silently
 * redirect logins.
 * @param userData - directory holding the optional override file. The login
 * gate passes the shared pre-login userData root: the override is
 * machine-wide configuration, so it must be readable before any user is
 * known and must not land inside a per-user directory.
 * @param readFile - file reader injected for tests.
 * @returns the issuer URL, or a typed failure for an unreadable or invalid override.
 */
export async function resolveSuiyiOidcIssuer(
  userData: string,
  readFile: (path: string) => Promise<string> = defaultReadFile,
): Promise<{ readonly ok: true; readonly issuer: string } | { readonly ok: false; readonly reason: string }> {
  const path = `${userData}/${SUIYI_OIDC_ISSUER_SETTING}`
  let raw: string
  try {
    raw = await readFile(path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      return { ok: false, reason: `${SUIYI_OIDC_ISSUER_SETTING} is unreadable (${code ?? 'unknown error'})` }
    }
    // Absent override keeps the packaged default; no other read failure may.
    return { ok: true, issuer: SUIYI_OIDC_ISSUER }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: `${SUIYI_OIDC_ISSUER_SETTING} is not valid JSON` }
  }
  if (typeof parsed !== 'object' || parsed === null || !('issuer' in parsed)
    || typeof (parsed as Record<string, unknown>).issuer !== 'string') {
    return { ok: false, reason: `${SUIYI_OIDC_ISSUER_SETTING} must hold {"issuer": "https://…"}` }
  }
  const issuerCandidate = (parsed as Record<string, unknown>).issuer
  if (typeof issuerCandidate !== 'string') {
    return { ok: false, reason: `${SUIYI_OIDC_ISSUER_SETTING} must hold {"issuer": "https://…"}` }
  }
  const issuer = issuerCandidate
  let url: URL
  try {
    url = new URL(issuer)
  } catch {
    return { ok: false, reason: `${SUIYI_OIDC_ISSUER_SETTING} issuer is not a valid URL` }
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== ''
    || url.search !== '' || url.hash !== '' || url.pathname.endsWith('/')
    || url.href !== issuer) {
    return { ok: false, reason: `${SUIYI_OIDC_ISSUER_SETTING} issuer must be a plain https URL` }
  }
  return { ok: true, issuer }
}

async function defaultReadFile(path: string): Promise<string> {
  const { readFile } = await import('node:fs/promises')
  return readFile(path, 'utf8')
}
