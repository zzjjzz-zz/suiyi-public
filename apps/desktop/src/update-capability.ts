/** Installer-owned update availability, independent of transient check failures. */

/**
 * Read the packaged update capability before settings, polling, or user actions start.
 * @param manifest - Application manifest sealed by electron-builder.
 * @param packaged - Whether this process runs an installed application.
 * @param hasSource - Whether the packaged updater configuration exists.
 * @returns Whether ordinary updates are enabled; source development is unavailable.
 * @throws When an installed manifest is invalid or an enabled package lacks its update source.
 */
export function desktopUpdatesEnabled(manifest: unknown, packaged: boolean, hasSource: boolean): boolean {
  if (!packaged) return false
  if (typeof manifest !== 'object' || manifest === null
    || !('dshDesktopUpdatesEnabled' in manifest) || typeof manifest.dshDesktopUpdatesEnabled !== 'boolean') {
    throw new Error('desktop update: packaged manifest must declare dshDesktopUpdatesEnabled as a boolean; rebuild the installer')
  }
  if (!manifest.dshDesktopUpdatesEnabled) return false
  if ('dshDesktopFlavor' in manifest && manifest.dshDesktopFlavor === 'suiyi') {
    throw new Error('desktop update: Suiyi has no independent update service; rebuild with updates disabled')
  }
  if (!hasSource) throw new Error('desktop update: enabled package is missing app-update.yml; reinstall or rebuild the application')
  return true
}
