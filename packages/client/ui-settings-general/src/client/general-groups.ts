/**
 * Grouping for General rows into the prototype's five cards. Group membership
 * follows the row `order` the ledger already uses for display, so contributing
 * packages keep owning their own row and copy.
 */

/** Display group of a General row. */
export type GeneralGroupId = 'output' | 'appearance' | 'general' | 'permissions' | 'runtime' | 'version'

/** One contributed General row's identity, as the section reads the ledger. */
export interface GeneralRowIdentity {
  /** Slot registration id. */
  readonly id: string
  /** Contributing package's row position. */
  readonly order: number
}

/** One card: its heading id and the rows rendered inside it. */
export interface GeneralGroup {
  /** Card identity and localized heading key. */
  readonly id: GeneralGroupId
  /** Contributed row ids in display order. */
  readonly rows: readonly string[]
}

/** Card display order, matching the prototype page. */
export const GENERAL_GROUP_ORDER: readonly GeneralGroupId[] = [
  'output', 'appearance', 'general', 'permissions', 'runtime', 'version',
]

/** Rows that belong to General regardless of their global order. */
const GENERAL_IDS = new Set(['turn-complete-notification', 'default-agent', 'agent-preset-default', 'shortcuts'])

/** General display order: language, completion notification, default assistant, shortcuts. */
const GENERAL_RANK: Readonly<Record<string, number>> = {
  language: 0,
  'turn-complete-notification': 1,
  'default-agent': 2,
  'agent-preset-default': 2,
  shortcuts: 3,
  welcome: 4,
}

/** Appearance rows read preview → motion → type size, independent of their registrations. */
const APPEARANCE_RANK: Readonly<Record<string, number>> = {
  appearance: 0,
  'reduced-motion': 1,
  'font-size': 2,
}

/**
 * Pick the card for one row.
 * @param row - contributed row identity
 * @returns the card the row's order belongs to
 */
export function generalGroupOf(row: GeneralRowIdentity): GeneralGroupId {
  if (row.id === 'current-version') return 'version'
  if (GENERAL_IDS.has(row.id)) return 'general'
  if (row.id === 'permission' || row.order < 0) return 'permissions'
  if (row.id === 'transcript-view') return 'runtime'
  if (row.order >= 5 && row.order < 10) return 'output'
  if (row.order >= 10 && row.order < 15) return 'appearance'
  if (row.order >= 15 && row.order < 100) return 'runtime'
  return 'general'
}

/**
 * Partition rows into the five cards, omitting empty ones.
 * @param rows - contributed rows in ledger order
 * @returns cards in display order
 */
export function groupGeneralRows(rows: readonly GeneralRowIdentity[]): readonly GeneralGroup[] {
  const buckets: Record<GeneralGroupId, GeneralRowIdentity[]> = {
    output: [], appearance: [], general: [], permissions: [], runtime: [], version: [],
  }
  const seen = new Set<string>()
  for (const row of rows) {
    // A shadowed contribution (the visual-output provider row) keeps its id in
    // the raw ledger; only the winning entry contributes a display row.
    if (seen.has(row.id)) continue
    seen.add(row.id)
    buckets[generalGroupOf(row)].push(row)
  }
  buckets.appearance.sort((left, right) => (APPEARANCE_RANK[left.id] ?? Number.MAX_SAFE_INTEGER)
    - (APPEARANCE_RANK[right.id] ?? Number.MAX_SAFE_INTEGER))
  buckets.general.sort((left, right) => (GENERAL_RANK[left.id] ?? left.order)
    - (GENERAL_RANK[right.id] ?? right.order))
  return GENERAL_GROUP_ORDER.flatMap(id => buckets[id].length === 0
    ? []
    : [{ id, rows: buckets[id].map(row => row.id) }])
}
