import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'

/**
 * The Suiyi blue-cyan glass build identity as one theme override layer. Each
 * token carries both palette modes, taken from the frozen prototype's final
 * cascade (`styles.css` cold-blue glass and ambient-scene blocks): light values
 * from the daylight glass, dark values from the night glass. Only the `suiyi`
 * build profile stacks this layer, so the official identity keeps every stock
 * value.
 *
 * The `--dsw-brand-*` rows fill the neutral contract from ui-theme's
 * `brand-identity.css`; feature packages read those names instead of hard-coding
 * the Suiyi palette. Scene stops are full colours because `brand.css` applies
 * the prototype's per-layer alpha through `color-mix`; the glass and wash
 * values stay translucent because they sit over the body scene.
 */
export const SUIYI_TOKENS: ThemeTokenOverrides = {
  '--dsw-alias-bg-base': { light: 'rgba(249, 252, 255, 0.70)', dark: 'rgba(8, 22, 43, 0.80)' },
  '--dsw-alias-bg-layer-1': { light: '#ffffff', dark: '#1a2433' },
  '--dsw-alias-bg-layer-2': { light: '#f5f8fd', dark: '#202d3d' },
  '--dsw-alias-bg-module-platform': { light: '#edf2f9', dark: '#27364b' },
  '--dsw-alias-bg-overlay': { light: '#f7fbff', dark: '#171f2c' },
  '--dsw-alias-border-l1': { light: '#e4eaf3', dark: '#2a3d53' },
  '--dsw-alias-border-l2': { light: '#e4eaf3', dark: '#2a3d53' },
  '--dsw-alias-switch-thumb': { light: '#ffffff', dark: '#ffffff' },
  '--dsw-brand-action-fill': { light: '#3478eb', dark: '#3478eb' },
  '--dsw-brand-switch-on': { light: '#4285f4', dark: '#4285f4' },
  '--dsw-alias-brand-primary': { light: '#2678ed', dark: '#7bb5ff' },
  '--dsw-alias-label-primary': { light: '#1f2937', dark: '#e8f1ff' },
  '--dsw-alias-label-secondary': { light: '#526983', dark: '#b4c8df' },
  '--dsw-alias-label-tertiary': { light: '#72859c', dark: '#92acc8' },
  '--dsw-alias-state-error-primary': { light: '#ea4335', dark: '#ea4335' },
  '--dsw-alias-state-idle-primary': { light: '#185abc', dark: '#a7d0ff' },
  '--dsw-alias-state-success-primary': { light: '#34a853', dark: '#6cc88a' },
  '--dsw-alias-state-warn-primary': { light: '#9a6515', dark: '#f2c071' },
  '--dsw-specific-sidebar-fill': { light: 'rgba(242, 249, 255, 0.57)', dark: 'rgba(12, 29, 49, 0.64)' },

  '--dsw-brand-scene-base': { light: '#edf5ff', dark: '#061122' },
  '--dsw-brand-scene-cyan': { light: '#25b7e6', dark: '#1ab1e5' },
  '--dsw-brand-scene-blue': { light: '#1f76f6', dark: '#1668f7' },
  '--dsw-brand-scene-ice': { light: '#c0f0ff', dark: '#97e0ff' },
  '--dsw-brand-scene-veil': { light: 'rgba(250, 253, 255, 0.44)', dark: 'rgba(5, 17, 35, 0.52)' },
  '--dsw-brand-scene-veil-compact': { light: 'rgba(250, 253, 255, 0.44)', dark: 'rgba(5, 17, 35, 0.45)' },
  '--dsw-brand-scene-veil-size': { light: '43% 39%', dark: '45% 35%' },
  '--dsw-brand-scene-veil-position': { light: '58% 33%', dark: '58% 32%' },
  '--dsw-brand-scene-veil-size-compact': { light: '80% 35%', dark: '80% 36%' },
  '--dsw-brand-scene-veil-position-compact': { light: '50% 30%', dark: '50% 27%' },
  '--dsw-brand-scene-veil-fade-compact': { light: '82%', dark: '86%' },
  '--dsw-brand-scene-strength': { light: '0.4472', dark: '0.686' },
  '--dsw-brand-scene-strength-compact': { light: '0.387', dark: '0.588' },
  '--dsw-brand-content-wash': { light: 'rgba(249, 252, 255, 0.76)', dark: 'rgba(8, 22, 43, 0.80)' },
  '--dsw-brand-page-wash': { light: 'rgba(249, 252, 255, 0.62)', dark: 'rgba(8, 22, 43, 0.68)' },
  '--dsw-brand-glass-chrome': { light: 'rgba(250, 253, 255, 0.55)', dark: 'rgba(17, 36, 59, 0.59)' },
  '--dsw-brand-glass-nav': { light: 'rgba(242, 249, 255, 0.57)', dark: 'rgba(12, 29, 49, 0.64)' },
  '--dsw-brand-glass-toolbar': { light: 'rgba(255, 255, 255, 0.63)', dark: 'rgba(43, 74, 111, 0.54)' },
  '--dsw-brand-glass-edge': { light: 'rgba(255, 255, 255, 0.90)', dark: 'rgba(174, 220, 255, 0.24)' },
  '--dsw-brand-glass-shadow': { light: 'rgba(27, 79, 148, 0.13)', dark: 'rgba(0, 7, 22, 0.30)' },
  '--dsw-brand-dialog-shadow': {
    light: 'inset 0 1px rgba(255, 255, 255, 0.92), 0 30px 90px rgba(15, 42, 86, 0.24)',
    dark: 'inset 0 1px rgba(202, 226, 255, 0.15), 0 30px 90px rgba(15, 42, 86, 0.24)',
  },
  '--dsw-brand-dialog-mask': { light: 'rgba(17, 24, 39, 0.219608)', dark: 'rgba(17, 24, 39, 0.219608)' },
  '--dsw-brand-workspace-border': { light: 'rgba(124, 156, 194, 0.25)', dark: 'rgba(141, 184, 234, 0.22)' },
  '--dsw-brand-accent-ink': { light: '#185abc', dark: '#a7d0ff' },
  '--dsw-brand-accent-soft': { light: '#e8f1ff', dark: '#213c60' },
  '--dsw-app-frame-fill': { light: 'transparent', dark: 'transparent' },

  '--dsw-brand-composer-fill': {
    light: 'linear-gradient(133deg, rgba(254, 255, 255, 0.9), rgba(244, 250, 255, 0.83) 67%, rgba(231, 243, 255, 0.78))',
    dark: 'linear-gradient(136deg, rgba(41, 72, 112, 0.76), rgba(25, 51, 86, 0.78) 63%, rgba(24, 53, 90, 0.74))',
  },
  '--dsw-brand-composer-border': {
    light: '1px solid rgba(167, 201, 236, 0.6)',
    dark: '1px solid rgba(144, 192, 237, 0.34)',
  },
  '--dsw-brand-composer-shadow': {
    light: 'inset 0 1px rgba(255, 255, 255, 0.97), 0 12px 38px rgba(42, 102, 179, 0.1)',
    dark: 'inset 0 1px rgba(207, 231, 255, 0.18), 0 16px 44px rgba(0, 8, 23, 0.27)',
  },
  '--dsw-brand-composer-focus-fill': {
    light: 'linear-gradient(132deg, rgba(255, 255, 255, 0.85), rgba(226, 242, 255, 0.74) 60%, rgba(193, 225, 255, 0.8))',
    dark: 'linear-gradient(130deg, rgba(55, 102, 149, 0.64), rgba(22, 58, 100, 0.73) 65%, rgba(31, 78, 117, 0.63))',
  },
  '--dsw-brand-composer-focus-border': {
    light: '1px solid rgba(100, 171, 246, 0.86)',
    dark: '1px solid rgba(167, 219, 255, 0.72)',
  },
  '--dsw-brand-composer-focus-shadow': {
    light: 'inset 0 1px rgba(255, 255, 255, 1), 0 0 0 1px rgba(108, 182, 255, 0.21), 0 14px 44px rgba(44, 113, 198, 0.17)',
    dark: 'inset 0 1px rgba(219, 239, 255, 0.35), 0 0 0 1px rgba(76, 154, 237, 0.29), 0 14px 48px rgba(3, 20, 51, 0.32)',
  },
  '--dsw-brand-composer-material-content': { light: '""', dark: '""' },
  '--dsw-brand-composer-sheen': {
    light: 'radial-gradient(ellipse 320px 110px at 35% -18%, rgba(255, 255, 255, 0.96), transparent 84%), linear-gradient(114deg, rgba(167, 217, 255, 0.24), transparent 56%)',
    dark: 'radial-gradient(ellipse 340px 120px at 35% -22%, rgba(173, 224, 255, 0.48), transparent 83%), linear-gradient(110deg, rgba(26, 151, 247, 0.18), transparent 58%)',
  },
  '--dsw-brand-composer-inner-border': {
    light: 'rgba(245, 252, 255, 0.63)', dark: 'rgba(187, 228, 255, 0.18)',
  },
  '--dsw-brand-composer-inner-shadow': {
    light: 'inset 1px 0 rgba(255, 255, 255, 0.55)', dark: 'inset 1px 0 rgba(194, 235, 255, 0.12)',
  },
  '--dsw-brand-composer-placeholder-color': {
    light: 'rgba(91, 114, 145, 0.85)',
    dark: 'rgba(165, 191, 220, 0.85)',
  },
  '--dsw-brand-shortcut-fill': {
    light: 'rgba(255, 255, 255, 0.15)',
    dark: 'rgba(255, 255, 255, 0.15)',
  },
  '--dsw-brand-shortcut-border': {
    light: '1px solid rgba(255, 255, 255, 0.9)',
    dark: '1px solid rgba(174, 220, 255, 0.24)',
  },
  '--dsw-brand-shortcut-radius': { light: '19px', dark: '19px' },
  '--dsw-brand-shortcut-radius-compact': { light: '13px', dark: '13px' },
  '--dsw-brand-shortcut-shadow': { light: 'none', dark: 'none' },

  '--dsw-brand-mark-wing-1': { light: '#aaecfa', dark: '#e5feff' },
  '--dsw-brand-mark-wing-2': { light: '#3cbff3', dark: '#62d5fe' },
  '--dsw-brand-mark-wing-3': { light: '#147cde', dark: '#249bee' },
  '--dsw-brand-mark-wing-4': { light: '#153da8', dark: '#285ac4' },
  '--dsw-brand-mark-wake-1': { light: '#39dce3', dark: '#75fcf2' },
  '--dsw-brand-mark-wake-2': { light: '#126ede', dark: '#27b8e2' },
  '--dsw-brand-mark-wake-3': { light: '#3268da', dark: '#3391f2' },
  '--dsw-brand-mark-wake-4': { light: '#79def0', dark: '#9cebf2' },
  '--dsw-brand-mark-glow': { light: 'rgba(12, 82, 157, 0.10)', dark: 'rgba(94, 196, 255, 0.22)' },
  '--dsw-brand-mark-hover-glow': { light: 'rgba(21, 151, 223, 0.16)', dark: 'rgba(21, 151, 223, 0.16)' },
  '--dsw-brand-mark-burst-border': { light: 'rgba(42, 159, 233, 0.48)', dark: 'rgba(42, 159, 233, 0.48)' },
}
