/** Ordered Chat rows, local echoes, and running status share the flow slot's parent. */
import { memo, type ReactElement } from 'react'
import type { PendingSubmission } from '@deepseek-ai/dsh-api-session-controller/client'
import type { RenderEntry } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import { hasAssistantReplyContent } from '../contract/assistant-content.ts'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { AssistantChatData } from '../contract/chat-nodes.ts'
import type { ChatFlowSlotProps } from '../contract/slots.ts'
import { ChatNodeSeat } from './ChatNodeSeat.tsx'
import { ChatGroupSeat } from './ChatGroupSeat.tsx'
import { PendingSteeringBubble, PendingSubmissionBubble } from './MessageItem.tsx'
import { chatRenderKey } from './render-entry.ts'
import { orderProcessAfterAnswer, type ProcessPlacementFacts } from './process-placement.ts'
import { RunningStatus } from './RunningStatus.tsx'
import a11yCss from './accessibility.module.css'

/** A local submission echo, or a Host-pending steering item without a local submission. */
type PendingInput = ChatFlowSlotProps['pendingInputs'][number]

/** Whether the echo is a local submission rather than a Host-pending steering item. */
function isLocalSubmission(item: PendingInput): item is PendingSubmission {
  return 'requestId' in item
}

/** Whether the echo is a local submission that opens a new Turn. */
function isTranscriptEcho(item: PendingInput): boolean {
  return isLocalSubmission(item) && item.placement === 'transcript'
}

