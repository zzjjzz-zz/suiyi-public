/**
 * Generate the dependency declarations this plugin's strict Browser program type-checks against.
 *
 * `partial-react` and `partial-tsx` publish TypeScript sources rather than declarations. Those
 * sources predate this repository's `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, and
 * `noImplicitOverride` settings, so they are compiled here in their own relaxed program and only
 * their emitted declarations enter the plugin program. The dependency versions, source digests,
 * and output digests are recorded so `--check` proves the committed declarations still match the
 * locked packages rather than asserting it.
 *
 * Run `node scripts/generate-dependency-types.mjs` to regenerate; `--check` regenerates into a
 * temporary directory and fails on any byte difference.
 */

import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const pluginRoot = resolve(import.meta.dirname, '..')
const repositoryRoot = resolve(pluginRoot, '..', '..')
const generatedRoot = join(pluginRoot, 'types', 'generated')
const PACKAGES = ['partial-react', 'partial-tsx']

/** Walk from a package entry point to the directory whose package.json declares its name. */
function packageRootOf(entry) {
  let directory = dirname(entry)
  for (;;) {
    const manifest = join(directory, 'package.json')
    if (existsSync(manifest)) {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
      if (typeof parsed.name === 'string') return { root: directory, manifest: parsed }
    }
    const parent = dirname(directory)
    if (parent === directory) throw new Error(`generate-dependency-types: no package root above ${entry}`)
    directory = parent
  }
}

function sourceFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(path))
    else if (/\.(?:ts|tsx)$/u.test(entry.name) && !/\.test\./u.test(entry.name)) files.push(path)
  }
  return files.sort()
}

function digestFiles(files, root) {
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(relative(root, file).split(sep).join('/'))
    hash.update('\0')
    hash.update(readFileSync(file))
    hash.update('\0')
  }
  return hash.digest('hex')
}

function manifestFor(output, packages) {
  return {
    formatVersion: 1,
    generator: 'plugins/dsh-generative-ui/scripts/generate-dependency-types.mjs',
    packages: Object.fromEntries(packages.map(pkg => [pkg.name, {
      version: pkg.version,
      sourceSha256: pkg.sourceSha256,
      declarationsSha256: digestFiles(sourceFiles(join(output, pkg.name)), output),
    }])),
  }
}

function writeGenerated(output, packages) {
  rmSync(generatedRoot, { recursive: true, force: true })
  cpSync(output, generatedRoot, { recursive: true })
  writeFileSync(join(generatedRoot, 'manifest.json'), `${JSON.stringify(manifestFor(generatedRoot, packages), null, 2)}\n`)
}

function compile(packages, output) {
  const work = mkdtempSync(join(tmpdir(), 'dsh-genui-deps-'))
  const rootNames = []
  try {
    for (const pkg of packages) {
      const target = join(work, pkg.name)
      cpSync(join(pkg.root, 'src'), join(target, 'src'), { recursive: true })
      // Module resolution starts at the copied source path. Linking the real package's own
      // node_modules keeps its locked transitive declarations available without installing
      // anything into the working tree.
      // Junction is the Windows-compatible directory link; Node treats it as a directory elsewhere.
      symlinkSync(dirname(pkg.root), join(target, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
      rootNames.push(...sourceFiles(join(target, 'src')))
    }
    const options = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      jsx: ts.JsxEmit.ReactJSX,
      declaration: true,
      emitDeclarationOnly: true,
      strict: true,
      skipLibCheck: true,
      allowImportingTsExtensions: true,
      rewriteRelativeImportExtensions: true,
      exactOptionalPropertyTypes: false,
      noUncheckedIndexedAccess: false,
      noImplicitOverride: false,
      noUnusedLocals: false,
      noUnusedParameters: false,
      types: ['node'],
      typeRoots: [join(repositoryRoot, 'node_modules', '@types')],
      // The React packages publish no declarations of their own; map the repository's
      // installed @types packages explicitly because bundler resolution otherwise stops
      // at the JS entry whose package.json exports do not list the DefinitelyTyped files.
      paths: {
        'react': [join(repositoryRoot, 'node_modules/@types/react')],
        'react/*': [join(repositoryRoot, 'node_modules/@types/react/*')],
        'react-dom': [join(repositoryRoot, 'node_modules/@types/react-dom')],
        'react-dom/*': [join(repositoryRoot, 'node_modules/@types/react-dom/*')],
      },
      rootDir: work,
      outDir: output,
    }
    const program = ts.createProgram(rootNames, options)
    const emit = program.emit()
    const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emit.diagnostics]
    if (diagnostics.length > 0) {
      throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: file => file,
        getCurrentDirectory: () => process.cwd(),
        getNewLine: () => '\n',
      }))
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

function main() {
  const check = process.argv.includes('--check')
  const packages = PACKAGES.map(name => {
    const entry = require.resolve(name)
    const { root, manifest } = packageRootOf(entry)
    if (typeof manifest.version !== 'string') throw new Error(`generate-dependency-types: ${name} has no version`)
    return { name, root, version: manifest.version, sourceSha256: digestFiles(sourceFiles(join(root, 'src')), root) }
  })
  const output = mkdtempSync(join(tmpdir(), 'dsh-genui-deps-out-'))
  try {
    compile(packages, output)
    const emitted = sourceFiles(output)
    if (emitted.length === 0) throw new Error('generate-dependency-types: dependency compilation emitted no declarations')
    if (!check) {
      writeGenerated(output, packages)
      console.log(`generate-dependency-types: wrote ${String(emitted.length)} declaration(s) for ${packages.map(pkg => `${pkg.name}@${pkg.version}`).join(', ')}`)
      return
    }
    const expected = sourceFiles(generatedRoot)
    const differences = []
    if (!existsSync(generatedRoot)) differences.push('types/generated is absent')
    for (const file of emitted) {
      const target = join(generatedRoot, relative(output, file))
      if (!existsSync(target) || !readFileSync(target).equals(readFileSync(file))) differences.push(relative(output, file))
    }
    for (const file of expected) {
      if (!existsSync(join(output, relative(generatedRoot, file)))) differences.push(`stale: ${relative(generatedRoot, file)}`)
    }
    const expectedManifest = `${JSON.stringify(manifestFor(output, packages), null, 2)}\n`
    const committedManifestPath = join(generatedRoot, 'manifest.json')
    const committedManifest = existsSync(committedManifestPath) ? readFileSync(committedManifestPath, 'utf8') : ''
    if (committedManifest !== expectedManifest) differences.push('manifest.json (versions or input digests changed)')
    if (differences.length > 0) {
      throw new Error(`generate-dependency-types: committed declarations are stale; run node scripts/generate-dependency-types.mjs\n${differences.join('\n')}`)
    }
    console.log(`generate-dependency-types: ${String(emitted.length)} declaration(s) and input digests match ${packages.map(pkg => `${pkg.name}@${pkg.version}`).join(', ')}`)
  } finally {
    rmSync(output, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
