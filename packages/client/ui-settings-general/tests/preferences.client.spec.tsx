// @vitest-environment jsdom
/**
 * General settings preferences: the visual-output availability gate, the
 * reduced-motion writer, and the document attribute its presenter owns.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
import { allowAllAccess, bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { en } from '../src/client/locales.ts'
import { ReduceMotionRow } from '../src/client/ReduceMotionRow.tsx'
import { VisualOutputRow } from '../src/client/VisualOutputRow.tsx'
import {
  GENERAL_SETTINGS_NAMESPACE, REDUCED_MOTION_ATTRIBUTE, ReducedMotionPreference,
  installReducedMotionPreference, type MotionSettings,
} from '../src/client/motion-preference.ts'
import type { VisualOutputAvailability } from '../src/client/visual-output.ts'
import { generalGroupOf, groupGeneralRows } from '../src/client/general-groups.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const t = ((key: keyof typeof en) => en[key]) as never
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
type AttentionSnapshot = Parameters<Parameters<GlobalStandardProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: GlobalStandardProps['useSessionStatus'] = selector => selector(noAttention)
const kit = {
  useSessions: (() => { throw new Error('unused') }) as never,
  useSessionStatus,
  usePanelInfo, useSessionRetainInfo: () => undefined, useResource,
  useWorkspaces: (() => { throw new Error('unused') }) as never,
  ...allowAllAccess,
  useContextMenu: contextMenuHook(),
}

/** One mutable form over a single preference field. */
function motionForm(initial: boolean | undefined, accepted = true) {
  let value = initial === undefined ? undefined : { reduceMotion: initial }
  let revision = 0
  const listeners = new Set<() => void>()
  const notify = (): void => { for (const listener of listeners) listener() }
  const snapshot = (): ConfigFormSnapshot<MotionSettings> => ({
    status: value === undefined ? 'loading' : 'ready',
    value, base: undefined, user: undefined, revision, writable: true,
  })
  const form: ConfigForm<MotionSettings> = {
    getSnapshot: snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    mutate: async () => accepted,
    set: async (field, next) => {
      if (!accepted) return false
      value = { ...(value ?? { reduceMotion: false }), [field]: next as boolean }
      revision += 1
      notify()
      return true
    },
    unset: async () => accepted,
  }
  const setValue = (next: boolean | undefined): void => {
    value = next === undefined ? undefined : { reduceMotion: next }
    revision += 1
    notify()
  }
  return { form, listeners, setValue }
}

/** Readiness source for one row state. */
function readiness(value: VisualOutputAvailability) {
  return createSnapshotStore<VisualOutputAvailability>(value)
}

