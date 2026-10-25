// Popovers tethered with CSS anchor positioning render in the top layer, so
// that no ancestor clips them. Browsers without anchor positioning keep the
// popups positioned in place.
export const anchorSupported = () =>
  typeof CSS !== "undefined" && CSS.supports("anchor-name: --a");

let count = 0;
export const uniqueAnchorName = () => `--anchor-${count++}`;
