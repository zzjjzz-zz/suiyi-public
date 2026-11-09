/**
 * Normal column geometry: the right column shrinks, then loses its track,
 * before the center drops below its minimum. The sidebar never concedes here;
 * AppFrame supplies its effective preference after responsive collapse.
 */

/** Resolved widths for one frame. */
export interface Columns { sidebar: number; center: number; rightbar: number }

/** Center width protected while the normal right column is open. */
export const CENTER_MIN = 400
/** Sidebar drag clamp floor. */
export const SIDEBAR_MIN = 208
/** Sidebar drag clamp ceiling. */
export const SIDEBAR_MAX = 420
/** Sidebar width before any user drag (the 遂意 prototype's 242px navigation column). */
export const SIDEBAR_DEFAULT = 242
/** Prototype breakpoint above which the navigation keeps its 242px width. */
export const SIDEBAR_COMPACT_BREAKPOINT = 1200
/** Prototype breakpoint above which the navigation keeps its 216px width. */
export const SIDEBAR_NARROW_BREAKPOINT = 860
/** Navigation width at or below {@link SIDEBAR_COMPACT_BREAKPOINT}. */
export const SIDEBAR_COMPACT = 216
/** Navigation width at or below {@link SIDEBAR_NARROW_BREAKPOINT}. */
export const SIDEBAR_NARROW = 208
/** Prototype mobile drawer width. */
export const SIDEBAR_DRAWER_DEFAULT = 256
/** Closed-sidebar rail: a 24px icon column between 16px horizontal paddings. */
export const SIDEBAR_COLLAPSED = 56
/** Frame width below which the sidebar overlays the main content without a rail. */
export const SIDEBAR_DRAWER_BREAKPOINT = 640
/** Viewport width below which the sidebar auto-collapses to the rail; a manual
 * toggle below it re-expands over the squeezed center (stores.ts narrowExpanded). */
export const SIDEBAR_AUTO_COLLAPSE = 640
/** Right column drag clamp floor. */
export const RIGHTBAR_MIN = 300
/** Maximum normal right panel width as a fraction of the frame. */
export const RIGHTBAR_MAX_RATIO = 0.7
/** First-open right workbench width, the 遂意 prototype's 360px inspector column. */
export const RIGHTBAR_DEFAULT_WIDTH = 360

/**
 * Resolve the prototype's responsive default navigation width.
 * @param viewport - frame width in px.
 * @returns 242px on wide frames, 216px through 1200, and 208px through 860.
 */
export function sidebarWidthForViewport(viewport: number): number {
  if (viewport <= SIDEBAR_NARROW_BREAKPOINT) return SIDEBAR_NARROW
  if (viewport <= SIDEBAR_COMPACT_BREAKPOINT) return SIDEBAR_COMPACT
  return SIDEBAR_DEFAULT
}

/**
 * Clamp a panel width into its contract range.
 * @param px - requested width.
 * @param min - range lower bound.
 * @param max - range upper bound.
 * @returns the clamped width.
 */
export function clampWidth(px: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(px)))
}

/**
 * Solve the three column widths for one viewport frame.
 * @param viewport - available frame width in px.
 * @param sidebar - sidebar width preference in px (0 = closed).
 * @param rightbar - requested right panel width in px (0 = no track).
 * @param collapsedWidth - track width of the closed sidebar; the default keeps
 *   the icon rail, 0 hides the column entirely (macOS desktop).
 * @param centeredSidebar - place an expanded sidebar's edge at the frame midpoint.
 * @returns actual widths after shrinking or removing the right track; only
 *   without that track may the center fall below its minimum, down to zero.
 */
export function computeColumns(
  viewport: number, sidebar: number, rightbar: number, collapsedWidth = SIDEBAR_COLLAPSED, centeredSidebar = false,
): Columns {
  const s = sidebar === 0 ? collapsedWidth : centeredSidebar ? viewport / 2 : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  const available = viewport - s - CENTER_MIN
  const r = rightbar === 0 || available < RIGHTBAR_MIN
    ? 0
    : Math.min(available, clampWidth(rightbar, RIGHTBAR_MIN, viewport * RIGHTBAR_MAX_RATIO))
  return { sidebar: s, center: Math.max(0, viewport - s - r), rightbar: r }
}
