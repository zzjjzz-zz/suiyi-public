/** The General section: feature-owned rows grouped into the prototype's cards. */
import { useId } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GeneralGroup, GeneralGroupId } from './general-groups.ts'
import type { SettingsKey } from './locales.ts'
import css from './GeneralSection.module.css'

/** Read face the shell supplies: the ledger's General rows, already grouped. */
export interface GeneralSectionInjected {
  hooks: { groups: ObservableSnapshot<readonly GeneralGroup[]> }
}

/** Full component props: section owner share, item render share, and grouped ledger. */
export type GeneralSectionComponentProps =
  PropsRuntime<'settings.section'> & PropsRenderSlots<'settings.general.item'> & PropsLocale<'settings'>
  & InjectFace<GeneralSectionInjected>

/** Card heading copy per group. */
const GROUP_KEYS = {
  output: 'general.group.output',
  appearance: 'general.group.appearance',
  general: 'general.group.general',
  permissions: 'general.group.permissions',
  runtime: 'general.group.runtime',
  version: 'general.group.version',
} as const satisfies Record<GeneralGroupId, SettingsKey>

/**
 * Render the General section content column.
 * @param props - composed slot props (contract/slots.ts).
 * @returns the section element tree.
 */
export function GeneralSection({ renderSlot, useGroups, t, category }: GeneralSectionComponentProps) {
  const all = useGroups(value => value)
  const wanted: readonly GeneralGroupId[] = category === 'permissions'
    ? ['permissions']
    : category === 'runtime' ? ['runtime']
      : category === 'desktop' ? ['version']
        : ['output', 'appearance', 'general']
  const groups = all.filter(group => wanted.includes(group.id))
  const prefix = useId()
  return (
    <div className={css.section}>
      {groups.map((group) => {
        const titleId = `${prefix}-${group.id}`
        return (
          <section key={group.id} className={css.group} aria-labelledby={titleId}>
            <h3 className={css.groupTitle} id={titleId}>{t(GROUP_KEYS[group.id])}</h3>
            <div className={css.rows}>
              {group.rows.map(row => (
                <div key={row} className={css.rowSlot} data-general-row={row}>
                  {renderSlot('settings.general.item', {}, { only: row })}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
