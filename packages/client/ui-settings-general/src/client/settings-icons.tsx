/** Settings navigation glyphs shared by the modal rail and the Suiyi full page. */
import {
  IconAgentPresetOutlineMedium, IconArchiveOutlineMedium, IconDataOutlineMedium,
  IconPersonalizationOutlineMedium, IconSettingsOutlineMedium,
} from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * Prototype outline glyph, using the frozen prototype path verbatim.
 * @param props.d - prototype path data
 * @returns a 24-viewBox stroked glyph
 */
function PrototypeGlyph({ d, size = 16 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
}

/** Paths from prototype/data.js; no semantic library substitute. */
const PATHS = {
  sliders: 'M4 7h16M4 17h16M9 4v6M15 14v6',
  shield: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Zm-4 9 3 3 5-5',
  terminal: 'm4 5 6 7-6 7M12 19h8',
  user: 'M8 6a4 4 0 1 1 8 0 4 4 0 0 1-8 0ZM3 22v-3a9 9 0 0 1 18 0v3',
  monitor: 'M2 3h20v14H2zM12 17v5M7 22h10',
  settings: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM9 3h6l.7 3 2.3 1.3 3-.8 3 5.2-2.2 2.1v2.6L24 18.5l-3 5.2-3-.8-2.3 1.3-.7 3H9',
} as const

/**
 * Prototype footer Settings glyph; the shared settings icon is a different outline.
 * @param props.size - square edge in pixels
 * @returns the prototype settings outline
 */
export function SettingsGlyph({ size = 18 }: { size?: number }) {
  return <PrototypeGlyph d={PATHS.settings} size={size} />
}

/**
 * Render the glyph for one settings section.
 * @param id - registered section id or Suiyi category id
 * @returns the section glyph, or the settings gear for unknown ids
 */
export function navIcon(id: string) {
  if (id === 'appearance') return <PrototypeGlyph d={PATHS.sliders} />
  if (id === 'permissions') return <PrototypeGlyph d={PATHS.shield} />
  if (id === 'runtime') return <PrototypeGlyph d={PATHS.terminal} />
  if (id === 'account') return <PrototypeGlyph d={PATHS.user} />
  if (id === 'desktop') return <PrototypeGlyph d={PATHS.monitor} />
  if (id === 'models') return <IconDataOutlineMedium size={16} />
  if (id === 'agent-presets') return <IconAgentPresetOutlineMedium size={16} />
  if (id === 'plugins') return <IconPersonalizationOutlineMedium size={16} />
  if (id === 'archived-sessions') return <IconArchiveOutlineMedium size={16} />
  return <IconSettingsOutlineMedium size={16} />
}
