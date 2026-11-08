import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'

/**
 * The Suiyi blue-cyan glass palette as one override layer: each token carries
 * both palette modes, light values from the daylight glass sheet and dark
 * values from the night-glass sheet, so the layer stays legible when the user
 * switches color scheme.
 */
export const SUIYI_TOKENS: ThemeTokenOverrides = {
  '--dsw-alias-bg-base': { light: '#f6f7fa', dark: '#111318' },
  '--dsw-alias-bg-layer-1': { light: '#ffffff', dark: '#1a1e27' },
  '--dsw-alias-bg-layer-2': { light: '#f6f8fc', dark: '#202530' },
  '--dsw-alias-bg-overlay': { light: '#f2f9ff', dark: '#171a21' },
  '--dsw-alias-border-l1': { light: '#e6e9ef', dark: '#2c3340' },
  '--dsw-alias-border-l2': { light: '#d8e2f3', dark: '#3a4557' },
  '--dsw-alias-brand-primary': { light: '#4285f4', dark: '#8ab4f8' },
  '--dsw-alias-label-primary': { light: '#20242d', dark: '#edf0f7' },
  '--dsw-alias-label-secondary': { light: '#737b89', dark: '#a1a9b9' },
  '--dsw-alias-state-error-primary': { light: '#ea4335', dark: '#f28b80' },
  '--dsw-alias-state-idle-primary': { light: '#2365ce', dark: '#a9c8ff' },
  '--dsw-alias-state-success-primary': { light: '#34a853', dark: '#6cc88a' },
  '--dsw-alias-state-warn-primary': { light: '#9a6515', dark: '#f2c071' },
  '--dsw-specific-sidebar-fill': { light: '#f1f3f7', dark: '#171a21' },
}
