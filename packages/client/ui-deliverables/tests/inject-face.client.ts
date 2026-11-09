/**
 * Typed fixtures for the workbench tab bodies. The slot ledger erases injected
 * faces, so these helpers assemble the exact composed props each spec mounts
 * instead of asserting a partial object through `unknown`.
 */
import type { ReactNode } from 'react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { GlobalStandardProps, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationSnapshot, ConversationViewSnapshotMap } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { PaneId, TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SidebarRightTabActions, SidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { allowAllAccess, contextMenuHook, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ArtifactsInjected, ArtifactsTabProps } from '../src/client/ArtifactsTab.tsx'
import type { WorkbenchChangesTabProps } from '../src/client/WorkbenchChangesTab.tsx'
import type { PresentedHost } from '../src/presented.ts'
import type { PresentedOpenPhase } from '../src/client/present-open.ts'
import { zh } from '../src/client/locales.ts'

const unused = (): never => { throw new Error('unused standard hook') }

function conversation(chat: ChatSnapshot | undefined): ConversationSnapshot {
  // A partial target map keeps the generic `get` honest: only `chat` is
  // provided by this fixture, and every other registered target is absent.
  const snapshots: Partial<ConversationViewSnapshotMap> = chat === undefined ? {} : { chat }
  return {
    views: { get: target => snapshots[target], grouped: () => undefined },
    activeTargets: new Set(),
  }
}

function sessions(sessionId: SessionId, cwd: string): SessionListState {
  return {
    ids: [sessionId],
    byId: { [sessionId]: { cwd } },
    phase: 'ready',
    projectionsBySession: {},
  } as SessionListState
}

/**
 * Standard session/global hooks used by both workbench tab bodies.
 * @param sessionId - the tab's Session.
 * @param cwd - the Session workspace root.
 * @param chat - the assembled Chat snapshot, if any.
 * @returns the framework standard props for the component.
 */
export function standardProps(
  sessionId: SessionId,
  cwd: string,
  chat: ChatSnapshot | undefined | (() => ChatSnapshot | undefined),
): GlobalStandardProps & SessionStandardProps {
  const standard = {
    sessionId,
    useSession: unused,
    useProjection: unused,
    useConversation: <T>(selector: (state: ConversationSnapshot) => T): T =>
      selector(conversation(typeof chat === 'function' ? chat() : chat)),
    useInput: unused,
    useChat: unused,
    useTrajectory: unused,
    usePanelInfo: unused,
    useSessions: <T>(selector: (state: SessionListState) => T): T => selector(sessions(sessionId, cwd)),
    useSessionStatus: unused,
    useSessionRetainInfo: unused,
    useResource: unused,
    useWorkspaces: unused,
    ...allowAllAccess,
    useContextMenu: contextMenuHook(),
    inputActions: {
      insertQuote: () => false,
      captureInsertion: unused,
      insertText: unused,
      setDraft: unused,
      persistDraft: unused,
      addAttachments: unused,
      removeAttachment: unused,
      pruneAttachments: unused,
      submit: unused,
    },
  }
  // The inferred variable keeps the optional host/client standard faces
  // assignable without an object-literal excess-property mismatch.
  return standard
}

/** Mocks a tab body needs from its owning tab occurrence. */
export interface TabActionsFixture {
  readonly openResource: SidebarRightTabActions['openResource']
  readonly close: SidebarRightTabActions['close']
}

/**
 * Build the tab information returned by `useTabInfo`.
 * @param kind - the tab's kind.
 * @param actions - open/close mocks.
 * @param title - chip text.
 * @returns the tab information record.
 */
export function tabInfo(kind: string, actions: TabActionsFixture, title = kind): SidebarRightTabInfo {
  return {
    sidebar: { expanded: true, fullscreen: false },
    panel: { id: 'pane-1' as PaneId, isFloating: false },
    tab: {
      id: 'tab-1' as TabId,
      kind,
      contentId: `sidebar://${kind}`,
      title,
      visible: true,
      navigation: { address: `sidebar://${kind}`, params: undefined, revision: 0 },
      signal: new AbortController().signal,
      actions: {
        bindCommands: () => () => {},
        openResource: actions.openResource,
        openTab: () => {},
        close: actions.close,
      },
    },
  }
}

/** Inputs shared by both workbench tab fixtures. */
export interface WorkbenchFaceOptions {
  readonly sessionId: SessionId
  readonly cwd?: string
  readonly chat: ChatSnapshot | undefined | (() => ChatSnapshot | undefined)
  readonly openResource: SidebarRightTabActions['openResource']
  readonly close: SidebarRightTabActions['close']
  readonly t?: ArtifactsTabProps['t']
}

/** Artifacts-specific injection sources/callbacks. */
export interface ArtifactsFaceOptions extends WorkbenchFaceOptions {
  readonly presentedOpen?: ObservableSnapshot<Readonly<Record<string, PresentedOpenPhase | undefined>>>
  readonly presentedHost?: ObservableSnapshot<PresentedHost | 'error' | null>
  readonly openPresented?: ArtifactsInjected['openPresented']
  readonly reloadPresentedHost?: ArtifactsInjected['reloadPresentedHost']
}

/**
 * Build the Artifacts tab's complete composed props.
 * @param options - Session, conversation, tab actions and injection.
 * @returns typed component props.
 */
export function artifactsTabProps(options: ArtifactsFaceOptions): ArtifactsTabProps {
  const {
    sessionId, cwd = '/work', chat, openResource, close,
    presentedOpen = createSnapshotStore<Readonly<Record<string, PresentedOpenPhase | undefined>>>({}),
    presentedHost = createSnapshotStore<PresentedHost | 'error' | null>({ name: 'desktop', available: true, fileManager: 'finder' }),
    openPresented = async () => ({ kind: 'opened' }),
    reloadPresentedHost = async () => {},
    t = makeTranslate(zh),
  } = options
  return {
    ...standardProps(sessionId, cwd, chat),
    useTabInfo: () => tabInfo('artifacts', { openResource, close }, 'Artifacts'),
    usePresentedOpen: <T>(selector: (value: Readonly<Record<string, PresentedOpenPhase | undefined>>) => T): T =>
      selector(presentedOpen.getSnapshot()),
    usePresentedHost: <T>(selector: (value: PresentedHost | 'error' | null) => T): T =>
      selector(presentedHost.getSnapshot()),
    reloadPresentedHost,
    openPresented,
    t,
  }
}

/**
 * Build the Changes resolver's complete composed props.
 * @param options - Session, conversation, tab actions and copy.
 * @returns typed component props.
 */
export function changesTabProps(options: WorkbenchFaceOptions): WorkbenchChangesTabProps {
  const { sessionId, cwd = '/work', chat, openResource, close, t = makeTranslate(zh) } = options
  return {
    ...standardProps(sessionId, cwd, chat),
    useTabInfo: () => tabInfo('changes', { openResource, close }, 'Changes'),
    t,
  }
}

/** A React component used where a framework seat requires a provider; the bodies never render it. */
export function TestSessionProvider({ children }: { children?: ReactNode }): ReactNode {
  return children
}
