// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  target: 'static',
  ssr: false,

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

  modules: [
    "@nuxtjs/sitemap",
  ]
})