/** Render the flow without adding a DOM parent or changing keyed row positions. */
export const ChatFlow = memo(function ChatFlow({
  entries, pendingInputs, lastInputTurn, deferCollapse,
  useSession, useChat, useChatNode, useChatNodeBottom, useChatNodeProcess, useChatGroup, usePresentation, useConnectionState,
  useStore, actions, renderSlot, renderFactorySlot, t, useGroupAction, useGroupHeaderAction,
  cwd, openFile, inspectCall, forkAt, loadImage, readChatGroup,
}: ChatFlowSlotProps) {
  const nodeStore = useChat(snapshot => snapshot.nodes)
  const running = useSession(snapshot => snapshot.running)
  const disconnected = useConnectionState(state => state === 'disconnected' || state === 'connecting')
  const latestTurnAnchor = useChat(snapshot => snapshot.navigation.items().at(-1)?.anchorKey)
  const runningStartTime = useChatNode(latestTurnAnchor ?? '', (node) => {
    const location = node?.location
    return location?.kind === 'turn' || location?.kind === 'step'
      ? location.turn.status === 'open' ? location.turn.start?.time : undefined
      : undefined
  })
  const latestTurnOpen = useChatNode(latestTurnAnchor ?? '', (node) => {
    const location = node?.location
    return (location?.kind === 'turn' || location?.kind === 'step') && location.turn.status === 'open'
  })
  const latestAssistantKey = useChat(snapshot => snapshot.order.findLast((key) => {
    const node = snapshot.nodes.get(key)
    return node?.kind === 'assistant-step' && (node.data as AssistantChatData).status === 'running'
  }))
  const hasReply = useChatNode(latestAssistantKey ?? '', node => node?.kind === 'assistant-step'
    && hasAssistantReplyContent((node.data as AssistantChatData).blocks))
  const thinkingMark = process.env.DSH_CLIENT_BUILD_PROFILE === 'suiyi' && !hasReply
    ? renderSlot('conversation.chat.waiting.mark', { size: 32, running: running && !disconnected }, {
      fallback: <FishLogo size={32} />,
    })
    : undefined
  const holding = !running && latestTurnOpen
  const grouped = usePresentation(policy => policy.stepGrouping === 'collapsed')
  const lastGroupKey = entries.findLast(entry => entry.kind === 'group')?.key
  const lastGroup = useChatGroup(lastGroupKey ?? '', group => group?.data)
  const latestTurn = useChatNode(latestTurnAnchor ?? '', (node) => {
    const location = node?.location
    return location?.kind === 'turn' || location?.kind === 'step' ? location.turn.turn : undefined
  })
  const waitingGroupKey = thinkingMark !== undefined && (running || holding) && grouped
    && lastGroup?.closed === false && lastGroup.turn === latestTurn && lastGroup.summary.running === undefined
    ? lastGroupKey : undefined
  const seatProps = {
    nodeStore, useChatNode, useChatNodeBottom, useChatNodeProcess, usePresentation,
    useStore, actions, renderSlot, t, useGroupAction, deferCollapse,
    cwd, openFile, inspectCall, forkAt, loadImage,
  }
  const renderRow = (entry: RenderEntry) => {
    switch (entry.kind) {
      case 'node':
        return <ChatNodeSeat {...seatProps} key={chatRenderKey(entry)} nodeKey={entry.key}
          {...entry.groupPart === undefined ? {} : { groupPart: entry.groupPart }} />
      case 'group':
        return <ChatGroupSeat {...seatProps} key={chatRenderKey(entry)} groupKey={entry.key}
          useChatGroup={useChatGroup} useGroupHeaderAction={useGroupHeaderAction}
          thinking={entry.key === waitingGroupKey ? { mark: thinkingMark, paused: disconnected, holding } : undefined} />
      default:
        return assertNever(entry)
    }
  }
  const turnClean = (status: string | undefined, reason: string | undefined): boolean =>
    status === 'closed' && reason !== 'aborted' && reason !== 'interrupted' && reason !== 'error'
  const placementFacts: ProcessPlacementFacts[] = entries.map((entry) => {
    if (entry.kind === 'group') {
      const group = readChatGroup(entry.key)
      const first = group?.members[0]?.key
      const node = first === undefined ? undefined : nodeStore.get(first)
      const turn = node?.location.kind === 'turn' || node?.location.kind === 'step' ? node.location.turn : undefined
      const presentation = first === undefined ? undefined : nodeStore.processSource(first).getSnapshot()
      return {
        entry,
        turn: group?.data.turn,
        role: 'process',
        clean: group?.data.closed === true && turnClean(turn?.status, turn?.end?.data.reason.kind)
          && presentation?.hasInterleavedInput !== true,
        hasGroup: true,
        hasSummary: false,
        hasInterleavedInput: presentation?.hasInterleavedInput === true,
      }
    }
    const node = nodeStore.get(entry.key)
    const turn = node?.location.kind === 'turn' || node?.location.kind === 'step' ? node.location.turn : undefined
    const presentation = nodeStore.processSource(entry.key).getSnapshot()
    return {
      entry,
      turn: turn?.turn,
      role: node?.kind === 'turn-tail' ? 'tail' : node?.kind === 'turn-process' ? 'process' : 'other',
      clean: turnClean(turn?.status, turn?.end?.data.reason.kind) && presentation?.hasInterleavedInput !== true,
      hasGroup: false,
      hasSummary: node?.kind === 'turn-process',
      hasInterleavedInput: presentation?.hasInterleavedInput === true,
    }
  })
  const placed = process.env.DSH_CLIENT_BUILD_PROFILE === 'suiyi'
    ? orderProcessAfterAnswer(placementFacts)
    : placementFacts.map(fact => ({ kind: 'entry' as const, entry: fact.entry }))
  const rows = placed.map(item => item.kind === 'announce'
    ? <span key={`turn-process-announce:${item.turn}`} role="status" aria-live="polite" aria-atomic="true"
      className={a11yCss.visuallyHidden}>{t('message.turnProcess.worked')}</span>
    : renderRow(item.entry))
  // Transcript echoes open the running Turn and precede the status; steering
  // and Inbox echoes follow it, so the status stays on the running Turn's tail.
  // The first transcript echo opens the next Turn, whose first claim takes the
  // steering already pending ahead of it before that prompt; those echoes lead
  // the same Turn in claim order.
  const firstTranscript = pendingInputs.findIndex(isTranscriptEcho)
  const leadingRows: ReactElement[] = []
  const openingRows: ReactElement[] = []
  const pendingRows: ReactElement[] = []
  for (const [index, item] of pendingInputs.entries()) {
    const row = isLocalSubmission(item)
      ? <PendingSubmissionBubble key={item.requestId} submission={item}
        loadImage={loadImage} renderFactorySlot={renderFactorySlot} t={t} />
      : <PendingSteeringBubble key={item.id} content={item.content}
        loadImage={loadImage} renderFactorySlot={renderFactorySlot} t={t} />
    if (index <= firstTranscript) leadingRows.push(row)
    else if (isTranscriptEcho(item)) openingRows.push(row)
    else pendingRows.push(row)
  }
  const tail = entries.at(-1)
  const node = tail?.kind === 'node' ? nodeStore.get(tail.key) : undefined
  // An empty opening control follows the echoes that lead its Turn.
  // All rows share this keyed list so inserting the control keeps the echoes mounted.
  if (node?.kind === 'turn-process' && node.location.kind === 'turn'
    && node.location.turn.status === 'open' && node.location.turn.turn !== lastInputTurn) {
    rows.splice(rows.length - 1, 0, ...leadingRows.splice(0))
  }
  // Rows enter before the keyed status and echoes after it, so React never moves its DOM node. The
  // running bit and the Turn's end arrive separately: after the bit clears, an open latest Turn keeps
  // the status slot (hidden) until its actions row takes the slot in the same commit.
  return [
    ...rows, ...leadingRows, ...openingRows,
    ...(running || holding) && waitingGroupKey === undefined ? [<RunningStatus key="running" startTime={runningStartTime} paused={disconnected}
      holding={holding} thinkingMark={thinkingMark} t={t} />] : [],
    ...pendingRows,
  ]
})
