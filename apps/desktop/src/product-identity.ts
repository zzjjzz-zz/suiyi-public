/** Build-selected product identity; signing is an independent property. */

/** Resolve a build flavor, rejecting typos rather than producing an official package. */
export function resolveDesktopIdentity(flavor: string | undefined) {
  if (flavor !== undefined && flavor !== 'official' && flavor !== 'suiyi') throw new Error('Unknown desktop flavor')
  const suiyi = flavor === 'suiyi'
  return { flavor: suiyi ? 'suiyi' : 'official', suiyi,
    productName: suiyi ? 'Suiyi' : 'DeepSeek Harness',
    displayName: suiyi ? '遂意 Suiyi' : 'DeepSeek Harness',
    scheme: suiyi ? 'suiyi' : 'dsh', artifact: suiyi ? 'suiyi' : 'deepseek-harness',
    appId: suiyi ? 'com.zzjjzz.suiyi' : undefined }
}

/** Inlined by the main-process bundle; runtime environment cannot switch an installed product. */
export const desktopIdentity = resolveDesktopIdentity(process.env.DSH_DESKTOP_FLAVOR)

/** Accept only this product's external open link; internal DSH transport is unchanged. */
export function isDesktopOpenUrl(url: string, scheme = desktopIdentity.scheme): boolean {
  return url === `${scheme}://open` || url === `${scheme}://open/`
}
