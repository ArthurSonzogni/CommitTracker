import Buefy from '@ntohq/buefy-next'
import '@ntohq/buefy-next/dist/buefy.css'

export default defineNuxtPlugin((nuxtApp) => {
    nuxtApp.vueApp.use(Buefy, {})
})
