import { backgroundTasks } from "./backgroundTasks.js";

type Entry = { value: unknown; updatedAt: number; error?: string };
// Bounded, administrator/filter-scoped process cache, never an authorization
// cache. Each controller checks the role before reading it. Other instances and
// out-of-band DB writes are observed at the next TTL refresh (not instantly).
export function createAnalysisSnapshots(now = () => Date.now()) {
  const entries = new Map<string, Entry>();
  const pending = new Map<string, Promise<Entry>>();
  let generation = 0;
  const build = (key: string, loader: () => Promise<unknown>) => {
    if (pending.has(key)) return pending.get(key)!;
    const version = generation;
    const work = Promise.resolve().then(loader).then(value => {
      if (version !== generation) throw new Error("Analysis inputs changed; retry the request");
      const entry = { value, updatedAt: now() };
      entries.delete(key); entries.set(key, entry);
      while (entries.size > 100) entries.delete(entries.keys().next().value!);
      return entry;
    }).catch(error => {
      const entry = entries.get(key);
      if (version === generation && entry) entry.error = "Refresh failed; showing the last successful results.";
      throw error;
    }).finally(() => { if (pending.get(key) === work) pending.delete(key); });
    pending.set(key, work);
    return work;
  };
  return {
    invalidate() { generation++; entries.clear(); pending.clear(); },
    async read<T>(key: string, loader: () => Promise<T>) {
      let entry = entries.get(key);
      let refreshing = false;
      if (!entry || now() - entry.updatedAt > 300000) entry = await build(key, loader);
      else if (now() - entry.updatedAt > 60000) {
        refreshing = true;
        backgroundTasks.schedule("analysis snapshot", async () => { await build(key, loader); });
      }
      return { value: entry.value as T, snapshot: { updatedAt: new Date(entry.updatedAt).toISOString(), refreshing, error: entry.error || "" } };
    },
  };
}
export const analysisSnapshots = createAnalysisSnapshots();
