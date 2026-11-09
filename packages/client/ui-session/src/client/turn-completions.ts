/**
 * Live turn-completion observation for Client features that react to a turn
 * finishing, without replaying restored history or keeping every Session open.
 *
 * A Session is retained while it is running or awaiting its terminal event,
 * with at least one listener. The observer accepts `turn/end` only from a live
 * `append` change and only when its reason is `completed`; history `replace` and
 * `prepend` changes, aborted/error turns, and repeated Seq values never notify.
 *
 * @module @deepseek-ai/dsh-client-ui-session/client/turn-completions
 */

import type {
  ISessions,
  SessionReference,
  SessionEventSource,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One normally completed turn observed live on this Client. */
export interface SessionTurnCompletion {
  /** Session that ended the turn. */
  readonly sessionId: SessionId
  /** Turn number from the durable `turn/end` event. */
  readonly turn: number
  /** Display title captured at completion; never message content. */
  readonly title: string
  /** Terminal reason, restricted to `completed` by this observer. */
  readonly reason: 'completed'
}

/** One live completion listener. */
export type SessionTurnCompletionListener = (completion: SessionTurnCompletion) => void

/** Reference-source label this observer owns; merged into the Client reference map. */
export const TURN_COMPLETION_REFERENCE_SOURCE = 'turnCompletionNotification'

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    /** Retains running Sessions for live turn-completion observation. */
    turnCompletionNotification: unknown
  }
}

/** One retained Session's event subscription and duplicate fence. */
interface Observation {
  readonly reference: SessionReference
  readonly generation: number
  readonly source: SessionEventSource
  unsubscribe: (() => void) | undefined
  ready: boolean
  settled: boolean
}

/**
 * Observe normally completed live turns. The owner enables observation only
 * while at least one listener exists, so an unused feature retains nothing.
 */
export class TurnCompletionObserver {
  private readonly listeners = new Set<SessionTurnCompletionListener>()
  private readonly observations = new Map<SessionId, Observation>()
  private readonly lastSeq = new Map<SessionId, number>()
  private generation = 0
  private disposed = false

  /**
   * @param sessions - Client Session layer that can retain a running binding.
   * @param runningSessions - current running flag by Session, used when the first listener arrives.
   */
  constructor(
    private readonly sessions: ISessions,
    private readonly runningSessions: () => ReadonlyMap<SessionId, boolean>,
  ) {}

  /**
   * Subscribe to live normal turn completions. The first listener starts
   * retention for currently running Sessions; the last removal releases all.
   * @param listener - completion recipient.
   * @returns disposer removing the listener.
   */
  subscribe(listener: SessionTurnCompletionListener): () => void {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    if (this.listeners.size === 1) {
      for (const [sessionId, running] of this.runningSessions()) {
        if (running) this.retain(sessionId)
      }
    }
    return () => {
      if (!this.listeners.delete(listener)) return
      if (this.listeners.size === 0) this.releaseAll()
    }
  }

  /**
   * Apply one running-state change from the Client status source.
   * @param sessionId - Session whose running state changed.
   * @param running - whether a turn is running.
   */
  observeRunning(sessionId: SessionId, running: boolean): void {
    if (this.disposed || this.listeners.size === 0) return
    if (running) this.retain(sessionId)
    else {
      const observation = this.observations.get(sessionId)
      if (observation !== undefined) this.releaseSettled(sessionId, observation)
    }
  }

  /**
   * Release a Session removed from the Host catalog.
   * @param sessionId - removed Session identity.
   */
  forget(sessionId: SessionId): void {
    const observation = this.observations.get(sessionId)
    if (observation !== undefined) this.release(sessionId, observation)
  }

  /** Release every retained Session and invalidate pending `ready` callbacks. */
  reset(): void {
    this.generation += 1
    this.releaseAll()
  }

  /** Stop observing permanently and release every retained Session. */
  dispose(): void {
    this.disposed = true
    this.generation += 1
    this.releaseAll()
    this.listeners.clear()
  }

  private retain(sessionId: SessionId): void {
    if (this.disposed || this.observations.has(sessionId)) return
    const generation = this.generation
    let reference: SessionReference
    try {
      reference = this.sessions.retain(sessionId, { source: TURN_COMPLETION_REFERENCE_SOURCE })
    } catch (error) {
      console.error('ui-session: turn-completion observation could not retain the Session', error)
      return
    }
    const source = reference.binding.eventSource
    const observation: Observation = { reference, generation, source, unsubscribe: undefined, ready: false, settled: true }
    this.observations.set(sessionId, observation)
    // Existing windows establish the cursor; only later append publications notify.
    this.accept(sessionId, observation, source.getSnapshot().entries, false)
    observation.unsubscribe = source.subscribe(() => { this.inspect(sessionId, observation) })
    const release = (): void => { this.release(sessionId, observation) }
    void reference.ready.then(
      () => {
        if (!this.current(sessionId, observation)) { release(); return }
        observation.ready = true
        this.releaseSettled(sessionId, observation)
      },
      () => { release() },
    )
  }

  private inspect(sessionId: SessionId, observation: Observation): void {
    if (!this.current(sessionId, observation)) return
    const change = observation.source.getSnapshot().change
    if (change.kind === 'replace') observation.settled = true
    if (change.kind === 'append' || change.kind === 'replace') {
      this.accept(sessionId, observation, change.entries, change.kind === 'append')
    }
    this.releaseSettled(sessionId, observation)
  }

  private accept(sessionId: SessionId, observation: Observation,
    entries: ReturnType<SessionEventSource['getSnapshot']>['entries'], live: boolean): void {
    for (const entry of entries) {
      if (entry.type !== 'event') continue
      const event = entry.event
      if (event.type === 'turn/start') observation.settled = false
      if (event.type !== 'turn/end') continue
      const previous = this.lastSeq.get(sessionId) ?? -1
      if (live && event.seq <= previous) continue
      observation.settled = true
      this.lastSeq.set(sessionId, Math.max(previous, event.seq))
      if (!live || event.data.reason.kind !== 'completed') continue
      const title = this.sessions.list.getSnapshot().byId[sessionId]?.displayTitle ?? ''
      const completion: SessionTurnCompletion = {
        sessionId,
        turn: event.data.turn,
        title,
        reason: 'completed',
      }
      this.emit(completion)
    }
  }

  private releaseSettled(sessionId: SessionId, observation: Observation): void {
    if (observation.ready && observation.settled && this.runningSessions().get(sessionId) !== true) {
      this.release(sessionId, observation)
    }
  }

  private current(sessionId: SessionId, observation: Observation): boolean {
    return !this.disposed
      && observation.generation === this.generation
      && this.observations.get(sessionId) === observation
      && this.listeners.size > 0
  }

  private emit(completion: SessionTurnCompletion): void {
    for (const listener of [...this.listeners]) {
      try { listener(completion) }
      catch (error) {
        // One consumer must not starve the remaining completion listeners.
        console.error('ui-session: a turn-completion listener failed', error)
      }
    }
  }

  private release(sessionId: SessionId, observation: Observation): void {
    if (this.observations.get(sessionId) !== observation) return
    this.observations.delete(sessionId)
    observation.unsubscribe?.()
    observation.unsubscribe = undefined
    observation.reference.release()
  }

  private releaseAll(): void {
    for (const [sessionId, observation] of [...this.observations]) this.release(sessionId, observation)
  }
}
