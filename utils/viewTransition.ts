// Runs an in-page DOM update inside `document.startViewTransition` with
// `data-vt="in-page"` so page-to-page slide/drill animations don't fire on
// in-page state changes (reordering rows, fullscreen, swapping badges, etc.).
export function runInPageTransition(
  update: () => void | Promise<void>,
  onFinished?: () => void,
): void {
  const doc = typeof document !== "undefined"
    ? (document as Document & {
        startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> };
      })
    : null;
  const reduceMotion = typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!doc?.startViewTransition || reduceMotion) {
    Promise.resolve(update()).finally(() => onFinished?.());
    return;
  }

  const root = document.documentElement;
  root.dataset.vt = "in-page";
  const vt = doc.startViewTransition(async () => {
    await update();
  });
  vt.finished.finally(() => {
    if (root.dataset.vt === "in-page") {
      delete root.dataset.vt;
    }
    onFinished?.();
  });
}
