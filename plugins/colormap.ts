import {
  interpolateBlues,
  interpolateBrBG,
  interpolateBuGn,
  interpolateBuPu,
  interpolateCividis,
  interpolateCool,
  interpolateCubehelixDefault,
  interpolateGnBu,
  interpolateGreens,
  interpolateGreys,
  interpolateInferno,
  interpolateMagma,
  interpolateOrRd,
  interpolateOranges,
  interpolatePRGn,
  interpolatePiYG,
  interpolatePlasma,
  interpolatePuBu,
  interpolatePuBuGn,
  interpolatePuOr,
  interpolatePuRd,
  interpolatePurples,
  interpolateRainbow,
  interpolateRdBu,
  interpolateRdGy,
  interpolateRdPu,
  interpolateRdYlBu,
  interpolateRdYlGn,
  interpolateReds,
  interpolateSinebow,
  interpolateSpectral,
  interpolateTurbo,
  interpolateViridis,
  interpolateWarm,
  interpolateYlGn,
  interpolateYlGnBu,
  interpolateYlOrBr,
  interpolateYlOrRd,
} from "d3-scale-chromatic";

const color_map = {
  Blues: interpolateBlues,
  BrBG: interpolateBrBG,
  BuGn: interpolateBuGn,
  BuPu: interpolateBuPu,
  Cividis: interpolateCividis,
  Cool: interpolateCool,
  CubehelixDefault: interpolateCubehelixDefault,
  GnBu: interpolateGnBu,
  Greens: interpolateGreens,
  Greys: interpolateGreys,
  Inferno: interpolateInferno,
  Magma: interpolateMagma,
  OrRd: interpolateOrRd,
  Oranges: interpolateOranges,
  PRGn: interpolatePRGn,
  PiYG: interpolatePiYG,
  Plasma: interpolatePlasma,
  PuBu: interpolatePuBu,
  PuBuGn: interpolatePuBuGn,
  PuOr: interpolatePuOr,
  PuRd: interpolatePuRd,
  Purples: interpolatePurples,
  Rainbow: interpolateRainbow,
  RdBu: interpolateRdBu,
  RdGy: interpolateRdGy,
  RdPu: interpolateRdPu,
  RdYlBu: interpolateRdYlBu,
  RdYlGn: interpolateRdYlGn,
  Red: interpolateReds,
  Sinebow: interpolateSinebow,
  Spectral: interpolateSpectral,
  Turbo: interpolateTurbo,
  Viridis: interpolateViridis,
  Warm: interpolateWarm,
  YlGn: interpolateYlGn,
  YlGnBu: interpolateYlGnBu,
  YlOrBr: interpolateYlOrBr,
  YlOrRd: interpolateYlOrRd,
};

const GetColormapGradient = (name: string) => {
  const gradientFunction = color_map[name];
  if (!gradientFunction) {
    throw new Error(`Color map "${name}" not found.`);
  }
  const steps = 10;
  const stops = Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    return gradientFunction(t);
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
};

export default defineNuxtPlugin(() => {
  return {
    provide: {
      color_map,
      GetColormapGradient,
    },
  }
})
