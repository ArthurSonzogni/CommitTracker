// Production builds only: replace the Material Design Icons stylesheet (7000+
// icons, ~0.4MB font + ~0.3MB CSS) by a subset containing only the icons the
// website may use.
//
// Icon names are not listed by hand: every string token of the sources (and of
// Buefy, which uses icons internally) matching an icon name is kept. False
// positives (e.g. "table", "home") only cost a few bytes.

import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { defineNuxtModule } from '@nuxt/kit'

const MDI_CSS = '@mdi/font/css/materialdesignicons.min.css'
const ICON_RULE_RE = /\.mdi-([a-z0-9-]+)::before\{content:"\\([0-9A-F]+)"\}/g
const TOKEN_RE = /[a-z0-9]+(?:-[a-z0-9]+)*/g
const SOURCE_DIRS = ['app.vue', 'components', 'composables', 'layouts', 'pages', 'plugins']

const listFiles = (entry: string): string[] => {
  if (!fs.existsSync(entry)) {
    return []
  }
  if (!fs.statSync(entry).isDirectory()) {
    return [entry]
  }
  return fs.readdirSync(entry).flatMap(name => listFiles(path.join(entry, name)))
}

export default defineNuxtModule({
  meta: { name: 'mdi-subset' },
  async setup(_options, nuxt) {
    if (nuxt.options.dev) {
      return
    }

    const require = createRequire(import.meta.url)
    const cssFile = require.resolve(MDI_CSS)
    const fontFile = path.join(path.dirname(cssFile), '../fonts/materialdesignicons-webfont.woff2')
    const css = fs.readFileSync(cssFile, 'utf8')

    const glyphs = new Map<string, string>()
    for (const [, name, codepoint] of css.matchAll(ICON_RULE_RE)) {
      glyphs.set(name, codepoint)
    }

    // Collect the icon names used by the sources and by Buefy.
    const files = [
      ...SOURCE_DIRS.flatMap(entry => listFiles(path.join(nuxt.options.rootDir, entry))),
      require.resolve('@ntohq/buefy-next/dist/buefy.esm.js'),
    ]
    const used = new Set<string>()
    for (const file of files) {
      for (const [token] of fs.readFileSync(file, 'utf8').matchAll(TOKEN_RE)) {
        const name = token.replace(/^mdi-/, '')
        if (glyphs.has(name)) {
          used.add(name)
        }
      }
    }

    // Keep every rule but the per-icon ones, then add the used icons.
    const base = css
      .replace(ICON_RULE_RE, '')
      .replace(/@font-face\{[^}]*\}/, '')
    const rules = [...used].sort()
      .map(name => `.mdi-${name}::before{content:"\\${glyphs.get(name)}"}`)
      .join('')

    const subsetFont = require('subset-font')
    const text = [...used].map(name => String.fromCodePoint(parseInt(glyphs.get(name)!, 16))).join('')
    const font = await subsetFont(fs.readFileSync(fontFile), text, { targetFormat: 'woff2' })

    // Not in buildDir, which Nuxt empties after the modules setup.
    const outDir = path.join(nuxt.options.rootDir, 'node_modules/.cache/mdi-subset')
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'mdi.woff2'), font)
    fs.writeFileSync(path.join(outDir, 'mdi.css'),
      '@font-face{font-family:"Material Design Icons";src:url("./mdi.woff2") format("woff2");' +
      'font-weight:normal;font-style:normal;font-display:block}' + base + rules)

    nuxt.options.css = nuxt.options.css.map(entry =>
      entry === MDI_CSS ? path.join(outDir, 'mdi.css') : entry)

    console.log(`[mdi-subset] ${used.size} of ${glyphs.size} icons, font ${(font.length / 1024).toFixed(1)}kB`)
  },
})