describe('VisualOutputRow', () => {
  it('stays disabled with the reason for an absent provider', () => {
    const setEnabled = vi.fn(async () => true)
    render(<VisualOutputRow {...kit} t={t}
      useReadiness={bindSnapshotSelector(readiness({ ready: false, reason: 'not-installed' }))}
      useVisualOutput={bindSnapshotSelector(createSnapshotStore(false))}
      setEnabled={setEnabled} />)
    const toggle = screen.getByRole('switch', { name: en['visualOutput.title'] })
    expect(toggle.hasAttribute('disabled')).toBe(true)
    expect(toggle.getAttribute('title')).toBe(en['visualOutput.unavailable.notInstalled'])
    expect(screen.getByText(en['visualOutput.unavailable.notInstalled'])).toBeTruthy()
    fireEvent.click(toggle)
    expect(setEnabled).not.toHaveBeenCalled()
  })

  it('follows provider readiness and account state in place', async () => {
    const state = readiness({ ready: false, reason: 'isolation' })
    render(<VisualOutputRow {...kit} t={t}
      useReadiness={bindSnapshotSelector(state)}
      useVisualOutput={bindSnapshotSelector(createSnapshotStore(false))}
      setEnabled={async () => true} />)
    const toggle = screen.getByRole('switch', { name: en['visualOutput.title'] })
    expect(screen.getByText(en['visualOutput.unavailable.isolation'])).toBeTruthy()
    state.set({ ready: false, reason: 'permission' })
    await waitFor(() => { expect(screen.getByText(en['visualOutput.unavailable.permission'])).toBeTruthy() })
    state.set({ ready: true })
    await waitFor(() => { expect(toggle.hasAttribute('disabled')).toBe(false) })
  })

  it('writes an accepted choice, blocks duplicates, and surfaces a refusal', async () => {
    const enabled = createSnapshotStore(false)
    let settle!: (accepted: boolean) => void
    const setEnabled = vi.fn(() => new Promise<boolean>((resolve) => { settle = resolve }))
    render(<VisualOutputRow {...kit} t={t}
      useReadiness={bindSnapshotSelector(readiness({ ready: true }))}
      useVisualOutput={bindSnapshotSelector(enabled)}
      setEnabled={setEnabled} />)
    const toggle = screen.getByRole('switch', { name: en['visualOutput.title'] })
    expect(toggle.hasAttribute('disabled')).toBe(false)
    fireEvent.click(toggle)
    expect(setEnabled).toHaveBeenCalledExactlyOnceWith(true)
    expect(toggle.hasAttribute('disabled')).toBe(true)
    settle(false)
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(en['visualOutput.error']) })
    expect(toggle.hasAttribute('disabled')).toBe(false)

    fireEvent.click(toggle)
    enabled.set(true)
    settle(true)
    await waitFor(() => { expect(toggle.getAttribute('aria-checked')).toBe('true') })
  })

  it('shows a submitted choice only after the provider source accepts it', async () => {
    const enabled = createSnapshotStore(false)
    const setEnabled = vi.fn(async () => true)
    render(<VisualOutputRow {...kit} t={t}
      useReadiness={bindSnapshotSelector(readiness({ ready: true }))}
      useVisualOutput={bindSnapshotSelector(enabled)}
      setEnabled={setEnabled} />)
    const toggle = screen.getByRole('switch', { name: en['visualOutput.title'] })
    fireEvent.click(toggle)
    await waitFor(() => { expect(toggle.hasAttribute('disabled')).toBe(false) })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    enabled.set(true)
    await waitFor(() => { expect(toggle.getAttribute('aria-checked')).toBe('true') })
  })

  it('surfaces a rejected write', async () => {
    render(<VisualOutputRow {...kit} t={t}
      useReadiness={bindSnapshotSelector(readiness({ ready: true }))}
      useVisualOutput={bindSnapshotSelector(createSnapshotStore(false))}
      setEnabled={() => Promise.reject(new Error('offline'))} />)
    fireEvent.click(screen.getByRole('switch', { name: en['visualOutput.title'] }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(en['visualOutput.error']) })
  })
})

describe('general row groups', () => {
  it('places rows in the prototype cards and omits empty cards', () => {
    expect(generalGroupOf({ id: 'visual-output', order: 5 })).toBe('output')
    expect(generalGroupOf({ id: 'appearance', order: 10 })).toBe('appearance')
    expect(generalGroupOf({ id: 'reduced-motion', order: 12 })).toBe('appearance')
    expect(generalGroupOf({ id: 'developer-tools', order: 15 })).toBe('runtime')
    expect(generalGroupOf({ id: 'permission', order: -20 })).toBe('permissions')
    expect(generalGroupOf({ id: 'language', order: 0 })).toBe('general')
    expect(generalGroupOf({ id: 'current-version', order: 100 })).toBe('version')
    expect(groupGeneralRows([
      { id: 'permission', order: -20 },
      { id: 'visual-output', order: 5 },
      { id: 'visual-output', order: 5 },
      { id: 'appearance', order: 10 },
      { id: 'reduced-motion', order: 12 },
      { id: 'shortcuts', order: 16 },
      { id: 'current-version', order: 100 },
    ])).toEqual([
      { id: 'output', rows: ['visual-output'] },
      { id: 'appearance', rows: ['appearance', 'reduced-motion'] },
      { id: 'general', rows: ['shortcuts'] },
      { id: 'permissions', rows: ['permission'] },
      { id: 'version', rows: ['current-version'] },
    ])
  })

  it('pins completion and default assistant after language in General', () => {
    expect(groupGeneralRows([
      { id: 'default-agent', order: 100 },
      { id: 'turn-complete-notification', order: 40 },
      { id: 'language', order: 0 },
    ])).toEqual([
      { id: 'general', rows: ['language', 'turn-complete-notification', 'default-agent'] },
    ])
  })

  it('omits every empty card', () => {
    expect(groupGeneralRows([{ id: 'language', order: 0 }])).toEqual([
      { id: 'general', rows: ['language'] },
    ])
  })
})

