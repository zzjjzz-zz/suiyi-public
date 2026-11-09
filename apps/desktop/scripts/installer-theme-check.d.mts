/** Optional already-read installer sources used by tests. */
export interface InstallerThemeSources {
  /** Contents of `installer/theme.nsh`. */
  themeSource?: string
  /** Contents of `installer/window-frame.cpp`. */
  frameSource?: string
  /** Contents of `installer/lifecycle.nsh`. */
  lifecycleSource?: string
  /** Contents of `scripts/electron-builder-config.mjs`. */
  configSource?: string
}

/**
 * Check the installer theme against the frozen prototype, its native mirror, bundled fonts and OFL distribution.
 * @param sources Optional already-read sources; omitted entries are read from the shipped files.
 * @returns Human-readable violations; empty when every check passes.
 */
export function installerThemeErrors(sources?: InstallerThemeSources): string[]
