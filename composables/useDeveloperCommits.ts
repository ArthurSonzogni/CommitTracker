import {
  computed,
  ref,
  shallowRef,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef,
} from "vue";
import {
  chromiumDataAll,
  type DeveloperCommit,
  type DeveloperCommitsEntry,
} from "~/plugins/chromiumData";

export type { DeveloperCommit, DeveloperCommitsEntry };

export interface UseDeveloperCommitsOptions {
  repo: MaybeRefOrGetter<string | string[] | undefined>;
  developers: MaybeRefOrGetter<string[] | undefined>;
  dates?: MaybeRefOrGetter<[Date, Date] | Date[] | undefined>;
  author?: MaybeRefOrGetter<boolean | undefined>;
  review?: MaybeRefOrGetter<boolean | undefined>;
}

export function useDeveloperCommits(options: UseDeveloperCommitsOptions): {
  raw: ShallowRef<DeveloperCommitsEntry[]>;
  filtered: ComputedRef<DeveloperCommitsEntry[]>;
  loading: Ref<boolean>;
  reload: () => Promise<void>;
} {
  const raw = shallowRef<DeveloperCommitsEntry[]>([]);
  const loading = ref(false);
  let requestCounter = 0;

  const resolveRepo = (): string => {
    const r = toValue(options.repo);
    if (Array.isArray(r)) return r[0] ?? "";
    return r ?? "";
  };

  const resolveDevelopers = (): string[] => {
    const devs = toValue(options.developers);
    return Array.isArray(devs) ? devs.filter(Boolean) : [];
  };

  const reload = async () => {
    const repoName = resolveRepo();
    const devs = resolveDevelopers();
    const reqId = ++requestCounter;

    if (!repoName || devs.length === 0) {
      raw.value = [];
      loading.value = false;
      return;
    }

    loading.value = true;
    try {
      const result = await chromiumDataAll(repoName, devs);
      if (reqId !== requestCounter) return;
      raw.value = result;
    } finally {
      if (reqId === requestCounter) {
        loading.value = false;
      }
    }
  };

  watch(
    () => [resolveRepo(), resolveDevelopers().join("\0")] as const,
    () => {
      reload();
    },
    { immediate: true },
  );

  const filtered = computed<DeveloperCommitsEntry[]>(() => {
    const dates = toValue(options.dates);
    const hasDateBounds = Array.isArray(dates) && dates.length >= 2 && dates[0] instanceof Date && dates[1] instanceof Date;
    const startMs = hasDateBounds ? dates![0].getTime() : -Infinity;
    const endMs = hasDateBounds ? dates![1].getTime() : Infinity;

    const includeAuthor = toValue(options.author) ?? true;
    const includeReview = toValue(options.review) ?? true;

    return raw.value.map((entry) => {
      if (!includeAuthor && !includeReview) {
        return { developer: entry.developer, data: [] };
      }

      const commits = entry.data.filter((commit) => {
        if (!includeAuthor && commit.kind === "author") return false;
        if (!includeReview && commit.kind === "review") return false;
        const t = commit.timeMs;
        return t >= startMs && t <= endMs;
      });

      return {
        developer: entry.developer,
        data: commits,
      };
    });
  });

  return { raw, filtered, loading, reload };
}
