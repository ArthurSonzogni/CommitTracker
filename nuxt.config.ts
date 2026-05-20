// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  ssr: false,

  site: {
    url: 'https://chrome-commit-tracker.arthursonzogni.com',
  },

  app: {
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
  },

  css: [
    '@mdi/font/css/materialdesignicons.min.css'
  ],

  // Build Configuration: https://go.nuxtjs.dev/config-build
  build: {
    transpile: [
      'd3-transition',
    ],
  },

  modules: [
    "@nuxtjs/sitemap",
  ],

  nitro: {
    // We ignore the large data directories to avoid "Maximum call stack size exceeded"
    // during Nitro's recursive asset scanning.
    // These files should be copied manually or served via a different mechanism
    // if they are needed in the final build.
    ignore: [
      '**/data/**',
      '**/commit_rates/**',
      '**/treemap/**',
      '**/community-map/**',
      '**/fuzz-test/**',
      '**/cve/**'
    ],
  }
})
