// @vitest-environment jsdom
/** Suiyi full-page settings: heading, section rail and active providers. */
import { contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
import { allowAllAccess, bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSettingsShellStore } from '../src/client/shell-store.ts'
import { SettingsPage, type SettingsPageProps } from '../src/client/SettingsPage.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
type AttentionSnapshot = Parameters<Parameters<GlobalStandardProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: GlobalStandardProps['useSessionStatus'] = selector => selector(noAttention)
const kit = {
  useSessions: (() => { throw new Error('unused') }) as never,
  useSessionStatus,
  usePanelInfo, useSessionRetainInfo: () => undefined, useResource,
  useWorkspaces: (() => { throw new Error('unused') }) as never,
  ...allowAllAccess,
  useContextMenu: contextMenuHook(),
}

const rows = [
  { id: 'general', order: 0, label: 'Appearance and general' },
  { id: 'models', order: 10, label: 'Models' },
]

function mount(activeId?: string) {
  const shell = createSettingsShellStore().create()
  if (activeId !== undefined) shell.actions.select(activeId)
  const close = vi.fn()
  const renderSlot = vi.fn(
    ((key: string, _owner: unknown, options?: { only?: string }) => {
      if (key === 'settings.header') return 'Settings and preferences'
      if (key === 'settings.close') return 'Close'
      if (key === 'settings.section') return <div data-testid={`section-${options?.only}`} />
      return <span data-testid={`slot-${key}`} />
    }) as SettingsPageProps['renderSlot'],
  )
  const props: SettingsPageProps = {
    ...kit,
    renderSlot,
    useStore: bindSnapshotSelector(shell),
    actions: shell.actions,
    useSections: select => select(rows),
    close,
    t: makeTranslate(en),
  }
  const view = render(<SettingsPage {...props} />)
  return { view, close, renderSlot, shell }
}

describe('SettingsPage', () => {
  it('renders the five prototype categories and the general content', () => {
    const { renderSlot } = mount()
    expect(screen.getByRole('heading', { level: 1, name: 'Settings and preferences' })).toBeTruthy()
    expect(screen.getByText(en['page.subtitle'])).toBeTruthy()
    for (const key of ['nav.appearance', 'nav.permissions', 'nav.runtime', 'nav.account', 'nav.desktop'] as const) {
      expect(screen.getByRole('button', { name: en[key] })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: en['nav.appearance'] }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByTestId('section-general')).toBeTruthy()
    const sectionCall = renderSlot.mock.calls.find(call => call[0] === 'settings.section')!
    expect(sectionCall[1]).toMatchObject({ category: 'general' })
    expect(sectionCall[2]).toEqual({ only: 'general' })
    expect(renderSlot).toHaveBeenCalledWith('settings.action', {})
  })

  it('routes permissions and runtime categories through the general provider and keeps models', () => {
    const { shell } = mount()
    fireEvent.click(screen.getByRole('button', { name: en['nav.permissions'] }))
    expect(shell.getSnapshot().activeId).toBe('permissions')
    expect(screen.getByTestId('section-general')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['nav.runtime'] }))
    expect(shell.getSnapshot().activeId).toBe('runtime')
    expect(screen.getByTestId('section-general')).toBeTruthy()
    expect(screen.getByTestId('section-models')).toBeTruthy()
  })

  it('states missing account and desktop providers', () => {
    mount('account')
    expect(screen.getByText(en['account.unavailable'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['nav.desktop'] }))
    expect(screen.getByText(en['desktop.unavailable'])).toBeTruthy()
  })
})
