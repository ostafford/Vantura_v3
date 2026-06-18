import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const svgPath = resolve(root, 'public/images/logo-icon-bg.svg')
const svgContent = readFileSync(svgPath, 'utf-8')

const sizes = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'pwa-192.png', size: 192 },
  { name: 'pwa-512.png', size: 512 },
]

mkdirSync(resolve(root, 'public/images'), { recursive: true })

for (const { name, size } of sizes) {
  const resvg = new Resvg(svgContent, {
    fitTo: { mode: 'width', value: size },
    background: '#1a142d',
  })
  const png = resvg.render().asPng()
  const outPath = resolve(root, 'public/images', name)
  writeFileSync(outPath, png)
  console.log(`Generated ${name} (${size}×${size})`)
}
