// @vitest-environment jsdom
/** The General default-agent row reads the real roster and keeps hidden/loading semantics. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentPresetSectionState } from '../src/client/section-store.ts'
import { zh } from '../src/client/locales.ts'
import { AgentDefaultItem } from '../src/client/AgentDefaultItem.tsx'

afterEach(() => { cleanup(); vi.unstubAllEnvs() })

const t = makeTranslate(zh) as never

function mount(state: Partial<AgentPresetSectionState>, makeDefault = vi.fn(async () => {})) {
  const snapshot: AgentPresetSectionState = { status: 'ready', error: null, saving: false, rows: [], view: null, ...state }
  const load = vi.fn(async () => {})
  render(
    <AgentDefaultItem
      {...({} as GlobalStandardProps)}
      useAgentPresetSection={selector => selector(snapshot)}
      useDeveloperTools={selector => selector(true)}
      load={load}
      makeDefault={makeDefault}
      t={t}
    />,
  )
  return { load, makeDefault }
}

describe('AgentDefaultItem', () => {
  it('hides Creator mode and writes the selected real preset', () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'suiyi')
    const { makeDefault } = mount({
      rows: [
        { id: 'standard', isDefault: true } as never,
        { id: 'cordis', name: 'Creator mode' } as never,
        { id: 'custom-min', name: 'Custom Min' } as never,
      ],
    })
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('menuitem', { name: 'Creator mode' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Custom Min' }))
    expect(makeDefault).toHaveBeenCalledWith('custom-min')
  })

  it('disables the selector while loading and when the roster is empty', () => {
    const loading = mount({ status: 'loading', rows: [] })
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('正在读取预设…')).toBeTruthy()
    loading.makeDefault.mockClear()
    cleanup()
    mount({ status: 'ready', rows: [] })
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('当前没有可选预设')).toBeTruthy()
  })

  it('surfaces a failed write and keeps the current selection', () => {
    mount({ error: 'settings write disconnected', rows: [{ id: 'standard', isDefault: true } as never] })
    expect(screen.getByRole('alert').textContent).toBe('settings write disconnected')
    expect(screen.getByRole('button').textContent).toContain('标准模式')
  })
})
