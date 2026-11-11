/**
 * Per-Agent invocation ownership for plugin hub tools.
 *
 * A top-level turn is attributed by admitted user or retry input. Any
 * non-owner principal blocks that turn, and later owner input in the same turn
 * cannot clear the block. A new turn can be attributed again by an explicit
 * owner or undefined principal entry; an unattributed turn (empty input) stays
 * blocked. An absent principal on an admitted input denotes trusted Host-owner
 * input; an Agent with no observed admission is refused. A call without an
 * Agent is a trusted in-process invocation.
 *
 * A subagent child instead inherits a fixed attribution ceiling from the Agent
 * that created it. An owner-attributed parent yields an owner ceiling; a
 * blocked or non-owner parent yields a guest ceiling; a child whose creator is
 * not live at adoption yields an unknown ceiling. Only an owner ceiling can
 * ever permit a call, and later input can tighten a turn but can never raise
 * the ceiling. A child that was never adopted (for example, one loaded from
 * history before this service observed it) is unknown and refused.
 *
 * @module @deepseek-ai/dsh-plugin-hub-client/owner-guard
 */

/** Agent-lineage facts the guard needs without depending on Agent internals. */
export interface HubAgentLineage {
  /**
   * Whether this Agent has a direct creator recorded by `parentSession`.
   * @param agent - observed Agent identity.
   * @returns true when the Session header records a direct creator.
   */
  readonly isChild: (agent: object) => boolean
  /**
   * Resolve the live direct creator of a subagent child.
   * @param agent - observed child Agent identity.
   * @returns the live parent Agent, or undefined when it is not live.
   */
  readonly parentOf: (agent: object) => object | undefined
}

/** Fixed maximum authority a child may exercise, derived once at adoption. */
type OwnershipCeiling = 'owner' | 'guest' | 'unknown'

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
  private readonly ceilings = new WeakMap<object, OwnershipCeiling>()

  /**
   * @param lineage - Agent parentage facts; omitted only when every Agent is independent.
   */
  constructor(private readonly lineage?: HubAgentLineage) {}

  /**
   * Freeze one child's inherited ceiling from its creator's current admission.
   * Call this when the child is created, before its first model step. A child
   * observed later is never adopted from current parent state because that
   * would reinterpret unknown history.
   * @param child - newly created Agent identity.
   * @returns nothing; an independent Agent is left unadopted.
   */
  adopt(child: object): void {
    if (this.lineage === undefined || !this.lineage.isChild(child)) return
    const parent = this.lineage.parentOf(child)
    this.ceilings.set(child, parent === undefined ? 'unknown' : this.ceilingOf(parent))
  }

  /**
   * Record the principals observed for one Agent step. An empty input on the
   * current turn leaves its state unchanged; a non-owner principal blocks the
   * turn; a new turn with explicit owner or undefined input restores
   * attribution within the Agent's ceiling.
   * @param agent - Agent whose turn is attributed.
   * @param turn - current turn number.
   * @param principals - every observed principal value for this input; empty
   *   when the input carries no attribution, such as an ignorable side event.
   * @returns nothing.
   */
  noteStep(agent: object, turn: number, principals: readonly unknown[]): void {
    if (this.lineage?.isChild(agent) === true) {
      this.noteChildStep(agent, turn, principals)
      return
    }
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
   * @returns true only for an unblocked attributed Agent within an owner
   *   ceiling, or for the trusted in-process call without an Agent.
   */
  permits(agent: object | undefined): boolean {
    if (agent === undefined) return true
    const current = this.turns.get(agent)
    if (current === undefined || current.blocked) return false
    const ceiling = this.ceilings.get(agent)
    return ceiling === undefined || ceiling === 'owner'
  }

  /** Attribute one child step without allowing input to widen its frozen ceiling. */
  private noteChildStep(agent: object, turn: number, principals: readonly unknown[]): void {
    const ceiling = this.ceilings.get(agent) ?? 'unknown'
    const current = this.turns.get(agent)
    if (current !== undefined && current.turn === turn) {
      if (ceiling !== 'owner') {
        current.blocked = true
        return
      }
      if (principals.length === 0) return
      if (principals.some(principal => !isOwner(principal))) {
        current.blocked = true
      }
      return
    }
    // Autonomous owner continuations retain their attribution, but an empty
    // later turn cannot erase a guest's block on an owner-born child.
    const blocked = ceiling !== 'owner'
      || principals.some(principal => !isOwner(principal))
      || (principals.length === 0 && current?.blocked === true)
    this.turns.set(agent, { turn, blocked })
  }

  /** Current authority of one creator, tightened by its own current turn. */
  private ceilingOf(parent: object): OwnershipCeiling {
    const state = this.turns.get(parent)
    if (state === undefined) return 'unknown'
    const inherited = this.ceilings.get(parent)
    if (inherited === 'guest' || inherited === 'unknown') return inherited
    return state.blocked ? 'guest' : 'owner'
  }
}
