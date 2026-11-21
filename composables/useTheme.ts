import { showToast } from "~/utils/toast";

// Shared light/dark theme state across Navbar, CommandPalette, and keyboard
// shortcuts. The initial attribute on <html> is set early by nuxt.config.ts.
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

  const toggleTheme = (announce = false) => {
    if (typeof document === "undefined") return;
    if (!initialized.value) syncFromDom();
    dark.value = !dark.value;
    const theme = dark.value ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {}
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
