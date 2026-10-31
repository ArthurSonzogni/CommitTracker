import fs from 'fs'
import path from 'path'
import { defineEventHandler, sendStream, setResponseHeader, setResponseStatus } from 'h3'

const isDev = process.env.NODE_ENV === 'development'
const publicRoot = path.resolve('public')

const DEV_CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  ssr: false,

  dir: {
    public: isDev ? 'public_dev' : 'public',
  },

  // Avoid watching the heavy data directories in dev. Patterns without a
  // trailing slash, as Nuxt's watcher tests directory paths without one.
  ignore: isDev ? ['public', 'importer', 'dist', '.output'] : [],

  site: {
    url: 'https://chrome-commit-tracker.arthursonzogni.com',
  },

  // Crossfade between pages. Skipped when the user prefers reduced motion.
  app: {
    viewTransition: true,
    head: {
      htmlAttrs: {
        lang: 'en',
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'format-detection', content: 'telephone=no' },
      ],
      // Resolve initial theme before first paint and track system changes unless overridden.
      script: [{
        innerHTML: "try{var d=document.documentElement,t=localStorage.getItem('theme'),m=matchMedia('(prefers-color-scheme: dark)');d.dataset.theme=t||(m.matches?'dark':'light');m.addEventListener('change',function(e){if(!localStorage.getItem('theme'))d.dataset.theme=e.matches?'dark':'light'})}catch(e){}",
      }],
    },
  },

  css: [
    '~/assets/css/base.css',
    '@mdi/font/css/materialdesignicons.min.css',
    // Last, to override the above.
    '~/assets/css/theme.css',
  ],

  vite: {
    server: {
      watch: {
        ignored: [
          '**/public/data/**',
          '**/public/commit_rates/**',
          '**/public/treemap/**',
          '**/public/community-map/**',
          '**/public/fuzz-test/**',
          '**/public/cve/**',
          '**/public/accretion/**',
          '**/importer/**',
        ],
      },
    },
  },

  modules: [
    '@nuxtjs/sitemap',
  ],

  nitro: {
    // This scan pushes every public file path with `push(...paths)`, which
    // overflows the call stack with the ~150k files in public/.
    prerender: {
      ignoreUnprefixedPublicAssets: false,
    },
    noPublicDir: isDev,
    publicAssets: isDev ? [
      {
        dir: 'public_dev',
      },
    ] : [],
    // Nitro's default dev storage watches the whole project recursively. Skip
    // the heavy data directories to avoid exhausting the inotify watchers.
    devStorage: isDev ? Object.fromEntries(['root', 'src'].map(mount => [mount, {
      driver: 'fs',
      readOnly: true,
      base: path.resolve(),
      ignore: ['**/node_modules/**', '**/.git/**', '**/public/**', '**/importer/**', '**/dist/**', '**/.output/**'],
    }])) : {},

    // Serve files from public/ directly in dev. Matching on file existence
    // rather than prefix, because some pages share their name with a data
    // directory (e.g. /treemap, /cve/list).
    devHandlers: isDev ? [{
      route: '/',
      handler: defineEventHandler(event => {
        let pathname: string
        try {
          pathname = decodeURIComponent(event.path.split('?')[0])
        } catch {
          setResponseStatus(event, 400)
          return 'Bad Request'
        }

        const file = path.resolve(publicRoot, '.' + (pathname.startsWith('/') ? pathname : '/' + pathname))
        if (file === publicRoot) {
          return
        }
        if (!file.startsWith(publicRoot + path.sep)) {
          setResponseStatus(event, 403)
          return 'Forbidden'
        }

        if (fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
          const ext = path.extname(file).toLowerCase()
          setResponseHeader(event, 'Content-Type', DEV_CONTENT_TYPES[ext] || 'application/octet-stream')
          setResponseHeader(event, 'Cache-Control', 'no-cache')
          return sendStream(event, fs.createReadStream(file))
        }
      }),
    }] : [],
  },
})
