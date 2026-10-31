import { seriesColor } from "~/utils/palette";

export default defineNuxtPlugin(nuxtApp => {
  nuxtApp.provide("color", seriesColor);
});
