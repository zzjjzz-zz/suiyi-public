// @vitest-environment jsdom
/** Pointer feedback preserves host actions and releases document-wide resources. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installLogoMotion } from '../src/client/logo-motion.ts'

let reduced = false
let media: EventTarget
let subject: ReturnType<Context['plugin']> | undefined

beforeEach(() => {
  vi.useFakeTimers()
  reduced = false
  media = new EventTarget()
  Object.defineProperty(media, 'matches', { get: () => reduced })
  vi.stubGlobal('matchMedia', () => media)
  document.body.innerHTML = '<button id="host"><span class="dsh-suiyi-motion-shell" data-motion-mark="hero"><svg></svg></span></button>'
})
afterEach(async () => {
  await subject?.dispose()
  subject = undefined
  document.body.replaceChildren()
  delete document.documentElement.dataset.dshReduceMotion
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mark(): HTMLElement {
  return document.querySelector<HTMLElement>('.dsh-suiyi-motion-shell')!
}
async function start(): Promise<void> {
  subject = new Context().plugin({ apply: installLogoMotion })
  await subject.await()
  vi.spyOn(mark(), 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 96, 96))
}
function move(x: number, y: number, type = 'mouse'): void {
  const event = new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true })
  Object.defineProperty(event, 'pointerType', { value: type })
  document.dispatchEvent(event)
  vi.advanceTimersByTime(20)
}

it('moves a nearby mark, ignores touch, and resets outside its range', async () => {
  await start()
  move(175, 160, 'touch')
  expect(mark().style.getPropertyValue('--logo-x')).toBe('')
  move(175, 160)
  const offset = Number.parseFloat(mark().style.getPropertyValue('--logo-x'))
  expect(offset).toBeGreaterThan(0)
  expect(offset).toBeLessThanOrEqual(10)
  move(900, 900)
  expect(mark().style.getPropertyValue('--logo-x')).toBe('')
  move(175, 160)
  document.dispatchEvent(new MouseEvent('pointerout', { relatedTarget: null }))
  expect(mark().style.getPropertyValue('--logo-x')).toBe('')
})

it('keeps the host click action while restarting and finishing feedback', async () => {
  await start()
  const host = document.querySelector<HTMLButtonElement>('#host')!
  const action = vi.fn()
  host.addEventListener('click', action)
  mark().click()
  expect(action).toHaveBeenCalledTimes(1)
  expect(mark().classList.contains('is-burst')).toBe(true)
  vi.advanceTimersByTime(500)
  mark().click()
  vi.advanceTimersByTime(500)
  expect(mark().classList.contains('is-burst')).toBe(true)
  vi.advanceTimersByTime(400)
  expect(mark().classList.contains('is-burst')).toBe(false)
  expect(action).toHaveBeenCalledTimes(2)
})

it('stops active feedback when either motion preference is enabled', async () => {
  await start()
  move(175, 160)
  mark().click()
  reduced = true
  media.dispatchEvent(new Event('change'))
  expect(mark().style.getPropertyValue('--logo-x')).toBe('')
  expect(mark().classList.contains('is-burst')).toBe(false)
  move(175, 160)
  mark().click()
  expect(mark().style.getPropertyValue('--logo-x')).toBe('')
  expect(mark().classList.contains('is-burst')).toBe(false)
  reduced = false
  move(175, 160)
  mark().click()
  document.documentElement.dataset.dshReduceMotion = 'true'
  await Promise.resolve()
  expect(mark().style.getPropertyValue('--logo-x')).toBe('')
  expect(mark().classList.contains('is-burst')).toBe(false)
})

it('disposes pending feedback and accepts no further document events', async () => {
  await start()
  move(175, 160)
  mark().click()
  const pending = new MouseEvent('pointermove', { clientX: 176, clientY: 160 })
  document.dispatchEvent(pending)
  await subject?.dispose()
  expect(mark().style.getPropertyValue('--logo-x')).toBe('')
  expect(mark().classList.contains('is-burst')).toBe(false)
  move(175, 160)
  mark().click()
  expect(mark().style.getPropertyValue('--logo-x')).toBe('')
  expect(mark().classList.contains('is-burst')).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})
