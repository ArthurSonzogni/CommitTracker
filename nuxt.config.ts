// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },

  // Target: https://go.nuxtjs.dev/config-target
  target: 'static',
  ssr: false,

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


  //// Global CSS: https://go.nuxtjs.dev/config-css
  //// Plugins to run before rendering page: https://go.nuxtjs.dev/config-plugins
  ////plugins: [
    ////"~/plugins/chromeData.mjs",
    ////"~/plugins/color.mjs",
    ////"~/plugins/colormap.mjs",
    ////"~/plugins/usernames_summary.mjs",
  ////],

  ////panzoom: {
    ////addControls: true, // Add PanzoomControls component
  ////},

  //// Build Configuration: https://go.nuxtjs.dev/config-build
  //build: {
    //standalone: true
  //},

  ////app: {
    ////pageTransition: { name: 'index', mode: 'out-in' }
  ////},
})
