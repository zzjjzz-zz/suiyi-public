/**
 * The Agents main view. It frames the existing AgentPresetSection in the main
 * column and supplies the one settings-shell affordance that section expects:
 * leaving the surface for a started task. Roster state, default selection,
 * composition viewing, and Creator-mode staging remain in the section.
 */
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { AgentPresetSection, type AgentPresetSectionInjected } from './AgentPresetSection.tsx'
import css from './AgentPresetsPage.module.css'

/** Section actions plus the main-panel close path. */
export interface AgentPresetsPageInjected extends AgentPresetSectionInjected {
  /** Leave the Agents page after a section flow starts work elsewhere. */
  readonly closePage: () => void
}

/** Composed slot props for the Agents main panel. */
export type AgentPresetsPageProps =
  & PropsRuntime<'main'>
  & PropsLocale<'settings.agentPreset'>
  & InjectFace<AgentPresetsPageInjected>

/**
 * Render the Agents page around the shared preset section.
 * @param props - standard hooks, locale seat, and the preset section's real actions.
 * @returns the page element.
 */
export function AgentPresetsPage({ closePage, t, ...sectionProps }: AgentPresetsPageProps): ReactNode {
  return (
    <section className={css.page} aria-label={t('nav.agents')}>
      <header className={css.heading}>
        <h1>{t('nav.agents')}</h1>
        <p className={css.intro}>{t('sectionIntro')}</p>
      </header>
      <div className={css.body}>
        <AgentPresetSection {...sectionProps} close={closePage} t={t} />
      </div>
    </section>
  )
}
