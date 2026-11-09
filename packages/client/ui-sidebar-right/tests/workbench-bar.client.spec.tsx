// @vitest-environment jsdom
/** The persistent workbench domain bar: five doors over the real typed registry. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { EMPTY_HISTORY } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { LayoutState, PaneId, TabId, TabRecord } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { WorkbenchBar, type WorkbenchBarProps } from '../src/client/shell/WorkbenchBar.tsx'
import type { SidebarRightTabDefinition } from '../src/client/tab-registry.ts'
import type { SurfaceState } from '../src/client/stores.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const SESSION = 's-workbench' as SessionId
const PANE = 'pane-1' as PaneId

function tab(id: string, kind: string): TabRecord {
  return { id: id as TabId, kind, title: kind, contentId: `sidebar://${kind}` }
}

/** One docked pane holding the given records, the last one active. */
function surfaceWith(records: readonly TabRecord[]): SurfaceState {
  const active = records.at(-1)
  const layout: LayoutState = {
    nodes: {
      [PANE]: {
        kind: 'pane', id: PANE, host: 'dock', tabs: records.map(record => record.id),
        activeTabId: active?.id, rect: undefined,
      },
    },
    tabs: Object.fromEntries(records.map(record => [record.id, record])),
    rootId: PANE,
    floats: [],
    activePaneId: PANE,
    expanded: true,
    mode: 'push',
  }
  return { layout, history: EMPTY_HISTORY, minted: records.length }
}

function definition(kind: string): SidebarRightTabDefinition {
  return { id: `test/${kind}`, kind, title: () => kind }
}

function mount(records: readonly TabRecord[], types: readonly SidebarRightTabDefinition[] = []) {
  const focusTab = vi.fn<WorkbenchBarProps['focusTab']>()
  const openTab = vi.fn<WorkbenchBarProps['openTab']>()
  const useTabTypes: WorkbenchBarProps['useTabTypes'] = selector => selector(types)
  const view = render(<WorkbenchBar
    sessionId={SESSION}
    surface={surfaceWith(records)}
    focusTab={focusTab}
    openTab={openTab}
    useTabTypes={useTabTypes}
    t={makeTranslate(zh)}
  />)
  const button = (domain: string): HTMLElement => {
    const element = view.container.querySelector<HTMLElement>(`[data-workbench-tab="${domain}"]`)
    if (element === null) throw new Error(`expected the ${domain} tab`)
    return element
  }
  return { view, focusTab, openTab, button }
}

describe('WorkbenchBar', () => {
  it('draws the title and all five domain doors, marking the active domain', () => {
    const { view, button } = mount([tab('t1', 'files')])
    expect(view.getByText(zh['chrome.workbench'])).toBeDefined()
    expect([...view.container.querySelectorAll('[data-workbench-tab]')].map(node => node.getAttribute('data-workbench-tab')))
      .toEqual(['artifacts', 'files', 'terminal', 'browser', 'changes'])
    expect(button('files').getAttribute('aria-current')).toBe('page')
    expect(button('terminal').hasAttribute('aria-current')).toBe(false)
    // A document preview is still a file door.
    cleanup()
    const document = mount([tab('t1', 'text')])
    expect(document.button('files').getAttribute('aria-current')).toBe('page')
    cleanup()
    const changes = mount([tab('t1', 'changes')])
    expect(changes.button('changes').getAttribute('aria-current')).toBe('page')
    cleanup()
    const artifacts = mount([tab('t1', 'artifacts')])
    expect(artifacts.button('artifacts').getAttribute('aria-current')).toBe('page')
  })

  it('opens every registered provider through the existing typed registry', () => {
    const { openTab, button } = mount([tab('t1', 'files')], [definition('files'), definition('terminal'), definition('browser')])
    fireEvent.click(button('terminal'))
    expect(openTab).toHaveBeenLastCalledWith('terminal', { paneId: PANE })
    fireEvent.click(button('browser'))
    expect(openTab).toHaveBeenLastCalledWith('browser', { paneId: PANE })
    fireEvent.click(button('files'))
    // The active files tab already exists, so the click focuses rather than duplicates.
    expect(openTab).toHaveBeenCalledTimes(2)
  })

  it('focuses an already open terminal, browser or review instead of opening another', () => {
    const records = [tab('t1', 'files'), tab('t2', 'terminal'), tab('t3', 'browser'), tab('t4', 'changes-review')]
    const { focusTab, openTab, button } = mount(records, [definition('files'), definition('terminal'), definition('browser'), definition('changes-review')])
    for (const [domain, id] of [['terminal', 't2'], ['browser', 't3'], ['changes', 't4']] as const) {
      fireEvent.click(button(domain))
      expect(focusTab).toHaveBeenLastCalledWith(id)
    }
    expect(openTab).not.toHaveBeenCalled()
  })

  it('states why a missing provider is unavailable and never opens a tab for it', () => {
    const { view, openTab, button } = mount([])
    fireEvent.click(button('artifacts'))
    expect(view.getByRole('status').textContent).toBe(zh['workbench.unavailable.artifacts'])
    fireEvent.click(button('browser'))
    expect(view.getByRole('status').textContent).toBe(zh['workbench.unavailable.browser'])
    fireEvent.click(button('terminal'))
    expect(view.getByRole('status').textContent).toBe(zh['workbench.unavailable.terminal'])
    fireEvent.click(button('files'))
    expect(view.getByRole('status').textContent).toBe(zh['workbench.unavailable.files'])
    expect(openTab).not.toHaveBeenCalled()
  })

  it('keeps a registered review type without an open review or resolver explicitly unavailable', () => {
    const { view, openTab, button } = mount([], [definition('changes-review')])
    fireEvent.click(button('changes'))
    expect(view.getByRole('status').textContent).toBe(zh['workbench.unavailable.changes'])
    expect(openTab).not.toHaveBeenCalled()
  })

  it('opens the real changes resolver when it is registered and no review is open', () => {
    const { openTab, button } = mount([], [definition('changes')])
    fireEvent.click(button('changes'))
    expect(openTab).toHaveBeenLastCalledWith('changes', { paneId: PANE })
  })

  it('resolves through the changes provider even when an older review tab is open', () => {
    const oldReview = tab('t-old', 'changes-review')
    const { focusTab, openTab, button } = mount([oldReview], [definition('changes'), definition('changes-review')])
    fireEvent.click(button('changes'))
    expect(openTab).toHaveBeenLastCalledWith('changes', { paneId: PANE })
    expect(focusTab).not.toHaveBeenCalled()
  })

  it('uses the first registered artifacts provider when one exists', () => {
    for (const kind of ['artifacts', 'deliverables']) {
      const { openTab, button } = mount([], [definition(kind)])
      fireEvent.click(button('artifacts'))
      expect(openTab).toHaveBeenLastCalledWith(kind, { paneId: PANE })
      cleanup()
    }
  })
})
