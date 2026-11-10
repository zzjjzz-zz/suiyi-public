/** Build-time Suiyi launch document and local artwork/font assets. */
import { readFile } from 'node:fs/promises'
import type { Plugin } from 'vite'

/**
 * Emit the launch scene only for the Suiyi product, before the JavaScript entry loads.
 * @returns Vite plugin owning the initial document and local launch assets.
 */
export function suiyiLaunchDocument(): Plugin {
  const enabled = process.env.DSH_CLIENT_BUILD_PROFILE === 'suiyi'
  return {
    name: 'suiyi-launch-document',
    async transformIndexHtml(html, context) {
      if (!enabled) return html
      const [css, scene] = await Promise.all(['suiyi-launch.css', 'suiyi-launch.html'].map(name =>
        readFile(new URL(`./launch/${name}`, import.meta.url), 'utf8')))
      const entry = Object.values(context.bundle ?? {}).find(item => item.type === 'chunk' && item.name === 'suiyi-launch')
      if (entry === undefined) throw new Error('Suiyi launch entry is missing from the build')
      return html.replace('<html ', '<html data-suiyi-launch="" ')
        .replace(/href="(?:\/|\.\/)favicon\.svg"/, 'href="./assets/suiyi-launch/mark.svg"')
        .replace(/href="(?:\/|\.\/)favicon-dark\.svg"/, 'href="./assets/suiyi-launch/mark-dark.svg"')
        .replace(/href="(?:\/|\.\/)apple-touch-icon\.png"/, 'href="./assets/suiyi-launch/icon-192.png"')
        .replace(/href="(?:\/|\.\/)manifest\.webmanifest"/, 'href="./assets/suiyi-launch/manifest.webmanifest"')
        .replace('name="apple-mobile-web-app-title" content="DSH"', 'name="apple-mobile-web-app-title" content="遂意"')
        .replace('</head>', `<style>${css}</style><script type="module" async src="./${entry.fileName}"></script></head>`)
        .replace('<div id="root"></div>', `${scene}<div id="root" inert></div>`)
    },
    async generateBundle() {
      if (!enabled) return
      for (const name of ['logo-motion.svg', 'mark.svg', 'mark-dark.svg', 'icon-192.png', 'icon-512.png', 'noto-serif-sc-slogan-light.woff2', 'OFL-NotoSerifSC.txt']) {
        this.emitFile({ type: 'asset', fileName: `assets/suiyi-launch/${name}`,
          source: await readFile(new URL(`./launch/${name}`, import.meta.url)) })
      }
      this.emitFile({ type: 'asset', fileName: 'assets/suiyi-launch/manifest.webmanifest', source: JSON.stringify({
        name: '遂意', short_name: '遂意', start_url: '../../', scope: '../../', display: 'standalone',
        background_color: '#f0f8ff', theme_color: '#f0f8ff',
        icons: [192, 512].map(size => ({ src: `icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })),
      }) })
    },
  }
}
