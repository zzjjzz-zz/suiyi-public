/**
 * Verify the painted installer palette, geometry and GDI+ mirror stay on the
 * frozen Suiyi prototype tokens. Reads the shipped NSIS theme and native helper
 * directly; no Windows toolchain is required.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const themePath = fileURLToPath(new URL('../installer/theme.nsh', import.meta.url))
const framePath = fileURLToPath(new URL('../installer/window-frame.cpp', import.meta.url))
const fontDirectory = fileURLToPath(new URL('../installer/fonts/', import.meta.url))
const lifecyclePath = fileURLToPath(new URL('../installer/lifecycle.nsh', import.meta.url))
const builderConfigPath = fileURLToPath(new URL('./electron-builder-config.mjs', import.meta.url))
const rendererOflPath = fileURLToPath(new URL('../renderer/assets/noto-sans-sc/NotoSansSC-OFL.txt', import.meta.url))

/** Prototype product-pages.css tokens at the stacked (<=640px) install cascade. */
const prototype = {
  INSTALLER_LIGHT_BG: 'FFEDF5FF',
  INSTALLER_LIGHT_CARD: 'FFFFFFFF',
  INSTALLER_LIGHT_ACCENT: 'FF2367D9',
  INSTALLER_LIGHT_ACCENT_INK: 'FF1655B8',
  INSTALLER_LIGHT_ACCENT_WASH: 'FFE4EFFF',
  INSTALLER_LIGHT_CYAN: 'FF15A3BE',
  INSTALLER_LIGHT_TEXT: 'FF20242D',
  INSTALLER_LIGHT_MUTED: 'FF53667D',
  INSTALLER_LIGHT_PRIMARY_TEXT: 'FFFFFFFF',
  INSTALLER_DARK_BG: 'FF061122',
  INSTALLER_DARK_CARD: 'FF16263A',
  INSTALLER_DARK_ACCENT: 'FFA0C7FF',
  INSTALLER_DARK_ACCENT_INK: 'FFB8D6FF',
  INSTALLER_DARK_ACCENT_WASH: 'FF203A59',
  INSTALLER_DARK_CYAN: 'FF6BDEEC',
  INSTALLER_DARK_TEXT: 'FFEDF0F7',
  INSTALLER_DARK_MUTED: 'FFA8BFD8',
  INSTALLER_DARK_PRIMARY_TEXT: 'FF102A49',
}

/** Theme token -> native constant used by window-frame.cpp. */
const mirrored = {
  INSTALLER_LIGHT_BG: 'kLightBg',
  INSTALLER_DARK_BG: 'kDarkBg',
  INSTALLER_LIGHT_CARD: 'kLightCard',
  INSTALLER_DARK_CARD: 'kDarkCard',
  INSTALLER_LIGHT_FIELD: 'kLightField',
  INSTALLER_DARK_FIELD: 'kDarkField',
  INSTALLER_LIGHT_FIELD_BORDER: 'kLightFieldBorder',
  INSTALLER_DARK_FIELD_BORDER: 'kDarkFieldBorder',
  INSTALLER_LIGHT_BORDER: 'kLightBorder',
  INSTALLER_DARK_BORDER: 'kDarkBorder',
  INSTALLER_LIGHT_ACCENT: 'kLightAccent',
  INSTALLER_DARK_ACCENT: 'kDarkAccent',
  INSTALLER_LIGHT_ACCENT_INK: 'kLightAccentInk',
  INSTALLER_DARK_ACCENT_INK: 'kDarkAccentInk',
  INSTALLER_LIGHT_ACCENT_WASH: 'kLightAccentWash',
  INSTALLER_DARK_ACCENT_WASH: 'kDarkAccentWash',
  INSTALLER_LIGHT_CYAN: 'kLightCyan',
  INSTALLER_DARK_CYAN: 'kDarkCyan',
  INSTALLER_LIGHT_TEXT: 'kLightText',
  INSTALLER_DARK_TEXT: 'kDarkText',
  INSTALLER_LIGHT_MUTED: 'kLightMuted',
  INSTALLER_DARK_MUTED: 'kDarkMuted',
  INSTALLER_LIGHT_PRIMARY_TEXT: 'kLightPrimaryText',
  INSTALLER_DARK_PRIMARY_TEXT: 'kDarkPrimaryText',
  INSTALLER_CONTROL_HOVER: 'kLightCaptionHover',
  INSTALLER_DARK_CONTROL_HOVER: 'kDarkCaptionHover',
  INSTALLER_CONTROL_PRESSED: 'kLightCaptionPressed',
  INSTALLER_DARK_CONTROL_PRESSED: 'kDarkCaptionPressed',
  INSTALLER_LIGHT_ERROR: 'kLightError',
  INSTALLER_DARK_ERROR: 'kDarkError',
}

