// A short message at the bottom of the page, closing by itself. Hovering it
// keeps it open. Styled by .toast in assets/css/theme.css.

export const showToast = ({ message, type = "", duration = 5000 }: {
  // HTML.
  message: string;
  // is-warning, is-danger, ...
  type?: string;
  duration?: number;
}) => {
  let container = document.querySelector<HTMLElement>(".toasts");
  if (!container) {
    container = document.createElement("div");
    container.className = "toasts";
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = message;
  container.appendChild(toast);

  let timeout: ReturnType<typeof setTimeout>;
  const close = () => {
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 200);
  };
  const schedule = () => {
    timeout = setTimeout(close, duration);
  };
  toast.addEventListener("mouseenter", () => clearTimeout(timeout));
  toast.addEventListener("mouseleave", schedule);
  schedule();
};
