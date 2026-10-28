// The intensity, from 0 to 1, to paint the share of a directory a developer
// authored. Logarithmic: most developers write less than 1% of a directory.
// 0.01% is barely visible, 0.1% is medium, 1% is strong, and 10% or more is
// full, for the larger shares to stand out too.
export const shareIntensity = (share: number) => {
  if (!(share > 0)) return 0;
  const decades = Math.log10(share) + 4; // 0 at 0.01%, 2 at 1%, 3 at 10%.
  const intensity = decades <= 2 ? decades * 0.4 : 0.8 + (decades - 2) * 0.2;
  return Math.max(0, Math.min(1, intensity));
};
