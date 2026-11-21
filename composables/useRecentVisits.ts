export type RecentVisit = {
  key: string;
  label: string;
  hint?: string;
  icon: string;
  path: string;
};

const STORAGE_KEY = "ct-recent-visits";
const MAX_RECENT = 4;

export function useRecentVisits() {
  const recent = useState<RecentVisit[]>("site-recent-visits", () => []);
  const loaded = useState<boolean>("site-recent-loaded", () => false);

  const loadRecent = () => {
    if (loaded.value || typeof window === "undefined") return;
    loaded.value = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          recent.value = parsed.slice(0, MAX_RECENT);
        }
      }
    } catch {}
  };

  const recordRecent = (item: RecentVisit) => {
    if (typeof window === "undefined") return;
    loadRecent();
    const next = [item, ...recent.value.filter((r) => r.path !== item.path)].slice(0, MAX_RECENT);
    recent.value = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  return { recent, loadRecent, recordRecent };
}
