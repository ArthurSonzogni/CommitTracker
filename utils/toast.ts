// A short message at the bottom of the page, closing by itself. Hovering it
// keeps it open. Styled by .toast in assets/css/theme.css.

export const showToast = ({ message, type = "", duration = 5000 }: {
  message: string;
  // is-warning, is-danger, ...
  type?: string;
  duration?: number;
}) => {
  if (typeof document === "undefined") return;

  let container = document.querySelector<HTMLElement>(".toasts");
  if (!container) {
    container = document.createElement("div");
    container.className = "toasts";
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = type ? `toast ${type}` : "toast";
  toast.textContent = message;
  container.appendChild(toast);

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    clearTimeout(timeout);
    if (toast.classList.contains("is-leaving")) return;
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 200);
  };
  const schedule = () => {
    clearTimeout(timeout);
    timeout = setTimeout(close, duration);
  };
  toast.addEventListener("mouseenter", () => clearTimeout(timeout));
  toast.addEventListener("mouseleave", () => {
    if (!toast.classList.contains("is-leaving")) {
      schedule();
    }
  });
  schedule();
};
