import { scaleOrdinal } from "d3-scale";
import { categoricalPalette } from "~/utils/palette";

export default defineNuxtPlugin(nuxtApp => {
  nuxtApp.provide('color', scaleOrdinal(categoricalPalette));
})
