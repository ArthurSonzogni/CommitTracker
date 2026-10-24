// Categorical palette for charts. The order is part of the design: adjacent
// slots stay distinguishable under color vision deficiencies. Validated on a
// white surface (dataviz skill, validate_palette.js).
export const categoricalPalette = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#6250d6", // violet
  "#e34948", // red
];

// The text color, white or near black, with the most contrast on `background`
// (a #rrggbb color).
export const textColorOn = (background: string) => {
  const channels = [1, 3, 5]
    .map(i => parseInt(background.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  // Contrast with white is 1.05 / (L + 0.05), with #111 is (L + 0.05) / 0.056.
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.056 ? "white" : "#111";
};
