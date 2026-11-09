/** Conversation chat-top spacing preserves the prototype's second-row geometry. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/client/skeleton/ConversationRoot.module.css', import.meta.url), 'utf8')

describe('conversation chat-top geometry', () => {
  it('removes the extra tab inset only in narrow Web windows', () => {
    const narrow = /@media \(max-width: 767px\) \{([\s\S]*?)\n\}/.exec(css)?.[1]
    expect(narrow).toContain(':global(html:not([data-platform])) .tabs')
    expect(narrow).toContain('padding-left: 0')
  })

  it('keeps the session chat-top at the prototype 52px row and compact tabs', () => {
    expect(css.match(/^\.header\s*\{([^}]*)\}/m)?.[1]).toContain('height: 52px')
    expect(css.match(/\.viewTabs\s*\{([^}]*)\}/)?.[1]).toContain('min-height: 20px')
    expect(css.match(/\.tab\s*\{([^}]*)\}/)?.[1]).toContain('min-height: 20px')
    expect(css.match(/\.tab\s*\{([^}]*)\}/)?.[1]).toContain('padding: 0 0 2px')
  })

  it('uses 28px between view labels and 16px between the tab strip and its trailing control', () => {
    expect(css.match(/\.viewTabs\s*\{([^}]*)\}/)?.[1]).toContain('gap: 28px')
    expect(css.match(/\.tabs\s*\{([^}]*)\}/)?.[1]).toContain('gap: 16px')
  })

  it('leaves the navigation-owned corner in its own trailing seat', () => {
    expect(css.match(/^\.headerCorner\s*\{([^}]*)\}/m)?.[1]).toContain('margin-left: 8px')
  })
})
