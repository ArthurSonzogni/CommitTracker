import { onBeforeUnmount, ref, type Ref } from "vue";
import { showToast } from "~/utils/toast";

export interface UseShareLinkOptions {
  url?: () => string;
  title?: () => string;
  duration?: number;
  errorMessage?: string;
}

export interface ShareOverride {
  url?: string;
  title?: string;
}

export function useShareLink(options: UseShareLinkOptions = {}): {
  copied: Ref<boolean>;
  share: (override?: ShareOverride) => Promise<void>;
} {
  const copied = ref(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  onBeforeUnmount(() => {
    clearTimeout(copiedTimer);
  });

  const share = async (override?: ShareOverride) => {
    if (typeof window === "undefined") return;

    const url = override?.url ?? options.url?.() ?? window.location.href;
    const title = override?.title ?? options.title?.() ?? document.title;

    if (navigator.share && window.matchMedia?.("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title, url });
      } catch {}
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      copied.value = true;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        copied.value = false;
      }, options.duration ?? 1600);
    } catch {
      showToast({
        message: options.errorMessage ?? "Could not copy the link",
        type: "is-danger",
      });
    }
  };

  return { copied, share };
}
