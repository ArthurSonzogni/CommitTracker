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

// Matching dark-theme series colors from assets/css/theme.css (:root[data-theme="dark"]).
export const categoricalPaletteDark = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
];

export const seriesTokens = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

// Deterministic FNV-1a hash into [0, seriesTokens.length).
export const seriesIndex = (key: string): number => {
  const str = typeof key === "string" ? key : String(key ?? "");
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % seriesTokens.length;
};

export const seriesColor = (key: string): string => seriesTokens[seriesIndex(key)];

const SERIES_VAR_RE = /^var\(--series-(\d)\)$/;

const resolveBackgroundHex = (background: string): string => {
  if (typeof background !== "string") {
    return categoricalPalette[0];
  }
  const match = background.trim().match(SERIES_VAR_RE);
  if (match) {
    const idx = Math.max(0, Math.min(categoricalPalette.length - 1, Number(match[1]) - 1));
    const isDark = typeof document !== "undefined" && document.documentElement?.dataset.theme === "dark";
    return isDark ? categoricalPaletteDark[idx] : categoricalPalette[idx];
  }
  if (/^#[0-9a-fA-F]{3}$/.test(background)) {
    const [, r, g, b] = background;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return background;
};

// The text color, white or near black, with the most contrast on `background`
// (a #rrggbb color or a var(--series-N) token).
export const textColorOn = (background: string): string => {
  const hex = resolveBackgroundHex(background);
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return "white";
  }
  const channels = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  // Contrast with white is 1.05 / (L + 0.05), with #111 is (L + 0.05) / 0.056.
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.056 ? "white" : "#111";
};

export const tagChipStyle = (key: string): { backgroundColor: string; color: string } => {
  const backgroundColor = seriesColor(key);
  return {
    backgroundColor,
    color: textColorOn(backgroundColor),
  };
};
