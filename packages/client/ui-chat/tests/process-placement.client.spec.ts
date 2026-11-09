import { describe, expect, it } from 'vitest'
import type { NodeKey, GroupKey } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { orderProcessAfterAnswer, type ProcessPlacementFacts } from '../src/client/chat/process-placement.ts'

function row(key: string, role: ProcessPlacementFacts['role'], extra: Partial<ProcessPlacementFacts> = {}): ProcessPlacementFacts {
  return {
    entry: { kind: 'node', key: key as NodeKey }, turn: 1, role,
    clean: true, hasGroup: false, hasSummary: role === 'process', hasInterleavedInput: false,
    ...extra,
  }
}

describe('settled process placement', () => {
  it('keeps a windowed summary until its tail is loaded', () => {
    const summary = row('summary', 'process')
    const answer = row('answer', 'other')
    expect(orderProcessAfterAnswer([summary, answer])).toEqual([
      { kind: 'entry', entry: summary.entry }, { kind: 'entry', entry: answer.entry },
    ])
    expect(orderProcessAfterAnswer([summary, answer, row('tail', 'tail')]).map(item => item.kind))
      .toEqual(['entry', 'announce', 'entry'])
  })

  it('moves the same summary and group entries after the answer without crossing turns', () => {
    const rows = [row('prompt', 'other'), row('summary', 'process'), row('group', 'process', {
      entry: { kind: 'group', key: 'group' as GroupKey }, hasGroup: true, hasSummary: false,
    }), row('answer', 'other'), row('tail', 'tail'), row('next', 'other', { turn: 2, clean: false })]
    const placed = orderProcessAfterAnswer(rows)
    expect(placed).toEqual([0, 3, 1, 2, 4, 5].map(index => ({ kind: 'entry', entry: rows[index]!.entry })))
    expect(placed[3]?.kind === 'entry' && placed[3].entry).toBe(rows[2]!.entry)
  })

  it.each([{ clean: false }, { hasInterleavedInput: true }])('preserves live, failed, or interleaved process order (%j)', (flags) => {
    const rows = [row('summary', 'process', flags), row('group', 'process', {
      entry: { kind: 'group', key: 'group' as GroupKey }, hasGroup: true, hasSummary: false,
    }), row('answer', 'other'), row('tail', 'tail')]
    expect(orderProcessAfterAnswer(rows)).toEqual(rows.map(item => ({ kind: 'entry', entry: item.entry })))
  })
})
