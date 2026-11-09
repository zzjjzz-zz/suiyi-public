/** Explicit reduced-motion override: the root attribute and its quieted timing. */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const css = readFileSync(new URL('../src/client/reduced-motion.css', import.meta.url), 'utf8')

it('quiets every transition through the preference attribute without removing events', () => {
  expect(css).toContain("html[data-dsh-reduce-motion='true'] *::before")
  expect(css).toContain('animation-duration: 0.01ms !important')
  expect(css).toContain('transition-duration: 0.01ms !important')
  expect(css).toContain('animation-iteration-count: 1 !important')
  expect(css).toContain('scroll-behavior: auto !important')
})
