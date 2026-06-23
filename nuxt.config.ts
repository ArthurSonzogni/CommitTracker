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

  site: {
    url: 'https://chrome-commit-tracker.arthursonzogni.com',
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
    '@mdi/font/css/materialdesignicons.min.css'
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
    noPublicDir: isDev,
    publicAssets: isDev ? [
      {
        dir: 'public_dev'
      }
    ] : [],
    devProxy: isDev ? {
      '/data/': { target: 'http://localhost:3001/data/', changeOrigin: true },
      '/commit_rates/': { target: 'http://localhost:3001/commit_rates/', changeOrigin: true },
      '/treemap/': { target: 'http://localhost:3001/treemap/', changeOrigin: true },
      '/community-map/': { target: 'http://localhost:3001/community-map/', changeOrigin: true },
      '/fuzz-test/': { target: 'http://localhost:3001/fuzz-test/', changeOrigin: true },
      '/cve/': { target: 'http://localhost:3001/cve/', changeOrigin: true },
      '/badges/': { target: 'http://localhost:3001/badges/', changeOrigin: true },
      '/badges.json': { target: 'http://localhost:3001/badges.json', changeOrigin: true },
    } : {}
  }
})

