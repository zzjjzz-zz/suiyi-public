/** Small asynchronous launch entry; independent of plugin and application bundles. */
import { installSuiyiLaunch } from './suiyi-launch.ts'

const observer = new MutationObserver(mount)
function mount(): void {
  const container = document.getElementById('root')
  if (container === null) return
  observer.disconnect()
  window.removeEventListener('pagehide', stop)
  installSuiyiLaunch(container)
}
function stop(): void { observer.disconnect() }
observer.observe(document, { childList: true, subtree: true })
window.addEventListener('pagehide', stop, { once: true })
mount()
