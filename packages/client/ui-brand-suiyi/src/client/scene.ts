import type { Context as ClientContext } from '@deepseek-ai/cordis'

/** Body attribute that activates the Suiyi identity layer. */
export const BRAND_SCOPE_ATTRIBUTE = 'data-dsh-brand'

/** Value of {@link BRAND_SCOPE_ATTRIBUTE} in a Suiyi build. */
export const BRAND_SCOPE_VALUE = 'suiyi'

/** Marks the decorative ambient container the stylesheet paints. */
const SCENE_CLASS = 'dsh-suiyi-scene'

/**
 * Mark the document body as a Suiyi build for exactly this plugin's lifetime.
 * The brand-scoped stylesheet selects on this attribute, so an official build
 * that also loads the bundle keeps its own identity and the previous attribute
 * value returns on teardown.
 * @param ctx - owning client context; the attribute is released with its fiber.
 */
export function installBrandScope(ctx: ClientContext): void {
  ctx.effect(() => {
    const body = document.body
    const previous = body.getAttribute(BRAND_SCOPE_ATTRIBUTE)
    body.setAttribute(BRAND_SCOPE_ATTRIBUTE, BRAND_SCOPE_VALUE)
    return () => {
      if (previous === null) body.removeAttribute(BRAND_SCOPE_ATTRIBUTE)
      else body.setAttribute(BRAND_SCOPE_ATTRIBUTE, previous)
    }
  }, 'ui-brand-suiyi: brand scope attribute')
}

/**
 * Build the ambient layer stack: one halo cloud, two tilted ribbon rings, and
 * the veil. The stylesheet carries the prototype's geometry, blur radii, and
 * drift curves; this builder only supplies the element structure.
 * @returns the decorative, aria-hidden scene container.
 */
function createScene(): HTMLElement {
  const scene = document.createElement('div')
  scene.className = SCENE_CLASS
  scene.setAttribute('aria-hidden', 'true')

  const field = document.createElement('div')
  field.className = 'dsh-suiyi-scene-field'
  const cloud = document.createElement('div')
  cloud.className = 'dsh-suiyi-halo-cloud'
  const ribbon = document.createElement('div')
  ribbon.className = 'dsh-suiyi-halo-ribbon'
  const far = document.createElement('div')
  far.className = 'dsh-suiyi-halo-ribbon dsh-suiyi-halo-ribbon-far'
  field.append(cloud, ribbon, far)

  const veil = document.createElement('div')
  veil.className = 'dsh-suiyi-halo-veil'
  scene.append(field, veil)
  return scene
}

/**
 * Paint the Suiyi ambient scene behind the application for exactly this
 * plugin's lifetime. The container sits first in `body` at `z-index: -1`
 * inside the body stacking context, so it covers the window without covering
 * any application or portalled overlay content, and teardown removes it.
 * @param ctx - owning client context; the scene is released with its fiber.
 */
export function installBrandScene(ctx: ClientContext): void {
  ctx.effect(() => {
    const scene = createScene()
    document.body.insertBefore(scene, document.body.firstChild)
    return () => { scene.remove() }
  }, 'ui-brand-suiyi: ambient scene')
}
