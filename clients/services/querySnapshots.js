export const QUERY_SNAPSHOT_TTL_MS = 5 * 60 * 1000;

export function querySnapshotKey(endpoint, params = {}) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return `query-snapshot:${endpoint}:${JSON.stringify(entries)}`;
}

export function usableQuerySnapshot(snapshot, now = Date.now()) {
  if (!snapshot?.data || !Number.isFinite(snapshot.checkedAt)) return false;
  const age = now - snapshot.checkedAt;
  return age >= 0 && age < QUERY_SNAPSHOT_TTL_MS &&
    new Date(snapshot.checkedAt).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10);
}

// These clocks change on every GET even when the actual report/model output
// is identical. Retain object references in that case so map HTML/focus does
// not get recreated during a quiet refresh. Target dates, evidence and all
// report/analysis fields remain part of the comparison.
export function retainUnchangedQueryData(previous, next) {
  const comparable = (data) => data && ({
    ...data,
    asOf: undefined,
    ...(data.clustering ? { clustering: { ...data.clustering, generatedAt: undefined } } : {}),
    ...(data.forecast ? { forecast: { ...data.forecast, asOf: undefined } } : {}),
  });
  return previous && JSON.stringify(comparable(previous)) === JSON.stringify(comparable(next)) ? previous : next;
}
