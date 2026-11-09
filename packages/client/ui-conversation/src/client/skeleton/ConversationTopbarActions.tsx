/** Real topbar entries shared by every main panel. */
import { IconDarkOutlineRegular, IconLayersOutlineRegular, IconLightOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationShellChromeInjected } from '../contract/slots.ts'
import css from './ConversationRoot.module.css'

/** Topbar entries read the live theme and expose the two real navigation actions. */
export type ConversationTopbarActionsProps =
  Pick<ConversationShellChromeInjected, 'toggleTheme' | 'openPluginCenter'>
  & Pick<InjectFace<ConversationShellChromeInjected>, 'useTheme'>
  & PropsLocale<'conversation'>

/**
 * Render the prototype's plugin-center and theme controls. Both read live
 * services: the theme glyph follows the resolved palette, and the plugin
 * center opens the registered main panel when one exists.
 * @param props - live theme hook, navigation actions, and the locale seat.
 * @returns the two topbar controls with an 18px theme glyph.
 */
export function ConversationTopbarActions({
  useTheme, toggleTheme, openPluginCenter, t,
}: ConversationTopbarActionsProps) {
  const dark = useTheme(snapshot => snapshot.active.colorScheme === 'dark')
  return (
    <div className={css.topbarActions}>
      <Tooltip label={t('topbar.pluginCenter')} side="bottom" portal>
        <button
          type="button"
          className={css.topbarAction}
          aria-label={t('topbar.pluginCenter')}
          onClick={openPluginCenter}
        >
          <IconLayersOutlineRegular size={16} />
          <span className={css.topbarActionLabel}>{t('topbar.pluginCenter')}</span>
        </button>
      </Tooltip>
      <Tooltip label={t('topbar.theme')} side="bottom" portal>
        <button
          type="button"
          className={css.topbarIcon}
          aria-label={t('topbar.theme')}
          onClick={toggleTheme}
        >
          {dark ? <IconLightOutlineRegular size={18} /> : <IconDarkOutlineRegular size={18} />}
        </button>
      </Tooltip>
    </div>
  )
}
