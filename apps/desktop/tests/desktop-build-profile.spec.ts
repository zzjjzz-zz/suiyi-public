import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

// Bundler configs run in their own Node program, outside the Host TypeScript project.
function preloadProfile(environment: NodeJS.ProcessEnv): string {
  return execFileSync(process.execPath, ['--import', 'tsx/esm', '--input-type=module', '--eval', `
    const { default: configurations } = await import('./apps/desktop/tsdown.config.ts')
    const preload = configurations.find(config => typeof config.entry === 'object' && 'preload-app' in config.entry)
    console.log(preload?.define?.['process.env.DSH_CLIENT_BUILD_PROFILE'])
  `], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)),
    env: environment,
    encoding: 'utf8',
  }).trim()
}

it.each(['suiyi', 'official', 'local'])(
  'keeps the %s selector when standalone Desktop builds obtain repository metadata', (profile) => {
    expect(preloadProfile({
      ...process.env,
      DSH_BUILD_CLIENT_PROFILE: profile,
      DSH_CLIENT_BUILD_PROFILE: undefined,
      DSH_CLIENT_VERSION: undefined,
      DSH_CLIENT_COMMIT_HASH: undefined,
    })).toBe(JSON.stringify(profile))
  },
)

it('retains an already resolved Suiyi environment passed by the root build', () => {
  expect(preloadProfile({
    ...process.env,
    DSH_BUILD_CLIENT_PROFILE: undefined,
    DSH_CLIENT_BUILD_PROFILE: 'suiyi',
    DSH_CLIENT_VERSION: '0.2.2-rc.1',
    DSH_CLIENT_COMMIT_HASH: '0123456',
  })).toBe('"suiyi"')
})
