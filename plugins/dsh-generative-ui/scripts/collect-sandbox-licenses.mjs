/**
 * Collect the licenses for every package the offline sandbox bundle embeds.
 *
 * The sandbox is served as one ESM file, so the license texts a browser bundle normally carries
 * as separate files have to ship beside it. The index records the exact version, the declared
 * SPDX expression, and the copied file for each package. Packages that publish no license file
 * are listed with an empty `files` array rather than silently omitted.
 */

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'

/** Packages whose code is embedded in `lib/sandbox/runtime.js` or its wasm. */
export const BUNDLED_PACKAGES = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom/client',
  'react-dom/server',
  'scheduler',
  'partial-react',
  'partial-react/import-map',
  'partial-tsx',
  '@esm.sh/tsx',
  '@unocss/core',
  '@unocss/preset-wind4',
  '@jridgewell/sourcemap-codec',
  '@jridgewell/trace-mapping',
  '@jridgewell/resolve-uri',
  '@unocss/rule-utils',
  '@unocss/extractor-arbitrary-variants',
  'magic-string',
]

const LICENSE_FILE = /^(?:LICEN[CS]E|COPYING)(?:\..*)?$/iu

/** Upstream license text where the published package omits its own copy. */
const LOCAL_LICENSE_OVERRIDES = new Map([
  ['@unocss/', {
    file: join(import.meta.dirname, 'licenses', 'unocss-LICENSE.txt'),
    source: 'https://raw.githubusercontent.com/unocss/unocss/v66.12.0/packages-integrations/vscode/LICENSE',
  }],
])

function packageRootOf(entry) {
  let directory = dirname(entry)
  for (;;) {
    const manifestPath = join(directory, 'package.json')
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      if (typeof manifest.name === 'string') return { root: directory, manifest }
    }
    const parent = dirname(directory)
    if (parent === directory) throw new Error(`collect-sandbox-licenses: no package root above ${entry}`)
    directory = parent
  }
}

function licenseFiles(root) {
  return readdirSync(root).filter(name => LICENSE_FILE.test(name)).sort()
}

function digest(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function treeDigest(root) {
  const hash = createHash('sha256')
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) {
        hash.update(relative(root, path).split(sep).join('/'))
        hash.update('\0')
        hash.update(readFileSync(path))
        hash.update('\0')
      }
    }
  }
  visit(root)
  return hash.digest('hex')
}

function sourceOf(manifest) {
  const repository = manifest.repository
  const raw = typeof repository === 'string' ? repository : repository?.url
  return typeof raw === 'string' ? raw.replace(/^git\+/u, '') : null
}

/**
 * Write `lib/sandbox/licenses` for the bundle built from `packageDir`.
 * @param packageDir - plugin package root containing `node_modules` and the generated `lib`.
 * @returns the written index path.
 */
export function collectSandboxLicenses(packageDir) {
  const require = createRequire(join(packageDir, 'package.json'))
  const destination = join(packageDir, 'lib', 'sandbox', 'licenses')
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(destination, { recursive: true })
  const records = []
  const seen = new Set()
  // A package's transitive dependencies are resolvable from that package's own node_modules even
  // when pnpm did not link them at this package. Grow the resolver set until every listed package
  // either resolves or is genuinely absent.
  const resolvers = [require]
  const resolved = new Map()
  for (let changed = true; changed;) {
    changed = false
    for (const specifier of BUNDLED_PACKAGES) {
      if (resolved.has(specifier)) continue
      for (const resolver of resolvers) {
        try {
          const entry = resolver.resolve(specifier)
          const { root, manifest } = packageRootOf(entry)
          resolved.set(specifier, { root, manifest })
          resolvers.push(createRequire(join(root, 'package.json')))
          changed = true
          break
        } catch {
          // Try the next resolver; absence is reported by the bundle build, not by this collector.
        }
      }
    }
  }
  for (const specifier of BUNDLED_PACKAGES) {
    const found = resolved.get(specifier)
    if (found === undefined) continue
    const { root, manifest } = found
    const name = typeof manifest.name === 'string' ? manifest.name : specifier
    if (seen.has(name)) continue
    seen.add(name)
    const files = licenseFiles(root).map(file => {
      const target = join(destination, `${name.replaceAll(/[/@]/gu, '-').replace(/^-/u, '')}-${file}`)
      copyFileSync(join(root, file), target)
      return { file: relative(destination, target).split(sep).join('/'), sha256: digest(target) }
    })
    const override = files.length === 0
      ? [...LOCAL_LICENSE_OVERRIDES].find(([prefix]) => name.startsWith(prefix))?.[1]
      : undefined
    if (override !== undefined) {
      const target = join(destination, `${name.replaceAll(/[/@]/gu, '-').replace(/^-/u, '')}-LICENSE`)
      copyFileSync(override.file, target)
      files.push({ file: relative(destination, target).split(sep).join('/'), sha256: digest(target), source: override.source })
    }
    records.push({
      package: name,
      version: typeof manifest.version === 'string' ? manifest.version : null,
      license: typeof manifest.license === 'string' ? manifest.license : null,
      source: sourceOf(manifest),
      sourceSha256: treeDigest(root),
      files,
    })
  }
  const notice = resolve(packageDir, 'NOTICE')
  if (existsSync(notice)) copyFileSync(notice, join(destination, 'PROJECT-NOTICE.txt'))
  const license = resolve(packageDir, 'LICENSE')
  if (existsSync(license)) copyFileSync(license, join(destination, 'PROJECT-LICENSE.txt'))
  const repositoryNotice = resolve(packageDir, '..', '..', 'THIRD_PARTY_NOTICES.md')
  if (existsSync(repositoryNotice)) copyFileSync(repositoryNotice, join(destination, 'THIRD_PARTY_NOTICES.md'))
  const missing = records.filter(record => record.files.length === 0)
  const noticePath = join(destination, 'MISSING-LICENSE-NOTICE.txt')
  writeFileSync(noticePath, [
    'Offline sandbox third-party license notice',
    '',
    'These packages are embedded in lib/sandbox/runtime.js but their published tarballs do not',
    'include a license file. The index records the declared SPDX expression, repository source,',
    'and source digest. No license text is invented here.',
    '',
    ...missing.flatMap(record => [
      `${record.package}@${record.version ?? 'unknown'}`,
      `  declared license: ${record.license ?? 'not declared'}`,
      `  source: ${record.source ?? 'not declared'}`,
      `  source sha256: ${record.sourceSha256}`,
      '',
    ]),
  ].join('\n'))
  const indexPath = join(destination, 'index.json')
  writeFileSync(indexPath, `${JSON.stringify({ formatVersion: 1, packages: records }, null, 2)}\n`)
  if (missing.length > 0) {
    console.warn(`collect-sandbox-licenses: no license file in ${missing.map(record => record.package).join(', ')}; index and MISSING-LICENSE-NOTICE record the omission`)
  }
  return indexPath
}
