import { expect, it } from 'vitest'
import { installerThemeErrors } from '../scripts/installer-theme-check.mjs'

it('keeps painted installer surfaces, contrast and geometry on the prototype tokens', () => {
  expect(installerThemeErrors()).toEqual([])
})
