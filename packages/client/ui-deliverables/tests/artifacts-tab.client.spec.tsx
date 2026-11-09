// @vitest-environment jsdom
/** The workbench Artifacts page over the real deliverables Turn projection. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { EMPTY_CHAT_SNAPSHOT } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {
  ConversationLocationDataSource, ConversationLocationDataStore,
  ConversationTurnDataMap, TurnLocation,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ArtifactsTab, deliveredFiles } from '../src/client/ArtifactsTab.tsx'
import type { DeliverablesTurnData } from '../src/client/turn-deliverables.ts'
import { zh } from '../src/client/locales.ts'
import { artifactsTabProps } from './inject-face.client.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const SESSION_A = 's-artifacts-a' as SessionId
const SESSION_B = 's-artifacts-b' as SessionId

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

function delivered(path: string, seq: number): DeliverablesTurnData {
  return { produced: [], presented: [{ path, seq, index: 0, description: 'Report' }] }
}

function mount(
  chat: ChatSnapshot | undefined | (() => ChatSnapshot | undefined),
  sessionId: SessionId = SESSION_A,
) {
  const openResource = vi.fn()
  const close = vi.fn()
  const openPresented = vi.fn(async () => ({ kind: 'opened' as const }))
  const reloadPresentedHost = vi.fn(async () => {})
  const props = artifactsTabProps({
    sessionId,
    cwd: sessionId === SESSION_A ? '/work/a' : '/work/b',
    chat,
    openResource,
    close,
    openPresented,
    reloadPresentedHost,
  })
  const view = render(<ArtifactsTab {...props} />)
  return { view, openResource, close, openPresented, reloadPresentedHost, props }
}

describe('ArtifactsTab', () => {
  it('lists the latest real declarations and opens them through the safe paths', () => {
    const first = '/work/a/out/first.md'
    const latest = '/work/a/out/latest.md'
    const b = mount(chatWith([
      turn(1, delivered(first, 2)),
      turn(2, { produced: [], presented: [
        { path: first, seq: 4, index: 0, description: 'Updated' },
        { path: latest, seq: 4, index: 1, description: 'Final' },
      ] }),
    ]))
    expect(deliveredFiles(b.props.useConversation(conversation => conversation.views.get('chat'))).map(file => file.path))
      .toEqual([first, latest])
    expect(b.view.getByText('first.md')).toBeDefined()
    expect(b.view.getByText('latest.md')).toBeDefined()
    fireEvent.click(b.view.getByRole('button', { name: zh['presented.previewCard'].replace('{name}', first) }))
    expect(b.openResource).toHaveBeenLastCalledWith('dsh-resource://file/session/s-artifacts-a/out/first.md', { paneId: 'pane-1' })
    fireEvent.click(b.view.getAllByRole('button', { name: zh['artifacts.open'] })[1]!)
    expect(b.openPresented).toHaveBeenLastCalledWith(SESSION_A, 4, 1)
  })

  it('shows loading until the Conversation arrives, then only the late real deliveries', () => {
    const state: { chat: ChatSnapshot | undefined } = { chat: undefined }
    const b = mount(() => state.chat)
    expect(b.view.getByText(zh['artifacts.loading'])).toBeDefined()
    state.chat = chatWith([turn(1, delivered('/work/a/late.md', 6))])
    b.view.rerender(<ArtifactsTab {...b.props} />)
    expect(b.view.getByText('late.md')).toBeDefined()
    expect(b.view.queryByText(zh['artifacts.loading'])).toBeNull()
  })

  it('shows the real empty state when the Session delivered nothing', () => {
    const b = mount(chatWith([turn(1)]))
    expect(b.view.getByText(zh['artifacts.empty'])).toBeDefined()
    expect(b.view.queryByRole('button', { name: zh['artifacts.open'] })).toBeNull()
  })

  it('drops the previous Session list and late declarations when the tab switches Session', () => {
    const a = mount(chatWith([turn(1, delivered('/work/a/old.md', 2))]))
    expect(a.view.getByText('old.md')).toBeDefined()
    const b = mount(chatWith([turn(1, delivered('/work/b/new.md', 3))]), SESSION_B)
    b.view.unmount()
    // Rerender the same mounted body with the new Session, not a fresh mount.
    a.view.rerender(<ArtifactsTab {...b.props} />)
    expect(a.view.queryByText('old.md')).toBeNull()
    expect(a.view.getByText('new.md')).toBeDefined()
    fireEvent.click(a.view.getByRole('button', { name: zh['artifacts.open'] }))
    expect(b.openPresented).toHaveBeenLastCalledWith(SESSION_B, 3, 0)
  })
})