/** Parse numeric `!define` values from the installer theme. */
function readDefines(source) {
  const defines = {}
  for (const match of source.matchAll(/^!define\s+([A-Z0-9_]+)\s+(0x[0-9A-Fa-f]{8}|\d+)\r?$/gmu)) {
    defines[match[1]] = match[2]
  }
  return defines
}

/** Parse GDI+ ARGB constants from the native helper. */
function readNativeConstants(source) {
  const constants = {}
  for (const match of source.matchAll(/^constexpr ARGB (k[A-Za-z0-9]+) = (0x[0-9A-Fa-f]{8});$/gmu)) {
    constants[match[1]] = match[2]
  }
  return constants
}

/** Normalize a 0xAARRGGBB or RRGGBB literal to eight uppercase hex digits. */
function argb(value) {
  const hex = value.replace(/^0x/u, '').toUpperCase()
  return hex.length === 6 ? `FF${hex}` : hex
}

/** WCAG relative luminance of a 0xAARRGGBB colour. */
function luminance(value) {
  const channels = [16, 8, 0].map(shift => ((Number.parseInt(value, 16) >> shift) & 255) / 255)
  const linear = channels.map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

/** WCAG contrast ratio between two 0xAARRGGBB colours. */
function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((left, right) => right - left)
  return (light + 0.05) / (dark + 0.05)
}

/**
 * Check the installer theme against the frozen prototype and native mirror.
 * @param {{themeSource?: string, frameSource?: string, lifecycleSource?: string, configSource?: string}} [sources] - Optional already-read sources for tests.
 * @returns {string[]} Human-readable violations; empty when every check passes.
 */
