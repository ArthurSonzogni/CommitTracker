import { seriesColor } from "~/utils/palette";

export default defineNuxtPlugin(() => ({
  provide: {
    color: seriesColor,
  },
}));
