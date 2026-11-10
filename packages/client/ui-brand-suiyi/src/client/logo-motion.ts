/** Shared pointer and click motion for the Suiyi sidebar and hero marks. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'

const MARK_SELECTOR = '.dsh-suiyi-motion-shell'
const REDUCED_ATTRIBUTE = 'data-dsh-reduce-motion'
const MOTION_PROPERTIES = ['--logo-x', '--logo-y', '--logo-rx', '--logo-ry', '--logo-approach'] as const

/** Remove one mark's pointer-derived presentation without changing its size or slot. */
function resetMark(element: HTMLElement): void {
  for (const property of MOTION_PROPERTIES) element.style.removeProperty(property)
}

/**
 * Install one document-wide controller for every current and future Suiyi mark.
 * Pointer math and the click burst follow the frozen prototype. The controller
 * owns no model or navigation behavior: clicks bubble to the host's real action.
 * @param ctx - owning brand plugin context.
 */
export function installLogoMotion(ctx: ClientContext): void {
  ctx.effect(() => {
    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined
    const reduced = (): boolean => media?.matches === true
      || document.documentElement.getAttribute(REDUCED_ATTRIBUTE) === 'true'
    let pointer: { x: number; y: number } | undefined
    let frame = 0
    const burstTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>()
    const marks = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(MARK_SELECTOR)]

    const clearBurst = (element: HTMLElement): void => {
      const timer = burstTimers.get(element)
      if (timer !== undefined) clearTimeout(timer)
      burstTimers.delete(element)
      element.classList.remove('is-burst')
    }
    const resetAll = (): void => {
      for (const element of marks()) {
        resetMark(element)
        clearBurst(element)
      }
    }
    const sync = (): void => {
      if (!reduced()) return
      pointer = undefined
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
      resetAll()
    }
    const paint = (): void => {
      frame = 0
      if (pointer === undefined || reduced()) return
      for (const element of marks()) {
        const rect = element.getBoundingClientRect()
        if (rect.width === 0) continue
        const dx = pointer.x - rect.left - rect.width / 2
        const dy = pointer.y - rect.top - rect.height / 2
        const distance = Math.hypot(dx, dy)
        const radius = element.dataset.motionMark === 'hero' ? 220 : 105
        if (distance >= radius) { resetMark(element); continue }
        const force = Math.max(0, 1 - distance / radius)
        const offsetX = Math.max(-10, Math.min(10, dx * 0.06 * force))
        const offsetY = Math.max(-9, Math.min(9, dy * 0.06 * force))
        const tiltX = Math.max(-7, Math.min(7, -dy * 0.075 * force))
        const tiltY = Math.max(-7, Math.min(7, dx * 0.075 * force))
        element.style.setProperty('--logo-x', `${offsetX.toFixed(2)}px`)
        element.style.setProperty('--logo-y', `${offsetY.toFixed(2)}px`)
        element.style.setProperty('--logo-rx', `${tiltX.toFixed(2)}deg`)
        element.style.setProperty('--logo-ry', `${tiltY.toFixed(2)}deg`)
        element.style.setProperty('--logo-approach', force.toFixed(2))
      }
    }
    const onPointerMove = (event: PointerEvent): void => {
      if (event.pointerType === 'touch' || reduced()) return
      pointer = { x: event.clientX, y: event.clientY }
      if (frame === 0) frame = requestAnimationFrame(paint)
    }
    const onPointerOut = (event: PointerEvent): void => {
      if (event.relatedTarget !== null) return
      pointer = undefined
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
      for (const element of marks()) resetMark(element)
    }
    const onClick = (event: MouseEvent): void => {
      if (reduced() || !(event.target instanceof Element)) return
      const element = event.target.closest<HTMLElement>(MARK_SELECTOR)
      if (element === null) return
      clearBurst(element)
      // Restart the prototype's glide without cancelling the host action.
      void element.offsetWidth
      element.classList.add('is-burst')
      burstTimers.set(element, setTimeout(() => { clearBurst(element) }, 900))
    }
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [REDUCED_ATTRIBUTE] })
    document.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('pointerout', onPointerOut, { passive: true })
    document.addEventListener('click', onClick)
    media?.addEventListener('change', sync)
    sync()

    return () => {
      observer.disconnect()
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerout', onPointerOut)
      document.removeEventListener('click', onClick)
      media?.removeEventListener('change', sync)
      if (frame !== 0) cancelAnimationFrame(frame)
      for (const element of burstTimers.keys()) clearBurst(element)
      resetAll()
    }
  }, 'ui-brand-suiyi: shared logo motion')
}
