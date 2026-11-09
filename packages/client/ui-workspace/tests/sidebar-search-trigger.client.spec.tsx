// @vitest-environment jsdom
/** The shell's search row asks the browser-owned search request; it owns no state. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { zh } from '../src/client/locales.ts'
import { SidebarSearchTrigger } from '../src/client/SidebarSearchTrigger.tsx'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh) as never

describe('SidebarSearchTrigger', () => {
  it('opens the workspace browser search through the injected request', () => {
    const requestSearch = vi.fn()
    const useShortcuts = ((selector: (rows: readonly never[]) => unknown) => selector([])) as never
    render(
      <SidebarSearchTrigger
        {...({} as GlobalStandardProps)}
        t={t}
        requestSearch={requestSearch}
        useShortcuts={useShortcuts}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '搜索会话' }))
    expect(requestSearch).toHaveBeenCalledTimes(1)
  })
})
