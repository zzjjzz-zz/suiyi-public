/**
 * Every live isolated renderer, so one settings change can tear all of them down.
 *
 * `GenUISurface` already disposes its own frame on unmount. This registry covers
 * the cases unmount does not: the switch is turned off while cards stay mounted,
 * the account generation is replaced, or the page is unloading.
 */
const disposers = new Set<() => void>();

/**
 * Track one renderer.
 * @param dispose - idempotent teardown owned by the renderer.
 * @returns unregister callback, called by the renderer's own teardown.
 */
export function registerVisualInstance(dispose: () => void): () => void {
  disposers.add(dispose);
  return () => {
    disposers.delete(dispose);
  };
}

/** Dispose every live renderer. Safe to call repeatedly. */
export function disposeVisualInstances(): void {
  for (const dispose of [...disposers]) {
    try {
      dispose();
    } catch {
      // One broken frame must not keep the rest of the page alive.
    }
  }
  disposers.clear();
}
