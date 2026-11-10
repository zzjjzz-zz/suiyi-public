/** Startup presentation; animation completion never substitutes for client readiness. */

import { suiyiLaunchCopy as copy } from './locales/suiyi-launch.ts'

let activeLaunch: (() => void) | undefined

/** Release startup presentation even if a fatal error preceded its asynchronous entry. */
export function dismissSuiyiLaunch(): void {
  if (activeLaunch !== undefined) { activeLaunch(); return }
  document.getElementById('suiyi-login-transition')?.remove()
  const container = document.getElementById('root')
  if (container !== null) container.inert = false
  delete document.documentElement.dataset.suiyiLaunch
}

/**
 * Activate the build-injected launch scene. The rendered application or a boot
 * failure releases it; skipping only shortens the animation. Page disposal
 * cancels observers, frames and timers. Official builds return a no-op disposer.
 * @param container - The real application mount point beneath the scene.
 * @returns Removes the scene and restores access to the mount point, including on fatal startup errors.
 */
export function installSuiyiLaunch(container: HTMLElement): () => void {
  if (activeLaunch !== undefined) return activeLaunch
  const host = document.getElementById('suiyi-login-transition')
  if (host === null) return () => {}
  const scene = host.querySelector<HTMLElement>('.sy-launch')
  const skip = host.querySelector<HTMLButtonElement>('.sy-launch-skip')
  const logo = host.querySelector<HTMLImageElement>('.sy-launch-emblem img')
  const status = host.querySelector<HTMLElement>('.sy-launch-status')
  const skipLabel = host.querySelector<HTMLElement>('[data-launch-skip-label]')
  const root = document.documentElement
  if (scene === null || skip === null || logo === null || status === null || skipLabel === null) {
    host.remove()
    container.inert = false
    delete root.dataset.suiyiLaunch
    throw new Error('Suiyi launch document is incomplete')
  }
  const previousFocus = document.activeElement
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let frame = 0
  let stopped = false
  let animationDone = false
  let leaving = false
  const schedule = (fn: () => void, ms: number): void => {
    const timer = setTimeout(() => { timers.delete(timer); fn() }, ms)
    timers.add(timer)
  }
  const reduced = (): boolean => reduce.matches || root.dataset.dshReduceMotion === 'true'
  const dispose = (): void => {
    if (stopped) return
    stopped = true
    activeLaunch = undefined
    for (const timer of timers) clearTimeout(timer)
    cancelAnimationFrame(frame)
    observer.disconnect()
    themeObserver.disconnect()
    reduce.removeEventListener('change', motionChanged)
    document.removeEventListener('keydown', keyboard, true)
    window.removeEventListener('pagehide', dispose)
    skip.removeEventListener('click', skipAnimation)
    const focusWasInScene = host.contains(document.activeElement)
    host.remove()
    container.inert = false
    delete root.dataset.suiyiLaunch
    delete document.body.dataset.suiyiLaunchThemed
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected && previousFocus !== document.body) {
      previousFocus.focus({ preventScroll: true })
    } else if (focusWasInScene) {
      // Return keyboard navigation to the app without activating the composer.
      const tabIndex = container.getAttribute('tabindex')
      container.tabIndex = -1
      container.focus({ preventScroll: true })
      if (tabIndex === null) container.removeAttribute('tabindex')
      else container.setAttribute('tabindex', tabIndex)
    }
  }
  const inspect = (): void => {
    if (stopped) return
    if (container.querySelector('[data-dsh-boot="failed"]') !== null) { dispose(); return }
    if (!animationDone || leaving || container.querySelector('[data-shell-overlay]') === null) return
    leaving = true
    scene.classList.add('is-leaving')
    if (reduced()) dispose()
    else schedule(dispose, 400)
  }
  const skipAnimation = (): void => {
    animationDone = true
    // A slow Host still owns readiness. Keep the opaque scene until it mounts.
    scene.dataset.complete = 'true'
    status.style.visibility = 'visible'
    inspect()
  }
  const keyboard = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); skipAnimation() }
    if (event.key === 'Tab') { event.preventDefault(); skip.focus({ preventScroll: true }) }
  }
  const motionChanged = (): void => {
    scene.dataset.motion = reduced() ? 'reduced' : 'full'
    logo.src = reduced()
      ? `./assets/suiyi-launch/${document.body.hasAttribute('data-ds-dark-theme') ? 'mark-dark.svg' : 'mark.svg'}`
      : './assets/suiyi-launch/logo-motion.svg'
    if (reduced()) skipAnimation()
  }
  const themeObserver = new MutationObserver(() => {
    document.body.dataset.suiyiLaunchThemed = ''
    motionChanged()
  })
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'style'] })
  themeObserver.observe(root, { attributes: true, attributeFilter: ['data-dsh-reduce-motion'] })
  const observer = new MutationObserver(inspect)
  observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-dsh-boot'] })
  const language = navigator.language.startsWith('zh') ? 'zh' : 'en'
  skipLabel.textContent = copy[language].skip
  status.textContent = copy[language].waiting
  scene.dataset.motion = reduced() ? 'reduced' : 'full'
  if (reduced()) logo.src = './assets/suiyi-launch/mark.svg'
  container.inert = true
  document.addEventListener('keydown', keyboard, true)
  skip.addEventListener('click', skipAnimation)
  reduce.addEventListener('change', motionChanged)
  window.addEventListener('pagehide', dispose, { once: true })
  const fontReady = document.fonts.load('300 74px "Suiyi Slogan Serif"', '由意而行遂事而成')
    .catch((_fontError: unknown) => { /* A missing local font uses the declared serif fallback. */ })
  const deadline = new Promise<void>((resolve) => { schedule(resolve, 1200) })
  void Promise.race([fontReady, deadline]).then(() => {
    if (stopped) return
    frame = requestAnimationFrame(() => {
      if (stopped) return
      scene.classList.add('is-playing')
      const now = document.timeline.currentTime
      for (const animation of scene.getAnimations({ subtree: true })) {
        animation.play()
        if (typeof now === 'number') animation.startTime = now
      }
      skip.focus({ preventScroll: true })
      schedule(() => { animationDone = true; inspect() }, reduced() ? 850 : 3200)
    })
  })
  activeLaunch = dispose
  inspect()
  return dispose
}
