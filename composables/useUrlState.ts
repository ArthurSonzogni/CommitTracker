import { nextTick, ref, watch, type Ref } from "vue";
import { useRoute, useRouter, type LocationQuery, type LocationQueryRaw, type LocationQueryValue } from "vue-router";

export type RawQueryEntry = string | null | undefined;

export interface UrlCodec<T> {
  parse: (raw: RawQueryEntry) => T;
  serialize: (value: T) => RawQueryEntry;
  equals?: (a: T, b: T) => boolean;
}

export interface UrlFieldConfig<T> extends UrlCodec<T> {
  /** Existing ref to synchronize; if omitted, useUrlState creates one. */
  ref?: Ref<T>;
  /** Override query parameter key (defaults to schema property key). */
  key?: string;
  /** Whether changes to this field push a new history entry or replace the current one (default: 'replace'). */
  history?: "replace" | "push";
}

export type UrlStateSchema = Record<string, UrlFieldConfig<any>>;

export type UrlStateRefs<S extends UrlStateSchema> = {
  [K in keyof S]: S[K] extends UrlFieldConfig<infer T> ? Ref<T> : never;
};

export interface UseUrlStateOptions {
  /** Keep unrelated query keys present in route.query (default: true). */
  preserveUnknown?: boolean;
}

const formatIsoDate = (date: Date): string =>
  date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toISOString().split("T")[0]
    : "";

