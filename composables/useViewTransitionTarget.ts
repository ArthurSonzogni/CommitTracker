// Tracks the active element for shared-element CSS view transitions so that
// only a single DOM node carries a given `view-transition-name` at snapshot time,
// and returning via Back morphs back to the exact origin slot.
export function useViewTransitionTarget() {
  const activeBadge = useState<string>("vt-badge", () => "");

  return { activeBadge };
}
