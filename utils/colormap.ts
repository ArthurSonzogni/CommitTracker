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

export type ColormapFn = (t: number) => string;

export const color_map: Record<string, ColormapFn> = {
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

export const colormapNames = Object.keys(color_map);

export const getColormap = (name: string): ColormapFn =>
  color_map[name] ?? color_map.Oranges;

export const GetColormapGradient = (name: string, steps = 10): string => {
  const gradientFunction = getColormap(name);
  const count = Math.max(2, steps);
  const stops = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return gradientFunction(t);
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
};
