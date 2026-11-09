/** `suiyi` namespace dictionaries for the sidebar brand artwork. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'suiyi'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mark.label': '遂意',
  'name.hanzi': '遂意',
} satisfies Record<string, string>

/** The suiyi namespace key union. */
export type SuiyiKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mark.label': 'Suiyi',
  'name.hanzi': 'Suiyi',
} satisfies Record<SuiyiKey, string>

/** Japanese copy, checked against the English keys. */
export const ja = {
  'mark.label': '遂意',
  'name.hanzi': '遂意',
} satisfies Record<SuiyiKey, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'mark.label': 'Suiyi',
  'name.hanzi': 'Suiyi',
} satisfies Record<SuiyiKey, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'mark.label': 'Suiyi',
  'name.hanzi': 'Suiyi',
} satisfies Record<SuiyiKey, string>

/** German dictionary, checked against the English keys. */
export const de = {
  'mark.label': 'Suiyi',
  'name.hanzi': 'Suiyi',
} satisfies Record<SuiyiKey, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  'mark.label': '遂意',
  'name.hanzi': '遂意',
} satisfies Record<SuiyiKey, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  'mark.label': 'Suiyi',
  'name.hanzi': 'Suiyi',
} satisfies Record<SuiyiKey, string>
