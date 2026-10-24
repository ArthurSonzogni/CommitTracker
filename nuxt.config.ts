import fs from 'fs'
import path from 'path'
import { defineEventHandler, proxyRequest } from 'h3'

const isDev = process.env.NODE_ENV === 'development'

console.log('--- NUXT CONFIG LOADED ---')
console.log('NODE_ENV:', process.env.NODE_ENV)
console.log('isDev:', isDev)
console.log('Public dir:', isDev ? 'public_dev' : 'public')
console.log('--------------------------')

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  target: 'static',
  ssr: false,

  dir: {
    public: isDev ? 'public_dev' : 'public'
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
      // Apply the theme chosen with the navbar toggle, before rendering.
      script: [{
        innerHTML: "try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}",
      }],
    },
  },

  // Global page headers: https://go.nuxtjs.dev/config-head
  head: {
    title: 'chrome-commit-tracker',
    htmlAttrs: {
      lang: 'en'
    },
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { hid: 'description', name: 'description', content: '' },
      { name: 'format-detection', content: 'telephone=no' }
    ],
  },

  css: [
    'bulma/css/bulma.min.css',
    '@mdi/font/css/materialdesignicons.min.css',
    // Last, to override the above.
    '~/assets/css/theme.css',
  ],

  // Build Configuration: https://go.nuxtjs.dev/config-build
  build: {
    extend(config, { isClient }) {
      if (isClient) {
        config.externals = ['d3-transition']; // Exclude d3-transition from tree-shaking
      }
    }
  },

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
          '**/importer/**'
        ]
      }
    }
  },

  modules: [
    "@nuxtjs/sitemap",
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
        dir: 'public_dev'
      }
    ] : [],
    // Nitro's default dev storage watches the whole project recursively. Skip
    // the heavy data directories to avoid exhausting the inotify watchers.
    devStorage: isDev ? Object.fromEntries(['root', 'src'].map(mount => [mount, {
      driver: 'fs',
      readOnly: true,
      base: path.resolve(),
      ignore: ['**/node_modules/**', '**/.git/**', '**/public/**', '**/importer/**', '**/dist/**', '**/.output/**'],
    }])) : {},

    // Proxy requests for files in public/ to the data server. Matching on
    // file existence rather than prefix, because some pages share their name
    // with a data directory (e.g. /treemap, /cve/list).
    devHandlers: isDev ? [{
      route: '/',
      handler: defineEventHandler(event => {
        const pathname = decodeURIComponent(event.path.split('?')[0]);
        const file = path.join('public', pathname);
        if (fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
          return proxyRequest(event, `http://localhost:3001${event.path}`);
        }
      }),
    }] : []
  }
})

