/** `settings.locale` namespace dictionaries (the Language row's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'language.interface': '界面语言',
  'language.description': '选择界面显示语言。',
  'language.title': '语言',
} satisfies Record<string, string>

/** The settings.locale namespace key union. */
export type SettingsLocaleKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'language.interface': 'Interface language',
  'language.description': 'Choose the language used in the interface.',
  'language.title': 'Language',
} satisfies Record<SettingsLocaleKey, string>

/** Japanese copy, checked against the English keys. */
export const ja = {
  'language.interface': '表示言語',
  'language.description': '画面に表示する言語を選択します。',
  'language.title': '言語',
} satisfies Record<keyof typeof en, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'language.interface': 'Idioma de la interfaz',
  'language.description': 'Elige el idioma de la interfaz.',
  'language.title': 'Idioma',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'language.interface': 'Langue de l’interface',
  'language.description': 'Choisissez la langue de l’interface.',
  'language.title': 'Langue',
} satisfies Record<keyof typeof en, string>

/** German dictionary, checked against the English keys. */
export const de = {
  'language.interface': 'Oberflächensprache',
  'language.description': 'Wählen Sie die Sprache der Oberfläche.',
  'language.title': 'Sprache',
} satisfies Record<keyof typeof en, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  'language.interface': 'Язык интерфейса',
  'language.description': 'Выберите язык интерфейса.',
  'language.title': 'Язык',
} satisfies Record<keyof typeof en, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  'language.interface': 'Idioma da interface',
  'language.description': 'Escolha o idioma da interface.',
  'language.title': 'Idioma',
} satisfies Record<keyof typeof en, string>
