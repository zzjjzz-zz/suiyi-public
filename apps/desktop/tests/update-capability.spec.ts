import { expect, it } from 'vitest'
import { desktopUpdatesEnabled } from '../src/update-capability.ts'

it.each([false, true])('keeps an explicitly disabled package unavailable with source present=%s', (hasSource) => {
  expect(desktopUpdatesEnabled({ dshDesktopUpdatesEnabled: false }, true, hasSource)).toBe(false)
})

it('keeps source development unavailable without requiring installer metadata', () => {
  expect(desktopUpdatesEnabled({}, false, true)).toBe(false)
})

it('enables a declared update service only when its packaged source exists', () => {
  const manifest = { dshDesktopFlavor: 'official', dshDesktopUpdatesEnabled: true }
  expect(desktopUpdatesEnabled(manifest, true, true)).toBe(true)
  expect(() => desktopUpdatesEnabled(manifest, true, false)).toThrow('missing app-update.yml')
})

it.each([null, {}, { dshDesktopUpdatesEnabled: 'false' }, { dshDesktopUpdatesEnabled: 0 }])(
  'rejects invalid installed capability metadata: %j', (manifest) => {
    expect(() => desktopUpdatesEnabled(manifest, true, true)).toThrow('must declare dshDesktopUpdatesEnabled as a boolean')
  },
)

it('rejects enabling Suiyi updates before an independent service is configured', () => {
  expect(() => desktopUpdatesEnabled({ dshDesktopFlavor: 'suiyi', dshDesktopUpdatesEnabled: true }, true, true))
    .toThrow('Suiyi has no independent update service')
})
