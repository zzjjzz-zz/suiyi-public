// @vitest-environment jsdom
/** Real Suiyi bridge consumer: view states, actions, and the footer row. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { SuiyiIdentityController } from '../src/client/suiyi-identity.ts'
import { SuiyiAccountRow } from '../src/client/SuiyiAccountRow.tsx'
import { en } from '../src/client/locales.ts'
import type { DesktopSuiyiIdentityBridge, DesktopSuiyiIdentityView } from '../src/types.ts'

afterEach(() => { cleanup() })

function bridge(initial: DesktopSuiyiIdentityView, signInResult: Awaited<ReturnType<DesktopSuiyiIdentityBridge['signIn']>> = { ok: true }) {
  let listener: ((view: DesktopSuiyiIdentityView) => void) | undefined
  const signIn = vi.fn(async () => signInResult)
  const signOut = vi.fn(async () => {})
  const view = vi.fn(async () => initial)
  const value: DesktopSuiyiIdentityBridge = {
    view,
    signIn,
    signOut,
    subscribe: (next) => { listener = next; return () => { listener = undefined } },
  }
  return { value, view, signIn, signOut, publish: (next: DesktopSuiyiIdentityView) => listener?.(next) }
}

describe('SuiyiIdentityController', () => {
  it('reports unavailable without a bridge and never substitutes another identity', async () => {
    const controller = new SuiyiIdentityController(undefined)
    controller.start()
    expect(controller.store.getSnapshot().view).toEqual({ state: 'unavailable' })
    await controller.signIn()
    await controller.signOut()
    expect(controller.store.getSnapshot()).toMatchObject({ pending: null, failed: false })
    controller.dispose()
  })

  it('keeps a newer subscription event when the initial view resolves late', async () => {
    let publish: ((view: DesktopSuiyiIdentityView) => void) | undefined
    let resolveView: ((view: DesktopSuiyiIdentityView) => void) | undefined
    let rejectView: ((error: Error) => void) | undefined
    const viewPromise = new Promise<DesktopSuiyiIdentityView>((resolve, reject) => {
      resolveView = resolve
      rejectView = reject
    })
    const value: DesktopSuiyiIdentityBridge = {
      view: () => viewPromise,
      signIn: async () => ({ ok: true }),
      signOut: async () => {},
      subscribe: (listener) => { publish = listener; return () => {} },
    }
    const controller = new SuiyiIdentityController(value)
    controller.start()
    // The subscription event arrives before the initial read settles.
    publish?.({ state: 'signed-in', displayName: 'New' })
    resolveView?.({ state: 'locked' })
    await Promise.resolve()
    expect(controller.store.getSnapshot().view).toEqual({ state: 'signed-in', displayName: 'New' })
    rejectView?.(new Error('late'))
    await Promise.resolve()
    expect(controller.store.getSnapshot().view).toEqual({ state: 'signed-in', displayName: 'New' })
    controller.dispose()
  })

  it('rejects duplicate same-tick actions and does not report cancellation as failure', async () => {
    let finish!: (result: Awaited<ReturnType<DesktopSuiyiIdentityBridge['signIn']>>) => void
    const signIn = vi.fn(() => new Promise<Awaited<ReturnType<DesktopSuiyiIdentityBridge['signIn']>>>((resolve) => {
      finish = resolve
    }))
    const signOut = vi.fn(async () => {})
    const value: DesktopSuiyiIdentityBridge = {
      view: async () => ({ state: 'locked' }),
      signIn,
      signOut,
      subscribe: () => () => {},
    }
    const controller = new SuiyiIdentityController(value)
    const first = controller.signIn()
    const second = controller.signIn()
    expect(signIn).toHaveBeenCalledOnce()
    expect(controller.store.getSnapshot().pending).toBe('signIn')
    await controller.signOut()
    expect(signOut).not.toHaveBeenCalled()
    finish({ ok: false, reason: 'cancelled' })
    await Promise.all([first, second])
    expect(controller.store.getSnapshot()).toMatchObject({ pending: null, failed: false })
    controller.dispose()
    await controller.signIn()
    expect(signIn).toHaveBeenCalledOnce()
  })

  it('follows the real bridge view and settled sign-in result', async () => {
    const fake = bridge({ state: 'locked' }, { ok: false, reason: 'failed' })
    const controller = new SuiyiIdentityController(fake.value)
    controller.start()
    await waitFor(() => { expect(fake.view).toHaveBeenCalledOnce() })
    await controller.signIn()
    expect(fake.signIn).toHaveBeenCalledOnce()
    expect(controller.store.getSnapshot()).toMatchObject({ pending: null, failed: true })
    fake.publish({ state: 'signed-in', displayName: 'Ada' })
    expect(controller.store.getSnapshot().view).toEqual({ state: 'signed-in', displayName: 'Ada' })
    await controller.signOut()
    expect(fake.signOut).toHaveBeenCalledOnce()
    controller.dispose()
    fake.publish({ state: 'locked' })
    expect(controller.store.getSnapshot().view).toEqual({ state: 'signed-in', displayName: 'Ada' })
  })
})

describe('SuiyiAccountRow', () => {
  const t = makeTranslate(en)
  const base = { t, signIn: vi.fn(), signOut: vi.fn() }

  it('shows a verified name and signs out', () => {
    render(<SuiyiAccountRow {...base} state={{ view: { state: 'signed-in', displayName: 'Ada' }, pending: null, failed: false }} />)
    expect(screen.getByText('Ada')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['suiyiIdentity.signOut'] }))
    expect(base.signOut).toHaveBeenCalledOnce()
  })

  it('shows locked sign-in and unavailable states without substituting an account', () => {
    const { rerender } = render(<SuiyiAccountRow {...base} state={{ view: { state: 'locked' }, pending: null, failed: false }} />)
    expect(screen.getByText(en['suiyiIdentity.locked'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['suiyiIdentity.signIn'] }))
    expect(base.signIn).toHaveBeenCalledOnce()
    rerender(<SuiyiAccountRow {...base} state={{ view: { state: 'unavailable' }, pending: null, failed: false }} />)
    expect(screen.getByText(en['account.unavailable'])).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('disables the action while a real attempt is pending and reports failure', () => {
    render(<SuiyiAccountRow {...base} state={{ view: { state: 'signed-in', displayName: 'Ada' }, pending: 'signOut', failed: true }} />)
    expect(screen.getByRole('button', { name: en['suiyiIdentity.signOut'] }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('alert').textContent).toBe(en['suiyiIdentity.error'])
  })
})
