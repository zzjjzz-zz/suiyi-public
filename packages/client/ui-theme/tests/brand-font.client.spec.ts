/** The brand font remains self-contained in the packaged Web application. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('offline brand font', () => {
  it('ships a local WOFF2 with its redistribution license', () => {
    const css = readFileSync(new URL('../src/styles/brand-font.css', import.meta.url), 'utf8')
    const fontPath = /url\(\.\/([^)]*\.woff2)\)/.exec(css)?.[1]
    expect(fontPath).toBeDefined()
    const font = readFileSync(new URL(`../src/styles/${fontPath!}`, import.meta.url))
    expect(font.readUInt32BE(0)).toBe(0x774f4632)
    expect(css).toContain('font-weight: 400')
    expect(css).toContain('font-weight: 300')
    const light = readFileSync(new URL('../src/styles/montserrat-light.woff2', import.meta.url))
    expect(light.readUInt32BE(0)).toBe(0x774f4632)
    expect(css).toContain('font-weight: 500')
    const medium = readFileSync(new URL('../src/styles/montserrat-medium.woff2', import.meta.url))
    expect(medium.readUInt32BE(0)).toBe(0x774f4632)
    expect(css).toContain('font-style: normal')
    expect(css).not.toMatch(/url\(https?:/)
    const license = readFileSync(new URL('../src/styles/Montserrat-OFL.txt', import.meta.url), 'utf8')
    expect(license).toContain('SIL OPEN FONT LICENSE Version 1.1')
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      files: string[]
      exports: Record<string, unknown>
    }
    expect(manifest.files).toContain('lib/styles')
    expect(manifest.exports['./brand-font.css']).toBe('./lib/styles/brand-font.css')
  })

  it('carries the local Noto Sans SC subsets through the same stylesheet', () => {
    const css = readFileSync(new URL('../src/styles/brand-font.css', import.meta.url), 'utf8')
    expect(css).toContain("@import url('./noto-sans-sc.css')")
    expect(css.indexOf('@import')).toBeLessThan(css.indexOf('@font-face'))

    const noto = readFileSync(new URL('../src/styles/noto-sans-sc.css', import.meta.url), 'utf8')
    expect(noto).toContain("font-family: 'Noto Sans SC'")
    expect(noto).toContain('font-weight: 300 600')
    expect(noto).toContain('font-display: swap')
    expect(noto).not.toMatch(/url\(https?:/)
    const subsets = [...noto.matchAll(/url\(\.\/noto-sans-sc\/([^)]+\.woff2)\)/g)].map(([, file = '']) => file)
    expect(subsets).toHaveLength(101)
    expect(new Set(subsets).size).toBe(subsets.length)
    for (const subset of subsets) {
      const font = readFileSync(new URL(`../src/styles/noto-sans-sc/${subset}`, import.meta.url))
      expect(font.readUInt32BE(0), subset).toBe(0x774f4632)
    }

    const license = readFileSync(new URL('../src/styles/noto-sans-sc/NotoSansSC-OFL.txt', import.meta.url), 'utf8')
    expect(license).toContain('SIL OPEN FONT LICENSE Version 1.1')

    const copy = readFileSync(new URL('../tsdown.config.ts', import.meta.url), 'utf8')
    expect(copy).toContain("'src/styles/noto-sans-sc.css'")
    expect(copy).toContain("'src/styles/noto-sans-sc/{*.woff2,NotoSansSC-OFL.txt}'")
    expect(copy).toContain("'lib/styles/noto-sans-sc'")
  })
})
