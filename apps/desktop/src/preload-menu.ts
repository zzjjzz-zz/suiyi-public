/** Windows caption menu labels and native popup anchors, isolated from the Web client. */
import { ipcRenderer } from 'electron'
import { DESKTOP_IPC } from './ipc.ts'
import { resolveDesktopLocale } from './locale.ts'

/**
 * Mount the Windows caption menubar without moving focus out of the active editor.
 * @returns Language refresh and document teardown operations.
 */
export function installWindowsMenu(): { update(): void; dispose(): void } {
  const host = document.createElement('div')
  host.dataset.windowsMenu = ''
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = `
    :host { position: fixed; top: 0; left: var(--dsh-windows-menu-start, 48px); z-index: 1100;
      height: var(--dsh-windows-titlebar-height); display: flex; align-items: center;
      font-family: var(--dsw-font-family); -webkit-app-region: no-drag; }
    :host([data-brand='suiyi']) { position: static; height: 28px; }
    [role=menubar] { display: flex; gap: 2px; }
    button { height: 28px; padding: 0 10px; border: 0; border-radius: 6px;
      background: transparent; color: var(--dsw-alias-label-secondary);
      font: inherit; font-size: 14px; cursor: default; }
    button:hover, button[aria-expanded=true] { background: var(--dsw-alias-interactive-bg-hover);
      color: var(--dsw-alias-label-primary); }
    button:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
    :host-context(html[data-input-modality='pointer']) button:focus-visible { outline-color: transparent; }
    :host([data-brand='suiyi']) button { width: 32px; padding: 0; font-size: 16px; }
    :host([data-brand='suiyi']) button svg { width: 16px; height: 16px; }
    :host([data-brand='suiyi']) button[hidden] { display: none; }
  `
  const bar = document.createElement('div')
  bar.setAttribute('role', 'menubar')
  let restoreEditor = (): void => {}
  const rememberEditor = (event: FocusEvent): void => {
    const target = event.composedPath()[0]
    if (!(target instanceof HTMLElement) || target === host || shadow.contains(target)) return
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)
      && !target.matches('[contenteditable="true"]')) return
    const selection = document.getSelection()
    const ranges = selection === null ? [] : Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange())
    const input = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : undefined
    const start = input?.selectionStart
    const end = input?.selectionEnd
    const direction = input?.selectionDirection
    restoreEditor = () => {
      if (!target.isConnected) return
      target.focus({ preventScroll: true })
      if (input !== undefined && start != null && end != null) input.setSelectionRange(start, end, direction ?? undefined)
      else if (selection !== null && ranges.length > 0) {
        selection.removeAllRanges()
        for (const range of ranges) selection.addRange(range)
      }
    }
  }
  document.addEventListener('focusout', rememberEditor, true)
  const createButton = (name: 'application' | 'edit', index: 0 | 1): HTMLButtonElement => {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'menuitem')
    button.setAttribute('aria-haspopup', 'menu')
    button.setAttribute('aria-expanded', 'false')
    button.tabIndex = index === 0 ? 0 : -1
    button.addEventListener('pointerdown', (event) => { event.preventDefault() })
    button.addEventListener('mousedown', (event) => { event.preventDefault() })
    const open = async (): Promise<void> => {
      if (button.getAttribute('aria-expanded') === 'true') return
      const rect = button.getBoundingClientRect()
      button.setAttribute('aria-expanded', 'true')
      if (document.activeElement === host) restoreEditor()
      try { await ipcRenderer.invoke(DESKTOP_IPC.windowsMenu, name, rect.left, rect.bottom) }
      catch (error) { console.error('Desktop caption menu failed', error) }
      finally { button.setAttribute('aria-expanded', 'false') }
    }
    button.addEventListener('click', () => { void open() })
    button.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const visible = buttons.filter(candidate => !candidate.hidden)
        if (visible.length < 2) return
        const current = visible.indexOf(button)
        const offset = event.key === 'ArrowRight' ? 1 : -1
        const next = visible[(current + offset + visible.length) % visible.length]
        if (next === undefined) return
        button.tabIndex = -1
        next.tabIndex = 0
        next.focus()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        void open()
      }
    })
    bar.append(button)
    return button
  }
  const buttons = [createButton('application', 0), createButton('edit', 1)] as const
  shadow.append(style, bar)
  const update = (): void => {
    const suiyi = document.body.dataset.dshBrand === 'suiyi'
    host.dataset.brand = suiyi ? 'suiyi' : 'official'
    const { messages } = resolveDesktopLocale(document.documentElement.lang)
    bar.setAttribute('aria-label', messages.menuBar)
    // Same three-dot geometry as ui-primitives' ellipsis-outline icon.
    if (suiyi) {
      buttons[0].innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 9C3.55228 9 4 8.55228 4 8C4 7.44772 3.55228 7 3 7C2.44772 7 2 7.44772 2 8C2 8.55228 2.44772 9 3 9Z" fill="currentColor"></path><path d="M8 9C8.55228 9 9 8.55228 9 8C9 7.44772 8.55228 7 8 7C7.44772 7 7 7.44772 7 8C7 8.55228 7.44772 9 8 9Z" fill="currentColor"></path><path d="M13 9C13.5523 9 14 8.55228 14 8C14 7.44772 13.5523 7 13 7C12.4477 7 12 7.44772 12 8C12 8.55228 12.4477 9 13 9Z" fill="currentColor"></path></svg>'
      buttons[0].setAttribute('aria-label', messages.menuBar)
      buttons[0].title = messages.menuBar
    } else {
      buttons[0].textContent = messages.application
      buttons[0].removeAttribute('aria-label')
      buttons[0].removeAttribute('title')
    }
    buttons[1].textContent = messages.edit
    if (suiyi) {
      buttons[0].tabIndex = 0
      buttons[1].tabIndex = -1
      if (shadow.activeElement === buttons[1]) buttons[0].focus()
    }
    buttons[1].hidden = suiyi
  }
  const mount = (): void => {
    // AppFrame owns the overlay marker; the Suiyi topbar supplies the inline menu seat.
    if (document.querySelector('[data-shell-overlay]') === null) return
    const suiyi = document.body.dataset.dshBrand === 'suiyi'
    const seat = suiyi ? document.querySelector('[data-windows-suiyi-menu]') : null
    if (suiyi && seat === null) {
      // A brand can land after the first official mount. Rearm the child-list
      // observer until the topbar's real seat exists, then stop it below.
      observer.observe(document.body, { childList: true, subtree: true })
      return
    }
    const focusedButton = buttons.find(button => button === shadow.activeElement)
    ;(seat ?? document.body).append(host)
    update()
    if (focusedButton !== undefined) (focusedButton.hidden ? buttons[0] : focusedButton).focus()
    observer.disconnect()
  }
  const observer = new MutationObserver(mount)
  const brandObserver = new MutationObserver(mount)
  observer.observe(document.body, { childList: true, subtree: true })
  brandObserver.observe(document.body, { attributes: true, attributeFilter: ['data-dsh-brand'] })
  mount()
  return {
    update,
    dispose: () => {
      observer.disconnect()
      brandObserver.disconnect()
      document.removeEventListener('focusout', rememberEditor, true)
      host.remove()
    },
  }
}
