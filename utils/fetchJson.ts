// Lightweight JSON fetch helper with response validation, optional LRU caching,
// and AbortError detection so pages can surface errors cleanly instead of
// hanging on silent failures.

export interface FetchJsonOptions {
  signal?: AbortSignal;
  cache?: boolean;
}

const MAX_CACHE_SIZE = 48;
const jsonCache = new Map<string, Promise<unknown>>();

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}

export function formatFetchError(error: unknown, fallback = "Network request failed."): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error) {
    return error;
  }
  return fallback;
}

export function clearJsonCache(url?: string) {
  if (url) {
    jsonCache.delete(url);
  } else {
    jsonCache.clear();
  }
}

async function doFetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while loading ${url}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !contentType.includes("json") && !contentType.includes("text/plain")) {
    throw new Error(`Unexpected content type (${contentType}) for ${url}`);
  }
  return (await response.json()) as T;
}

function raceWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(
      signal.reason ?? new DOMException("The operation was aborted.", "AbortError"),
    );
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { signal, cache = false } = options;
  if (!cache) {
    return doFetchJson<T>(url, signal);
  }

  const existing = jsonCache.get(url);
  if (existing) {
    // Refresh LRU order.
    jsonCache.delete(url);
    jsonCache.set(url, existing);
    return raceWithSignal(existing as Promise<T>, signal);
  }

  if (jsonCache.size >= MAX_CACHE_SIZE) {
    const oldest = jsonCache.keys().next().value;
    if (oldest !== undefined) {
      jsonCache.delete(oldest);
    }
  }

  const pending = doFetchJson<T>(url).catch((error) => {
    jsonCache.delete(url);
    throw error;
  });
  jsonCache.set(url, pending);
  return raceWithSignal(pending, signal);
}
