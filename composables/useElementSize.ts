import { onBeforeUnmount, ref, watch, type Ref } from "vue";

export function useElementSize(
  targetRef: Ref<HTMLElement | SVGElement | null | undefined>,
  initialSize: { width?: number; height?: number } = {},
): { width: Ref<number>; height: Ref<number> } {
  const width = ref(initialSize.width ?? 0);
  const height = ref(initialSize.height ?? 0);

  let observer: ResizeObserver | null = null;

  const disconnect = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };

  const measureElement = (el: HTMLElement | SVGElement) => {
    const rect = el.getBoundingClientRect();
    const nextWidth = Math.round(el.clientWidth || rect.width || 0);
    const nextHeight = Math.round(el.clientHeight || rect.height || 0);
    if (width.value !== nextWidth) width.value = nextWidth;
    if (height.value !== nextHeight) height.value = nextHeight;
  };

  const stopWatch = watch(
    targetRef,
    (el) => {
      disconnect();
      if (!el || typeof window === "undefined") return;

      measureElement(el);

      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          const nextWidth = Math.round(entry.contentRect.width);
          const nextHeight = Math.round(entry.contentRect.height);
          if (width.value !== nextWidth) width.value = nextWidth;
          if (height.value !== nextHeight) height.value = nextHeight;
        });
        observer.observe(el);
      }
    },
    { immediate: true, flush: "post" },
  );

  onBeforeUnmount(() => {
    stopWatch();
    disconnect();
  });

  return { width, height };
}
