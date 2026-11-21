import { showToast } from "~/utils/toast";

// Shared light/dark theme state across Navbar and CommandPalette.
// Supports a circular view-transition reveal from the toggle button's position.
export function useTheme() {
  const dark = useState<boolean>("site-theme-dark", () => false);
  const initialized = useState<boolean>("site-theme-init", () => false);

  const syncFromDom = () => {
    if (typeof document === "undefined") return;
    const theme = document.documentElement.dataset.theme;
    dark.value = theme
      ? theme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    initialized.value = true;
  };

  if (typeof document !== "undefined" && !initialized.value) {
    syncFromDom();
  }

  const toggleTheme = (announce = false, origin?: { x: number; y: number }) => {
    if (typeof document === "undefined") return;
    if (!initialized.value) syncFromDom();

    const apply = () => {
      dark.value = !dark.value;
      const theme = dark.value ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
      try {
        localStorage.setItem("theme", theme);
      } catch {}
    };

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };

    if (doc.startViewTransition && !reduceMotion && origin) {
      const root = document.documentElement;
      const maxX = Math.max(origin.x, window.innerWidth - origin.x);
      const maxY = Math.max(origin.y, window.innerHeight - origin.y);
      const radius = Math.hypot(maxX, maxY);

      root.style.setProperty("--theme-x", `${origin.x}px`);
      root.style.setProperty("--theme-y", `${origin.y}px`);
      root.style.setProperty("--theme-r", `${radius}px`);
      root.dataset.vt = "theme-reveal";

      const vt = doc.startViewTransition(apply);
      vt.finished.finally(() => {
        if (root.dataset.vt === "theme-reveal") {
          delete root.dataset.vt;
        }
      });
    } else {
      apply();
    }

    if (announce) {
      showToast({
        message: dark.value ? "Dark theme" : "Light theme",
        type: "is-compact",
        duration: 1500,
      });
    }
  };

  return { dark, syncFromDom, toggleTheme };
}
