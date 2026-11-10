// @vitest-environment jsdom
/** Startup presentation stays separate from real client readiness. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { dismissSuiyiLaunch, installSuiyiLaunch } from '../src/suiyi-launch.ts'

const html = readFileSync(join(import.meta.dirname, '../launch/suiyi-launch.html'), 'utf8')
let dispose: (() => void) | undefined
let reduced = false
let container: HTMLDivElement

beforeEach(() => {
  vi.useFakeTimers()
  reduced = false
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced }, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load: () => Promise.resolve([]) } })
  Object.defineProperty(document, 'timeline', { configurable: true, value: { currentTime: 0 } })
  document.body.innerHTML = html
  document.documentElement.dataset.suiyiLaunch = ''
  container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)
  document.querySelector<HTMLElement>('.sy-launch')!.getAnimations = () => []
})
afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.replaceChildren()
  delete document.documentElement.dataset.suiyiLaunch
  delete document.documentElement.dataset.dshReduceMotion
  Reflect.deleteProperty(document, 'fonts')
  Reflect.deleteProperty(document, 'timeline')
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
function ready(): void {
  const app = document.createElement('div')
  app.dataset.shellOverlay = ''
  container.replaceChildren(app)
}

it('does not install a scene in the official document', () => {
  document.getElementById('suiyi-login-transition')!.remove()
  dispose = installSuiyiLaunch(container)
  expect(container.inert).not.toBe(true)
})
it('waits for the real renderer after the animation finishes', async () => {
  dispose = installSuiyiLaunch(container)
  await vi.advanceTimersByTimeAsync(4000)
  expect(container.inert).toBe(true)
  expect(document.getElementById('suiyi-login-transition')).not.toBeNull()
  ready()
  await vi.advanceTimersByTimeAsync(450)
  expect(container.inert).toBe(false)
  expect(document.getElementById('suiyi-login-transition')).toBeNull()
})
it('does not reveal an unready app when skipping; releases it when ready', async () => {
  dispose = installSuiyiLaunch(container)
  document.querySelector<HTMLButtonElement>('.sy-launch-skip')!.click()
  await vi.advanceTimersByTimeAsync(500)
  expect(container.inert).toBe(true)
  ready()
  await vi.advanceTimersByTimeAsync(450)
  expect(container.inert).toBe(false)
})
it('returns skipped launch focus to the app without activating its input', async () => {
  dispose = installSuiyiLaunch(container)
  ready()
  const input = document.createElement('input')
  input.dataset.composerInput = ''
  container.append(input)
  const skip = document.querySelector<HTMLButtonElement>('.sy-launch-skip')!
  skip.focus()
  skip.click()
  await vi.advanceTimersByTimeAsync(450)
  expect(document.activeElement).toBe(container)
  expect(document.activeElement).not.toBe(input)
  expect(container.hasAttribute('tabindex')).toBe(false)
})
it('Escape skips motion and a failed boot remains visible', async () => {
  dispose = installSuiyiLaunch(container)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  const failed = document.createElement('div')
  failed.dataset.dshBoot = 'failed'
  failed.textContent = 'original boot failure'
  container.append(failed)
  await vi.advanceTimersByTimeAsync(1)
  expect(container.inert).toBe(false)
  expect(container.textContent).toBe('original boot failure')
  expect(document.getElementById('suiyi-login-transition')).toBeNull()
})
it('uses the reduced motion duration without removing the readiness gate', async () => {
  reduced = true
  dispose = installSuiyiLaunch(container)
  expect(document.querySelector<HTMLElement>('.sy-launch')!.dataset.motion).toBe('reduced')
  ready()
  await vi.advanceTimersByTimeAsync(900)
  expect(container.inert).toBe(false)
})
it('cancels pending work on page disposal', async () => {
  dispose = installSuiyiLaunch(container)
  window.dispatchEvent(new Event('pagehide'))
  await vi.advanceTimersByTimeAsync(5000)
  expect(vi.getTimerCount()).toBe(0)
  expect(document.getElementById('suiyi-login-transition')).toBeNull()
  expect(container.inert).toBe(false)
})

it('shares one scene between the early entry and application entry', async () => {
  dispose = installSuiyiLaunch(container)
  expect(installSuiyiLaunch(container)).toBe(dispose)
  dismissSuiyiLaunch()
  await vi.advanceTimersByTimeAsync(5000)
  expect(vi.getTimerCount()).toBe(0)
  expect(container.inert).toBe(false)
})

it('reveals a fatal report even before the asynchronous launch entry runs', () => {
  container.inert = true
  dismissSuiyiLaunch()
  expect(document.documentElement.hasAttribute('data-suiyi-launch')).toBe(false)
  expect(container.inert).toBe(false)
  dispose = installSuiyiLaunch(container)
  expect(document.getElementById('suiyi-login-transition')).toBeNull()
})

it('responds to the application motion preference while waiting for readiness', async () => {
  dispose = installSuiyiLaunch(container)
  document.documentElement.dataset.dshReduceMotion = 'true'
  await vi.advanceTimersByTimeAsync(1)
  expect(container.inert).toBe(true)
  expect(document.querySelector<HTMLElement>('.sy-launch')!.dataset.motion).toBe('reduced')
  expect(document.querySelector<HTMLImageElement>('.sy-launch-emblem img')!.src).not.toContain('logo-motion.svg')
  ready()
  await vi.advanceTimersByTimeAsync(1)
  expect(container.inert).toBe(false)
})
