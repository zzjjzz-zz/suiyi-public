/**
 * Default-agent preference in General settings. It reads the same roster and
 * section store as the Agent presets page, writes the real `selectedDefault`
 * settings field, and synchronizes the current blank task through the same
 * capture callback. No local preset list.
 */
import { useEffect, useState } from 'react'
import { IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { isCreatorModeHidden, requiresCodingTools } from './settings-store.ts'
import { presetDisplayText } from './locales.ts'
import type { AgentPresetSectionState } from './section-store.ts'
import css from './AgentDefaultItem.module.css'

/** Injected roster face and the real default write. */
export interface AgentDefaultItemInjected {
  hooks: {
    /** The shared roster/default state owned by the management section. */
    readonly agentPresetSection: ObservableSnapshot<AgentPresetSectionState>
    /** Coding Tools preference; hides PTC/Minimal when off. */
    readonly developerTools: ObservableSnapshot<boolean>
  }
  /** Read the roster on mount. */
  readonly load: () => Promise<void>
  /** Persist one preset as the new-task default and sync the blank task. */
  readonly makeDefault: (id: string) => Promise<void>
}

/** Composed props for the General item seat. */
export type AgentDefaultItemProps =
  & PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.agentPreset'>
  & InjectFace<AgentDefaultItemInjected>

/**
 * Render the default-agent row.
 * @param props - shared roster state, real default write, and locale seat.
 * @returns the preference row.
 */
export function AgentDefaultItem({ useAgentPresetSection, useDeveloperTools, load, makeDefault, t }: AgentDefaultItemProps) {
  const state = useAgentPresetSection(value => value)
  const developerTools = useDeveloperTools(enabled => enabled)
  const [open, setOpen] = useState(false)
  useEffect(() => { void load() }, [load])
  const creatorHidden = isCreatorModeHidden()
  const options = state.rows.filter(row => row.broken === undefined
    && (developerTools || !requiresCodingTools(row))
    && !(creatorHidden && row.id === 'cordis'))
  const selected = options.find(row => row.isDefault) ?? options[0]
  const selectedText = selected === undefined ? undefined : presetDisplayText(selected, t)
  const busy = state.status === 'idle' || state.status === 'loading' || state.saving
  const selectorLabel = state.status === 'idle' || state.status === 'loading'
    ? t('defaultAgent.loading')
    : selectedText === undefined ? t('defaultAgent.empty') : selectedText.name
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('defaultAgent.title')}</div>
        <p className={css.description}>{t('defaultAgent.description')}</p>
        {state.error === null ? null : <p className={css.error} role="alert">{state.error}</p>}
      </div>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={options.map(row => ({ id: row.id, label: presetDisplayText(row, t).name }))}
        selectedId={selected?.id}
        onSelect={(id) => {
          setOpen(false)
          void makeDefault(id)
        }}
        align="end"
        portal
        anchor={(
          <button
            type="button"
            className={css.selector}
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={busy || options.length === 0}
            onClick={() => { setOpen(value => !value) }}
          >
            <span className={css.selectorLabel}>{selectorLabel}</span>
            <IconChevronDownOutlineRegular className={css.chevron} />
          </button>
        )}
      />
    </div>
  )
}
