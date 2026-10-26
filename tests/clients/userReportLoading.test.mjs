import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

for (const [file, callback, endpoint] of [
  ["User_Home.jsx", "loadReports", "/reports"],
  ["User_MyReports.jsx", "loadMyReports", "/reports/mine"],
]) {
  const source = readFileSync(new URL(`../../clients/app/(tabs)/${file}`, import.meta.url), "utf8");
  const match = new RegExp(`const ${callback} = useCallback\\(async \\(\\) => \\{([\\s\\S]*?)\\}, \\[\\]\\);`).exec(source);

  async function run(fail) {
    assert.ok(match, `${callback} must exist`);
    const cached = { reports: [{ id: "cached-report" }] };
    const fresh = { reports: [{ id: "fresh-report" }] };
    const state = { reports: [], errors: [], writes: [], requests: [], loading: true, refreshing: true };
    const context = {
      AsyncStorage: { getItem: async () => "token" },
      getCache: (key) => key === `api:${endpoint}` ? cached : undefined,
      setCache: (key, value) => state.writes.push({ key, value }),
      mapFeed: (data) => data.reports,
      mapMyReports: (data) => data.reports,
      setReports: (value) => { state.reports = value; },
      setMyReports: (value) => { state.reports = value; },
      setLoadError: (value) => state.errors.push(value),
      setLoading: (value) => { state.loading = value; },
      setRefreshing: (value) => { state.refreshing = value; },
      apiClient: { get: async (path) => {
        state.requests.push(path);
        if (fail) throw new Error("Backend unavailable");
        return { data: fresh };
      } },
    };
    await vm.runInNewContext(`(async () => {${match[1]}})()`, context);
    return { state, cached, fresh };
  }

  test(`${file} keeps cached reports and exposes a retryable load failure`, async () => {
    const { state, cached } = await run(true);
    assert.equal(state.reports, cached.reports);
    assert.match(state.errors.at(-1), /Could not load.*reports/);
    assert.equal(state.writes.length, 0);
    assert.equal(state.loading, false);
    assert.equal(state.refreshing, false);
    assert.deepEqual(state.requests, [endpoint]);
    assert.match(source, /Reports unavailable/);
    assert.match(source, /onPress=\{handleRefresh\} disabled=\{refreshing\}/);
    assert.match(source, /!loadError && filteredReports\.length === 0/);
  });

  test(`${file} clears its load error when a retry succeeds`, async () => {
    const { state, fresh } = await run(false);
    assert.equal(state.reports, fresh.reports);
    assert.equal(state.errors.at(-1), null);
    assert.equal(state.loading, false);
    assert.equal(state.refreshing, false);
    assert.deepEqual(state.requests, [endpoint]);
    assert.ok(state.writes.some(row => row.key === `api:${endpoint}`));
  });
}
