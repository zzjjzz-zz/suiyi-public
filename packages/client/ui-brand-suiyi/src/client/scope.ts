import type { Context as ClientContext } from '@deepseek-ai/cordis'

/** Body attribute that activates the Suiyi identity layer. */
export const BRAND_SCOPE_ATTRIBUTE = 'data-dsh-brand'

/** Value of {@link BRAND_SCOPE_ATTRIBUTE} in a Suiyi build. */
export const BRAND_SCOPE_VALUE = 'suiyi'

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