const arrayEquals = <T>(a: readonly T[], b: readonly T[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

export const urlCodecs = {
  string(defaultValue = ""): UrlCodec<string> {
    return {
      parse: (raw) => (typeof raw === "string" ? raw : defaultValue),
      serialize: (val) => (val === defaultValue ? undefined : val),
      equals: (a, b) => a === b,
    };
  },

  enum<T extends string>(allowed: readonly T[], defaultValue: T): UrlCodec<T> {
    return {
      parse: (raw) =>
        typeof raw === "string" && (allowed as readonly string[]).includes(raw)
          ? (raw as T)
          : defaultValue,
      serialize: (val) => (val === defaultValue ? undefined : val),
      equals: (a, b) => a === b,
    };
  },

  number(
    defaultValue: number,
    options: { min?: number; max?: number; integer?: boolean } = {},
  ): UrlCodec<number> {
    const clamp = (n: number): number => {
      let v = options.integer ? Math.trunc(n) : n;
      if (options.min !== undefined && v < options.min) v = options.min;
      if (options.max !== undefined && v > options.max) v = options.max;
      return v;
    };
    return {
      parse: (raw) => {
        if (typeof raw !== "string" || raw.trim() === "") return defaultValue;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? clamp(parsed) : defaultValue;
      },
      serialize: (val) =>
        !Number.isFinite(val) || val === defaultValue ? undefined : String(val),
      equals: (a, b) => a === b,
    };
  },

  boolean(defaultValue = false): UrlCodec<boolean> {
    return {
      parse: (raw) => {
        if (raw === undefined) return defaultValue;
        if (raw === null || raw === "" || raw === "true" || raw === "1") return true;
        if (raw === "false" || raw === "0") return false;
        return defaultValue;
      },
      serialize: (val) => (val === defaultValue ? undefined : String(val)),
      equals: (a, b) => a === b,
    };
  },

  /** Serializes booleans as "1" / "0" (e.g. history_color=0, history_size=1). */
  bit(defaultValue = false): UrlCodec<boolean> {
    return {
      parse: (raw) => {
        if (raw === undefined) return defaultValue;
        if (raw === "1" || raw === "true" || raw === null || raw === "") return true;
        if (raw === "0" || raw === "false") return false;
        return defaultValue;
      },
      serialize: (val) => (val === defaultValue ? undefined : val ? "1" : "0"),
      equals: (a, b) => a === b,
    };
  },

  /** Presence-only flag parameter (e.g. `?exclude_test` -> null when true, omitted when false). */
  flag(): UrlCodec<boolean> {
    return {
      parse: (raw) => raw !== undefined && raw !== "false" && raw !== "0",
      serialize: (val) => (val ? null : undefined),
      equals: (a, b) => a === b,
    };
  },

  csv(defaultValue: readonly string[] = [], separator = ","): UrlCodec<string[]> {
    return {
      parse: (raw) => {
        if (raw === undefined) return [...defaultValue];
        if (raw === null || raw === "") return [];
        return raw.split(separator).filter(Boolean);
      },
      serialize: (val) => {
        const list = Array.isArray(val) ? val.filter(Boolean) : [];
        if (arrayEquals(list, defaultValue)) return undefined;
        return list.join(separator);
      },
      equals: (a, b) => arrayEquals(a || [], b || []),
    };
  },

  dateRange(
    defaultStart: string | Date = "2000-01-01",
    defaultEnd?: string | Date,
  ): UrlCodec<[Date, Date]> {
    const startDefaultStr = typeof defaultStart === "string"
      ? defaultStart
      : formatIsoDate(defaultStart);
    const makeDefaults = (): [Date, Date] => [
      new Date(defaultStart),
      defaultEnd ? new Date(defaultEnd) : new Date(),
    ];
    return {
      parse: (raw) => {
        if (typeof raw !== "string" || !raw.includes(",")) {
          return makeDefaults();
        }
        const [s, e] = raw.split(",");
        const d0 = new Date(s);
        const d1 = new Date(e);
        if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) {
          return makeDefaults();
        }
        return [d0, d1];
      },
      serialize: (val) => {
        if (!Array.isArray(val) || val.length < 2) return undefined;
        const s = formatIsoDate(val[0]);
        const e = formatIsoDate(val[1]);
        if (!s || !e) return undefined;
        const endDefaultStr = defaultEnd
          ? (typeof defaultEnd === "string" ? defaultEnd : formatIsoDate(defaultEnd))
          : formatIsoDate(new Date());
        if (s === startDefaultStr && e === endDefaultStr) {
          return undefined;
        }
        return `${s},${e}`;
      },
      equals: (a, b) =>
        Array.isArray(a) &&
        Array.isArray(b) &&
        a.length >= 2 &&
        b.length >= 2 &&
        formatIsoDate(a[0]) === formatIsoDate(b[0]) &&
        formatIsoDate(a[1]) === formatIsoDate(b[1]),
    };
  },
};

function unwrapQueryValue(val: LocationQueryValue | LocationQueryValue[] | undefined): RawQueryEntry {
  if (Array.isArray(val)) {
    return val.length > 0 ? val[0] : undefined;
  }
  return val;
}

export function sameQuery(a: LocationQuery | LocationQueryRaw, b: LocationQuery | LocationQueryRaw): boolean {
  const norm = (q: LocationQuery | LocationQueryRaw): Map<string, string | null> => {
    const map = new Map<string, string | null>();
    for (const [k, raw] of Object.entries(q)) {
      const v = Array.isArray(raw) ? raw[0] : raw;
      if (v === undefined) continue;
      map.set(k, v === null ? null : String(v));
    }
    return map;
  };
  const ma = norm(a);
  const mb = norm(b);
  if (ma.size !== mb.size) return false;
  for (const [k, v] of ma) {
    if (!mb.has(k) || mb.get(k) !== v) return false;
  }
  return true;
}

export function useUrlState<S extends UrlStateSchema>(
  schema: S,
  options: UseUrlStateOptions = {},
): UrlStateRefs<S> {
  const route = useRoute();
  const router = useRouter();
  const preserveUnknown = options.preserveUnknown ?? true;

  type BoundEntry = {
    propKey: string;
    queryKey: string;
    targetRef: Ref<any>;
    parse: (raw: RawQueryEntry) => any;
    serialize: (val: any) => RawQueryEntry;
    equals: (a: any, b: any) => boolean;
    history: "replace" | "push";
  };

  const entries: BoundEntry[] = [];
  const stateRefs: Record<string, Ref<any>> = {};
  const lastSerialized = new Map<string, RawQueryEntry>();

  for (const [propKey, config] of Object.entries(schema)) {
    const queryKey = config.key ?? propKey;
    const initialRaw = unwrapQueryValue(route.query[queryKey]);
    const initialVal = config.parse(initialRaw);
    const targetRef = config.ref ?? (ref(initialVal) as Ref<any>);
    if (config.ref) {
      targetRef.value = initialVal;
    }

    const entry: BoundEntry = {
      propKey,
      queryKey,
      targetRef,
      parse: config.parse,
      serialize: config.serialize,
      equals: config.equals ?? ((a, b) => a === b),
      history: config.history ?? "replace",
    };

    entries.push(entry);
    stateRefs[propKey] = targetRef;
    lastSerialized.set(queryKey, entry.serialize(targetRef.value));
  }

  const managedQueryKeys = new Set(entries.map(e => e.queryKey));
  let restoring = false;

  const buildNextQuery = (): LocationQueryRaw => {
    const next: LocationQueryRaw = {};
    if (preserveUnknown) {
      for (const [k, v] of Object.entries(route.query)) {
        if (!managedQueryKeys.has(k) && v !== undefined) {
          next[k] = v;
        }
      }
    }
    for (const entry of entries) {
      const serialized = entry.serialize(entry.targetRef.value);
      if (serialized !== undefined) {
        next[entry.queryKey] = serialized;
      }
    }
    return next;
  };

  // Watch state refs -> write to URL.
  watch(
    entries.map(e => e.targetRef),
    () => {
      if (restoring) return;

      let shouldPush = false;
      for (const entry of entries) {
        const nextVal = entry.serialize(entry.targetRef.value);
        const prevVal = lastSerialized.get(entry.queryKey);
        if (nextVal !== prevVal) {
          if (entry.history === "push") {
            shouldPush = true;
          }
          lastSerialized.set(entry.queryKey, nextVal);
        }
      }

      const nextQuery = buildNextQuery();
      if (sameQuery(route.query, nextQuery)) {
        return;
      }

      const target = {
        query: nextQuery,
        hash: route.hash || undefined,
      };
      if (shouldPush) {
        router.push(target);
      } else {
        router.replace(target);
      }
    },
    { deep: true },
  );

  // Watch route.query (Back/Forward or in-page NuxtLink) -> restore refs.
  watch(
    () => route.query,
    async (newQuery) => {
      restoring = true;
      try {
        for (const entry of entries) {
          const raw = unwrapQueryValue(newQuery[entry.queryKey]);
          const parsed = entry.parse(raw);
          if (!entry.equals(entry.targetRef.value, parsed)) {
            entry.targetRef.value = parsed;
          }
          lastSerialized.set(entry.queryKey, entry.serialize(entry.targetRef.value));
        }
      } finally {
        await nextTick();
        restoring = false;
      }
    },
  );

  return stateRefs as UrlStateRefs<S>;
}
