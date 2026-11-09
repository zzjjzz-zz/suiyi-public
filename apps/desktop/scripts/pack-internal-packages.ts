/**
 * Pack the private built-in workspace packages the Desktop runtime ships but the
 * public release family deliberately omits.
 *
 * `releaseFamily('dsh')` publishes only public members, so a built-in capability that must not
 * enter npm is absent from its tarball directory. The package-set closure then cannot resolve
 * the dependency `@deepseek-ai/dsh` declares, and Desktop packaging fails instead of silently
 * dropping the capability. This step supplies those tarballs beside the public ones and checks
 * the payload before the Desktop runtime installs it.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pnpmInvocation } from '../../../scripts/pnpm-invocation.ts'
import { tarballName } from '../../../scripts/release/families.ts'
import { packedIdentity, tarballFiles } from '../../../scripts/release/tarball.ts'
import { runConcurrent } from '../../../scripts/release/process.ts'

/** Repository-relative directories of private workspace packages the Desktop payload carries. */
export const DESKTOP_INTERNAL_PACKAGES = ['plugins/dsh-generative-ui'] as const

/**
 * Files each private package must publish. The first two entries are the Loader's two halves;
 * the sandbox files and import maps are the offline assets the built-in capability serves from
 * its own package, and the skill is what the model loads on demand.
 */
const REQUIRED_FILES: Readonly<Record<(typeof DESKTOP_INTERNAL_PACKAGES)[number], readonly string[]>> = {
  'plugins/dsh-generative-ui': [
    'package/package.json',
    'package/lib/index.js',
    'package/lib/client.js',
    'package/lib/sandbox/runtime.js',
    'package/lib/sandbox/tsx_bg.wasm',
    'package/lib/sandbox/licenses/index.json',
    'package/lib/sandbox/licenses/MISSING-LICENSE-NOTICE.txt',
    'package/lib/sandbox/licenses/react-LICENSE',
    'package/lib/sandbox/licenses/esm.sh-tsx-LICENSE',
    'package/lib/sandbox/licenses/unocss-core-LICENSE',
    'package/lib/sandbox/licenses/PROJECT-LICENSE.txt',
    'package/lib/sandbox/licenses/PROJECT-NOTICE.txt',
    'package/src/sandbox/sandbox.html',
    'package/types/importmap.json',
    'package/types/standalone/importmap.json',
    'package/skill/SKILL.md',
    'package/NOTICE',
    'package/LICENSE',
  ],
}

/** One private workspace package selected for the Desktop package set. */
interface InternalPackage {
  readonly directory: string
  readonly name: string
  readonly version: string
}

function manifestAt(root: string, directory: string): InternalPackage {
  const path = join(root, directory, 'package.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
    name?: unknown
    version?: unknown
    private?: unknown
  }
  if (typeof manifest.name !== 'string' || !manifest.name.startsWith('@deepseek-ai/')) {
    throw new Error(`desktop internal pack: ${path} must name an @deepseek-ai package`)
  }
  if (typeof manifest.version !== 'string' || manifest.version === '') {
    throw new Error(`desktop internal pack: ${path} has no version`)
  }
  if (manifest.private !== true) {
    throw new Error(`desktop internal pack: ${path} must stay private so the public release family skips it`)
  }
  return { directory, name: manifest.name, version: manifest.version }
}

async function packOne(destination: string, pkg: InternalPackage): Promise<void> {
  const invocation = pnpmInvocation(['--dir', pkg.directory, 'pack', '--pack-destination', destination])
  await runConcurrent(invocation.command, invocation.args)
  const tarball = join(destination, tarballName({ ...pkg, manifest: {} }))
  if (!existsSync(tarball)) throw new Error(`desktop internal pack: ${pkg.name} produced no tarball at ${tarball}`)
  const identity = packedIdentity(tarball)
  if (identity.name !== pkg.name || identity.version !== pkg.version) {
    throw new Error(`desktop internal pack: ${tarball} declares ${identity.name}@${identity.version}, expected ${pkg.name}@${pkg.version}`)
  }
  const files = new Set(tarballFiles(tarball))
  const missing = REQUIRED_FILES[pkg.directory as keyof typeof REQUIRED_FILES]
    .filter(file => !files.has(file))
  if (missing.length > 0) {
    throw new Error(`desktop internal pack: ${pkg.name} tarball omits required built-in file(s): ${missing.join(', ')}`)
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { out: { type: 'string' } }, allowPositionals: false })
  if (values.out === undefined) throw new Error('desktop internal pack: --out must name the package staging directory')
  const root = process.cwd()
  const destination = resolve(root, values.out)
  const expected = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: unknown }
  const packages = DESKTOP_INTERNAL_PACKAGES.map(directory => manifestAt(root, directory))
  for (const pkg of packages) {
    if (pkg.version !== expected.version) {
      throw new Error(`desktop internal pack: ${pkg.name}@${pkg.version} must match Desktop ${String(expected.version)}`)
    }
  }
  await Promise.all(packages.map(pkg => packOne(destination, pkg)))
  console.log(`desktop internal pack: ${String(packages.length)} tarball(s) in ${values.out}`)
}

await main()
