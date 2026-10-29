// The intensity, from 0 to 1, to paint the share of a directory a developer
// authored: x => pow(x, 0.3), spreading small shares while preserving contrast
// between 1%, 10%, 50%, and 100%.
export const shareIntensity = (share: number) => {
  if (!(share > 0)) return 0;
  return Math.min(1, Math.max(0, share) ** 0.3);
};