export function installerThemeErrors(sources = {}) {
  const themeSource = sources.themeSource ?? readFileSync(themePath, 'utf8')
  const frameSource = sources.frameSource ?? readFileSync(framePath, 'utf8')
  const lifecycleSource = sources.lifecycleSource ?? readFileSync(lifecyclePath, 'utf8')
  const configSource = sources.configSource ?? readFileSync(builderConfigPath, 'utf8')
  const defines = readDefines(themeSource)
  const constants = readNativeConstants(frameSource)
  const errors = []

  for (const [token, expected] of Object.entries(prototype)) {
    const actual = defines[token]
    if (actual === undefined) errors.push(`${token}: missing theme token`)
    else if (argb(actual) !== expected) errors.push(`${token}: expected ${expected}, found ${argb(actual)}`)
  }
  for (const [token, constant] of Object.entries(mirrored)) {
    const themeValue = defines[token]
    const nativeValue = constants[constant]
    if (nativeValue === undefined) errors.push(`${constant}: missing native palette mirror`)
    else if (themeValue !== undefined && argb(themeValue) !== argb(nativeValue)) {
      errors.push(`${token}/${constant}: theme ${argb(themeValue)} differs from native ${argb(nativeValue)}`)
    }
  }

  const value = (name) => defines[name] === undefined ? '000000' : argb(defines[name])
  const ratios = [
    ['body text on page', value('INSTALLER_LIGHT_TEXT'), value('INSTALLER_LIGHT_BG')],
    ['body text on card', value('INSTALLER_LIGHT_TEXT'), value('INSTALLER_LIGHT_CARD')],
    ['muted text on card', value('INSTALLER_LIGHT_MUTED'), value('INSTALLER_LIGHT_CARD')],
    ['primary button text', value('INSTALLER_LIGHT_PRIMARY_TEXT'), value('INSTALLER_LIGHT_ACCENT')],
    ['kicker on wash', value('INSTALLER_LIGHT_ACCENT_INK'), value('INSTALLER_LIGHT_ACCENT_WASH')],
    ['error on card', value('INSTALLER_LIGHT_ERROR'), value('INSTALLER_LIGHT_CARD')],
    ['dark body text on card', value('INSTALLER_DARK_TEXT'), value('INSTALLER_DARK_CARD')],
    ['dark muted text on card', value('INSTALLER_DARK_MUTED'), value('INSTALLER_DARK_CARD')],
    ['dark primary button text', value('INSTALLER_DARK_PRIMARY_TEXT'), value('INSTALLER_DARK_ACCENT')],
    ['dark kicker on wash', value('INSTALLER_DARK_ACCENT_INK'), value('INSTALLER_DARK_ACCENT_WASH')],
    ['dark error on card', value('INSTALLER_DARK_ERROR'), value('INSTALLER_DARK_CARD')],
  ]
  for (const [label, foreground, background] of ratios) {
    const ratio = contrast(foreground, background)
    if (ratio < 4.5) errors.push(`${label}: contrast ${ratio.toFixed(2)} is below 4.5`)
  }

  const width = Number(defines.INSTALLER_WINDOW_WIDTH)
  const height = Number(defines.INSTALLER_WINDOW_HEIGHT)
  const cardRight = Number(defines.INSTALLER_CARD_X) + Number(defines.INSTALLER_CARD_W)
  const geometry = [
    ['card width', 'INSTALLER_CARD_X', 'INSTALLER_CARD_W', width],
    ['card height', 'INSTALLER_CARD_Y', 'INSTALLER_CARD_H', height],
    ['field and browse', 'INSTALLER_FIELD_X', 'INSTALLER_FIELD_W', Number(defines.INSTALLER_BROWSE_X)],
    ['browse inside card', 'INSTALLER_BROWSE_X', 'INSTALLER_BROWSE_W', cardRight],
    ['field above validation', 'INSTALLER_FIELD_Y', 'INSTALLER_FIELD_H', 466],
    ['install action', 'INSTALLER_INSTALL_X', 'INSTALLER_INSTALL_W', cardRight],
    ['caption close', 'INSTALLER_CAPTION_CLOSE_X', 'INSTALLER_CAPTION_W', width],
  ]
  for (const [label, start, extent, limit] of geometry) {
    if (!Number.isFinite(Number(defines[start])) || !Number.isFinite(Number(defines[extent])) || !Number.isFinite(limit)) {
      errors.push(`${label}: missing numeric geometry`)
      continue
    }
    if (Number(defines[start]) + Number(defines[extent]) > limit) {
      errors.push(`${label}: ${defines[start]} + ${defines[extent]} exceeds ${limit}`)
    }
  }
  const fontFamilies = {
    INSTALLER_FONT_LIGHT: 'Noto Sans SC Light',
    INSTALLER_FONT: 'Noto Sans SC',
    INSTALLER_FONT_MEDIUM: 'Noto Sans SC Medium',
  }
  for (const [token, expected] of Object.entries(fontFamilies)) {
    const actual = new RegExp(`^!define ${token} "([^"]+)"$`, 'mu').exec(themeSource)?.[1]
    if (actual !== expected) errors.push(`${token}: expected ${expected}, found ${actual ?? 'missing'}`)
    if (actual === 'Microsoft YaHei UI') errors.push(`${token}: the installer must load its bundled face, not the system fallback`)
  }
  const manifestPath = `${fontDirectory}native-fonts.json`
  if (!existsSync(manifestPath)) {
    errors.push('installer/fonts/native-fonts.json is missing')
  } else {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const expected = new Map([[300, 'INSTALLER_FONT_LIGHT'], [400, 'INSTALLER_FONT'], [500, 'INSTALLER_FONT_MEDIUM']])
    if (!Array.isArray(manifest.fonts) || manifest.fonts.length !== expected.size) {
      errors.push('native-fonts.json must declare Light, Regular and Medium faces')
    } else {
      for (const font of manifest.fonts) {
        const token = expected.get(font.weight)
        if (token === undefined) {
          errors.push(`native-fonts.json: unexpected weight ${font.weight}`)
          continue
        }
        const path = `${fontDirectory}${font.path}`
        if (!existsSync(path)) {
          errors.push(`native font missing: ${font.path}`)
          continue
        }
        const bytes = statSync(path).size
        const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
        if (bytes !== font.bytes) errors.push(`${font.path}: expected ${font.bytes} bytes, found ${bytes}`)
        if (sha256 !== font.sha256) errors.push(`${font.path}: SHA-256 differs from native-fonts.json`)
        const define = new RegExp(`^!define ${token} "([^"]+)"$`, 'mu').exec(themeSource)?.[1]
        if (define !== font.family) errors.push(`${font.path}: manifest family ${font.family} differs from ${token}`)
      }
    }
  }
  for (const name of ['NotoSansSC-Light.ttf', 'NotoSansSC-Regular.ttf', 'NotoSansSC-Medium.ttf']) {
    if (!lifecycleSource.includes(`$PLUGINSDIR\\${name}`) || !lifecycleSource.includes(`\\fonts\\${name}`)) {
      errors.push(`lifecycle.nsh must extract ${name} privately`)
    }
  }
  if (!lifecycleSource.includes('InstallerLoadFonts')) errors.push('lifecycle.nsh must call InstallerLoadFonts')
  if (!lifecycleSource.includes('InstallerUnloadFonts')) errors.push('lifecycle.nsh must call InstallerUnloadFonts')
  if (!frameSource.includes('AddFontResourceExW') || !frameSource.includes('FR_PRIVATE')) {
    errors.push('window-frame.cpp must register the bundled faces with FR_PRIVATE')
  }
  if (!frameSource.includes('EnumFontFamiliesExW')) errors.push('window-frame.cpp must verify the private font families')
  const licensePath = `${fontDirectory}NotoSansSC-OFL.txt`
  if (!existsSync(licensePath)) errors.push('installer/fonts/NotoSansSC-OFL.txt is missing')
  else if (!readFileSync(licensePath, 'utf8').includes('SIL OPEN FONT LICENSE')) errors.push('font license is not the SIL Open Font License')
  if (!configSource.includes('licenses/NotoSansSC-OFL.txt') || !configSource.includes('installer/fonts/NotoSansSC-OFL.txt')) {
    errors.push('electron-builder config must carry the native font OFL into installed resources')
  }
  if (!existsSync(rendererOflPath)) errors.push('renderer Noto Sans SC OFL is missing')
  else if (existsSync(licensePath) && !readFileSync(rendererOflPath).equals(readFileSync(licensePath))) {
    errors.push('installer and renderer Noto Sans SC OFL copies differ')
  }
  if (errors.length === 0) {
    const fontCount = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).fonts.length : 0
    if (fontCount !== 3) errors.push('native font kit must contain three faces')
  }
  return errors
}

if (import.meta.main) {
  const errors = installerThemeErrors()
  if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  } else {
    console.log('verify-installer-theme: palette, contrast, geometry, native mirror, bundled fonts and OFL distribution agree.')
  }
}
