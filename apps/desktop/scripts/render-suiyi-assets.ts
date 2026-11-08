/** Render committed Suiyi desktop icons from its independent SVG artwork. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import sharp from 'sharp'
import { packIco, renderTrayIconEntries } from './render-tray-icon.ts'

const directory = fileURLToPath(new URL('../resources/suiyi/', import.meta.url))
await mkdir(directory, { recursive: true })
const source = await readFile(join(directory, 'icon.svg'))
const image = await sharp(source).resize(1024, 1024).png().toBuffer()
for (const name of ['icon-windows.png', 'icon-macos.png']) await writeFile(join(directory, name), image)
await writeFile(join(directory, 'tray-windows.ico'), packIco(await renderTrayIconEntries(source)))