describe('ReduceMotionRow', () => {
  it('writes the accepted preference and shows a refused save', async () => {
    const state = createSnapshotStore(false)
    let reject!: (error: Error) => void
    const setReduceMotion = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail }))
    render(<ReduceMotionRow {...kit} t={t}
      useReducedMotion={bindSnapshotSelector(state)} setReduceMotion={setReduceMotion} />)
    const toggle = screen.getByRole('switch', { name: en['motion.title'] })
    fireEvent.click(toggle)
    expect(setReduceMotion).toHaveBeenCalledExactlyOnceWith(true)
    expect(toggle.hasAttribute('disabled')).toBe(true)
    reject(new Error('refused'))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(en['motion.error']) })
    expect(toggle.hasAttribute('disabled')).toBe(false)
    state.set(true)
    await waitFor(() => { expect(toggle.getAttribute('aria-checked')).toBe('true') })
  })
})

describe('ReducedMotionPreference', () => {
  it('follows the accepted value onto the document and cleans up', () => {
    const { form, setValue } = motionForm(false)
    const preference = new ReducedMotionPreference(form)
    preference.start()
    preference.start()
    const root = document.documentElement
    expect(root.hasAttribute(REDUCED_MOTION_ATTRIBUTE)).toBe(false)

    setValue(true)
    expect(root.getAttribute(REDUCED_MOTION_ATTRIBUTE)).toBe('true')
    setValue(true)
    expect(root.getAttribute(REDUCED_MOTION_ATTRIBUTE)).toBe('true')
    setValue(false)
    expect(root.hasAttribute(REDUCED_MOTION_ATTRIBUTE)).toBe(false)

    preference.dispose()
    expect(root.hasAttribute(REDUCED_MOTION_ATTRIBUTE)).toBe(false)
  })

  it('treats an unloaded form as off and subscribes only to real changes', () => {
    const { form, listeners } = motionForm(undefined)
    const preference = new ReducedMotionPreference(form)
    const notify = vi.fn()
    const stop = preference.enabled.subscribe(notify)
    expect(preference.enabled.getSnapshot()).toBe(false)
    expect(listeners.size).toBe(1)
    stop()
    expect(listeners.size).toBe(0)
  })

  it('writes through the shared form and reports a refused write', async () => {
    const accepted = motionForm(false)
    const preference = new ReducedMotionPreference(accepted.form)
    await preference.setReduceMotion(true)
    expect(accepted.form.getSnapshot().value?.reduceMotion).toBe(true)

    const refused = motionForm(false, false)
    await expect(new ReducedMotionPreference(refused.form).setReduceMotion(true))
      .rejects.toThrow('Reduce-motion preference was not saved')
  })

  it('installs and disposes through the owning effect', () => {
    const { form } = motionForm(true)
    const preference = new ReducedMotionPreference(form)
    const disposers: (() => void)[] = []
    const ctx = { effect: (fn: () => (() => void)) => { disposers.push(fn()) } } as never
    installReducedMotionPreference(ctx, preference)
    expect(document.documentElement.getAttribute(REDUCED_MOTION_ATTRIBUTE)).toBe('true')
    disposers[0]!()
    expect(document.documentElement.hasAttribute(REDUCED_MOTION_ATTRIBUTE)).toBe(false)
  })

  it('uses the General settings namespace', () => {
    expect(GENERAL_SETTINGS_NAMESPACE).toBe('ui-settings-general')
  })
})
