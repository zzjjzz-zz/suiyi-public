/**
 * Per-Agent invocation ownership for plugin hub tools.
 *
 * A turn is attributed only by explicit principal input. Any non-owner
 * principal blocks that turn, and later owner input in the same turn cannot
 * clear the block. A new turn can be attributed again by an explicit owner or
 * undefined principal entry; an unattributed turn (empty input) stays blocked.
 * The trust granted by an undefined principal belongs to the trusted
 * in-process caller with no Agent, never to a named Agent.
 *
 * @module @deepseek-ai/dsh-plugin-hub-client/owner-guard
 */

/**
 * Whether one observed value is an owner or trusted undefined input. Only an
 * absent value or a non-null object whose `kind` is exactly `owner` qualifies;
 * every other value is a non-owner attribution.
 * @param principal - one observed principal value.
 * @returns true for undefined or an owner object.
 */
function isOwner(principal: unknown): boolean {
  return principal === undefined
    || (typeof principal === 'object' && principal !== null && 'kind' in principal && principal.kind === 'owner')
}

/** One Agent's current turn and whether that turn is blocked. */
interface TurnOwnership {
  /** Turn number the record was last attributed for. */
  turn: number
  /** Whether a non-owner or unattributed input blocked this turn. */
  blocked: boolean
}

/**
 * Track the principal attribution of each Agent through its turns.
 *
 * State hangs on the Agents that call it, using object identity as the key, so
 * two Agents never share an attribution record. A record exists only after
 * {@link HubInvocationOwners.noteStep}; an Agent with no record is refused.
 */
export class HubInvocationOwners {
  private readonly turns = new WeakMap<object, TurnOwnership>()

  /**
   * Record the principals observed for one Agent step. An empty input on the
   * current turn leaves its state unchanged; a non-owner principal blocks the
   * turn; a new turn with explicit owner or undefined input restores
   * attribution.
   * @param agent - Agent whose turn is attributed.
   * @param turn - current turn number.
   * @param principals - every observed principal value for this input; empty
   *   when the input carries no attribution, such as an ignorable side event.
   * @returns nothing.
   */
  noteStep(agent: object, turn: number, principals: readonly unknown[]): void {
    const current = this.turns.get(agent)
    if (current !== undefined && current.turn === turn) {
      if (principals.length === 0) return
      if (principals.some(principal => !isOwner(principal))) {
        current.blocked = true
      }
      return
    }
    const blocked = principals.length === 0 || principals.some(principal => !isOwner(principal))
    this.turns.set(agent, { turn, blocked })
  }

  /**
   * Whether a call may proceed for the supplied Agent.
   * @param agent - the calling Agent, or `undefined` for a trusted in-process
   *   call with no Agent.
   * @returns true only for an unblocked attributed Agent, or for the trusted
   *   in-process call without an Agent.
   */
  permits(agent: object | undefined): boolean {
    if (agent === undefined) return true
    const current = this.turns.get(agent)
    return current !== undefined && !current.blocked
  }
}
