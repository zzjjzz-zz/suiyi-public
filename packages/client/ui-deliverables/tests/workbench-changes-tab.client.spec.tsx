// @vitest-environment jsdom
/** The workbench Changes page resolves the latest real turn change, or says none. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { EMPTY_CHAT_SNAPSHOT } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {
  ConversationLocationDataSource, ConversationLocationDataStore,
  ConversationTurnDataMap, TurnLocation,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { latestChangesCoordinates, WorkbenchChangesTab } from '../src/client/WorkbenchChangesTab.tsx'
import type { DeliverablesTurnData } from '../src/client/turn-deliverables.ts'
import { zh } from '../src/client/locales.ts'
import { changesTabProps } from './inject-face.client.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const SESSION_A = 's-changes-a' as SessionId
const SESSION_B = 's-changes-b' as SessionId

class TestTurnDataStore implements ConversationLocationDataStore<ConversationTurnDataMap> {
  private readonly values = new Map<string, unknown>()
  private readonly sources = new Map<string, ConversationLocationDataSource<unknown>>()

  get<Key extends Extract<keyof ConversationTurnDataMap, string>>(key: Key): Readonly<ConversationTurnDataMap[Key]> | undefined {
    return this.values.get(key) as Readonly<ConversationTurnDataMap[Key]> | undefined
  }

  source<Key extends Extract<keyof ConversationTurnDataMap, string>>(
    key: Key,
  ): ConversationLocationDataSource<Readonly<ConversationTurnDataMap[Key]> | undefined> {
    let source = this.sources.get(key)
    if (source === undefined) {
      source = { getSnapshot: () => this.get(key), subscribe: () => () => {} }
      this.sources.set(key, source)
    }
    return source as ConversationLocationDataSource<Readonly<ConversationTurnDataMap[Key]> | undefined>
  }

  set<Key extends Extract<keyof ConversationTurnDataMap, string>>(key: Key, value: ConversationTurnDataMap[Key]): void {
    this.values.set(key, value)
  }
}

function turn(turnNumber: number, data?: DeliverablesTurnData): TurnLocation {
  const store = new TestTurnDataStore()
  if (data !== undefined) store.set('deliverables', data)
  return { turn: turnNumber, start: undefined, end: undefined, status: 'closed', steps: [], data: store }
}

function chatWith(turns: readonly TurnLocation[]): ChatSnapshot {
  const map = new Map(turns.map(location => [location.turn, location]))
  return { ...EMPTY_CHAT_SNAPSHOT, timeline: { turnOrder: turns.map(location => location.turn), turns: map } }
}

function mountChanges(getChat: () => ChatSnapshot | undefined, sessionId: SessionId = SESSION_A) {
  const openResource = vi.fn()
  const close = vi.fn()
  const props = changesTabProps({
    sessionId,
    cwd: sessionId === SESSION_A ? '/work/a' : '/work/b',
    chat: getChat,
    openResource,
    close,
  })
  const view = render(<WorkbenchChangesTab {...props} />)
  return { view, openResource, close, props }
}

const changes = (seq: number): DeliverablesTurnData => ({ produced: [], changes: { seq } })

describe('WorkbenchChangesTab', () => {
  it('resolves the latest real Turn coordinates and opens the actual review', async () => {
    const chat = chatWith([turn(1, changes(5)), turn(2), turn(3, changes(9))])
    expect(latestChangesCoordinates(chat, SESSION_A)).toEqual({ sessionId: SESSION_A, seq: 9, turn: 3 })
    const b = mountChanges(() => chat)
    await waitFor(() => {
      expect(b.openResource).toHaveBeenCalledWith('dsh-resource://changes-review/session/s-changes-a/9/3', {
        params: { index: 0 },
      })
    })
    expect(b.close).toHaveBeenCalledOnce()
    expect(b.view.container.querySelector('[data-workbench-changes="opened"]')).not.toBeNull()
  })

  it('shows the real empty state when no Turn recorded changes', () => {
    const b = mountChanges(() => chatWith([turn(1), turn(2)]))
    expect(b.view.getByText(zh['changes.empty'])).toBeDefined()
    expect(b.openResource).not.toHaveBeenCalled()
  })

  it('shows loading until the Conversation is assembled, then opens a late first change', async () => {
    const state: { chat: ChatSnapshot | undefined } = { chat: undefined }
    const b = mountChanges(() => state.chat)
    expect(b.view.getByText(zh['changes.loading'])).toBeDefined()
    state.chat = chatWith([turn(1, changes(4))])
    b.view.rerender(<WorkbenchChangesTab {...b.props} />)
    await waitFor(() => {
      expect(b.openResource).toHaveBeenCalledWith('dsh-resource://changes-review/session/s-changes-a/4/1', {
        params: { index: 0 },
      })
    })
    expect(b.close).toHaveBeenCalledOnce()
  })

  it('settles on a completed state with a re-open button when the resolver cannot retire', async () => {
    const chat = chatWith([turn(1, changes(9))])
    const b = mountChanges(() => chat)
    await waitFor(() => {
      expect(b.openResource).toHaveBeenCalledWith('dsh-resource://changes-review/session/s-changes-a/9/1', {
        params: { index: 0 },
      })
    })
    expect(b.close).toHaveBeenCalledOnce()
    // The mocked close cannot unmount this tab, which is the same observable
    // surface as a review already open in another pane: completed, not a spinner.
    expect(b.view.container.querySelector('[data-workbench-changes="opening"]')).toBeNull()
    const reopen = b.view.getByRole('button', { name: zh['changes.open'] })
    fireEvent.click(reopen)
    expect(b.openResource).toHaveBeenCalledTimes(2)
    expect(b.close).toHaveBeenCalledTimes(2)
  })

  it('opens the new latest sequence after the first handoff instead of latching on the old address', async () => {
    let chat = chatWith([turn(1, changes(9))])
    const b = mountChanges(() => chat)
    await waitFor(() => {
      expect(b.openResource).toHaveBeenCalledWith(
        'dsh-resource://changes-review/session/s-changes-a/9/1', { params: { index: 0 } },
      )
    })
    chat = chatWith([turn(1, changes(9)), turn(2, changes(12))])
    b.view.rerender(<WorkbenchChangesTab {...b.props} />)
    await waitFor(() => {
      expect(b.openResource).toHaveBeenCalledWith(
        'dsh-resource://changes-review/session/s-changes-a/12/2', { params: { index: 0 } },
      )
    })
    expect(b.close).toHaveBeenCalledTimes(2)
  })

  it('does not let one Session latch suppress the next Session latest changes', async () => {
    const a = mountChanges(() => chatWith([turn(1, changes(7))]))
    await waitFor(() => {
      expect(a.openResource).toHaveBeenCalledWith('dsh-resource://changes-review/session/s-changes-a/7/1', {
        params: { index: 0 },
      })
    })
    expect(a.close).toHaveBeenCalledOnce()
    const b = mountChanges(() => chatWith([turn(1, changes(11))]), SESSION_B)
    b.view.unmount()
    a.view.rerender(<WorkbenchChangesTab {...b.props} />)
    await waitFor(() => {
      expect(b.openResource).toHaveBeenCalledWith('dsh-resource://changes-review/session/s-changes-b/11/1', {
        params: { index: 0 },
      })
    })
    expect(b.close).toHaveBeenCalledTimes(2)
  })
})
