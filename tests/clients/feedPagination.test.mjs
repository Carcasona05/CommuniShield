import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { mergeComments, mergeUniqueItems } from "../../clients/services/pagination.js";

const read = file => readFileSync(new URL(`../../clients/${file}`, import.meta.url), "utf8");
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

// Exercise the real hooks, including effect cleanup, without loading Expo/native
// modules in Node. State updates are observed by an explicit test render.
function harness(file, globals) {
  const slots = []; let index = 0, effects = [];
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, i) => value !== b[i]);
  const timers = new Map(); let timerId = 0;
  const context = vm.createContext({
    ...globals, mergeComments, mergeUniqueItems, AppState: { currentState: "active" },
    setInterval(fn) { timers.set(++timerId, fn); return timerId; }, clearInterval(id) { timers.delete(id); },
    useRef(value) { const i = index++; return slots[i] ||= { current: value }; },
    useState(value) { const i = index++; if (!(i in slots)) slots[i] = typeof value === "function" ? value() : value; return [slots[i], update => { slots[i] = typeof update === "function" ? update(slots[i]) : update; }]; },
    useCallback(fn, deps) { const i = index++; if (changed(slots[i]?.deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
    useEffect(fn, deps) { const i = index++; if (changed(slots[i]?.deps, deps)) { const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  });
  context.useFocusEffect = fn => context.useEffect(fn, [fn]);
  const source = read(file).replace(/^import .*;\r?$/mg, "").replace("export default function", "function");
  const name = source.match(/function (use\w+)\(/)[1];
  vm.runInContext(`${source}\nglobalThis.hook = ${name};`, context);
  return {
    render(...args) { index = 0; effects = []; const result = context.hook(...args); effects.forEach(fn => fn()); return result; },
    cleanup() { slots.forEach(slot => slot?.cleanup?.()); },
    async poll() { for (const timer of timers.values()) await timer(); },
  };
}

test("merging batches deduplicates identities without merging Admin/User ID collisions", () => {
  const merged = mergeUniqueItems([{ id: "a", postSource: "User", comments: 1 }], [{ id: "a", postSource: "Admin" }, { id: "a", postSource: "User", comments: 100 }]);
  assert.equal(merged.length, 2); assert.equal(merged[0].comments, 100);
  assert.deepEqual(mergeComments([{ id: "b", datePosted: "2026-11-08" }], [{ id: "a", datePosted: "2026-11-07" }]).map(row => row.id), ["a", "b"]);
});

test("feed loads ten, keeps full counts, fetches another batch once, and refresh preserves depth", async () => {
  const requests = [];
  const page = (start) => ({ reports: Array.from({ length: 10 }, (_, i) => ({ id: String(start + i) })), total: 100, statusCounts: { "All Status": 100 }, hasMore: true, nextCursor: String(start + 10) });
  const map = data => data.reports;
  const hook = harness("hooks/useCursorFeed.js", { getCachedPage: () => undefined, AsyncStorage: { getItem: async () => "token" }, apiClient: { get: async (_url, config) => { requests.push(config); return { data: page(Number(config.params.cursor || 0)) }; } } });
  let state = hook.render("/reports/mine", {}, map); await settle(); state = hook.render("/reports/mine", {}, map);
  assert.equal(state.rows.length, 10); assert.equal(state.meta.statusCounts["All Status"], 100);
  await Promise.all([state.loadMore(), state.loadMore()]); state = hook.render("/reports/mine", {}, map);
  assert.equal(requests.length, 2); assert.equal(requests[1].params.cursor, "10"); assert.equal(state.rows.length, 20);
  await state.load({ force: true }); state = hook.render("/reports/mine", {}, map);
  assert.equal(state.rows.length, 20); assert.equal(requests.length, 4);
  hook.cleanup();
});

test("filter changes discard late feed responses and reset the cursor", async () => {
  const held = deferred();
  const map = data => data.reports;
  const calls = [];
  const hook = harness("hooks/useCursorFeed.js", { getCachedPage: () => undefined, AsyncStorage: { getItem: async () => "token" }, apiClient: { get: async (_url, config) => { calls.push(config.params); return config.params.status === "Pending Review" ? held.promise : { data: { reports: [{ id: "resolved" }], hasMore: false, statusCounts: { Resolved: 30 } } }; } } });
  hook.render("/reports/mine", { status: "Pending Review" }, map); await settle();
  let state = hook.render("/reports/mine", { status: "Resolved" }, map);
  assert.equal(state.rows.length, 0); await settle();
  held.resolve({ data: { reports: [{ id: "wrong-filter" }], hasMore: true, nextCursor: "old" } }); await settle();
  state = hook.render("/reports/mine", { status: "Resolved" }, map);
  assert.equal(state.rows[0].id, "resolved"); assert.equal(state.meta.hasMore, false);
  assert.ok(calls.every(call => !call.cursor)); hook.cleanup();
});

test("comments preserve total 100 while fetching batches and submission avoids reloading the thread", async () => {
  const gets = [], posts = [], patches = [], errors = [];
  const comments = start => Array.from({ length: 10 }, (_, i) => ({ id: String(start + i), text: "Comment", datePosted: `2026-11-${String(start + i).padStart(2, "0")}` }));
  const toast = { error: message => errors.push(message) };
  const hook = harness("hooks/usePaginatedComments.js", {
    AsyncStorage: { getItem: async () => "token" }, ensureCompleteProfile: async () => true, triggerRefresh() {}, patchCachedReports: (id, patch) => patches.push([id, patch({ comments: 100 })]),
    apiClient: { get: async (url, config) => { gets.push([url, config]); return { data: url.endsWith("comment-status") ? { comments: [{ id: "new", sentiment_status: "succeeded", sentiment: "positive" }] } : { comments: comments(config.params.cursor ? 1 : 11), total: 100, hasMore: true, nextCursor: "next" } }; },
      post: async (url, data) => { posts.push([url, data]); return { data: { comment: { id: "new", text: data.content, datePosted: "2026-11-30", sentiment_status: "pending" }, total: 101 } }; } },
  });
  let state = hook.render("a", 100, toast); await settle(); state = hook.render("a", 100, toast);
  assert.equal(state.comments.length, 10); assert.equal(state.total, 100);
  await state.loadMore(); state = hook.render("a", 100, toast);
  assert.equal(state.comments.length, 20); assert.equal(state.total, 100); assert.equal(gets[1][1].params.cursor, "next");
  state.setCommentText("New comment"); state = hook.render("a", 100, toast);
  await Promise.all([state.submit(), state.submit()]); state = hook.render("a", 100, toast);
  assert.equal(posts.length, 1); assert.equal(gets.length, 2, "no all-thread GET after submission");
  assert.equal(state.comments.length, 21); assert.equal(state.total, 101); assert.equal(state.commentText, "");
  assert.equal(state.comments.at(-1).sentiment_status, "pending");
  await hook.poll(); state = hook.render("a", 100, toast);
  assert.equal(state.comments.at(-1).sentiment_status, "succeeded"); assert.equal(gets.at(-1)[0], "/reports/a/comment-status");
  assert.equal(patches.at(-1)[1].comments, 101); assert.deepEqual(errors, []); hook.cleanup();
});

test("comments ignore old thread responses after navigation", async () => {
  const held = deferred(), toast = { error() {} };
  const hook = harness("hooks/usePaginatedComments.js", {
    AsyncStorage: { getItem: async () => "token" }, patchCachedReports() {},
    apiClient: { get: async url => url.includes("/a/") ? held.promise : { data: { comments: [{ id: "b-comment" }], total: 1, hasMore: false } } },
  });
  hook.render("a", 100, toast); await settle();
  hook.render("b", 1, toast); await settle();
  held.resolve({ data: { comments: [{ id: "a-comment" }], total: 100, hasMore: true } }); await settle();
  const state = hook.render("b", 1, toast);
  assert.equal(state.comments[0].id, "b-comment"); assert.equal(state.total, 1); hook.cleanup();
});

test("failed submission keeps the draft and never increments the count", async () => {
  const errors = [], toast = { error: message => errors.push(message) };
  const hook = harness("hooks/usePaginatedComments.js", {
    AsyncStorage: { getItem: async () => "token" }, patchCachedReports() {}, ensureCompleteProfile: async () => true,
    apiClient: { get: async () => ({ data: { comments: [], total: 100, hasMore: false } }), post: async () => { throw new Error("Network unavailable"); } },
  });
  let state = hook.render("a", 100, toast); await settle(); state = hook.render("a", 100, toast);
  state.setCommentText("Keep this draft"); state = hook.render("a", 100, toast);
  await state.submit(); state = hook.render("a", 100, toast);
  assert.equal(state.commentText, "Keep this draft"); assert.equal(state.total, 100); assert.equal(state.sending, false); assert.equal(errors.length, 1); hook.cleanup();
});

test("prepending older comments preserves the visible scroll offset", async () => {
  const positions = [];
  const hook = harness("hooks/usePrependScroll.js", {});
  let state = hook.render(10, "a"); state.ref.current = { scrollTo: position => positions.push(position) };
  state.onContentSizeChange(500, 1000); state.onScroll({ nativeEvent: { contentOffset: { y: 600 } } });
  await state.preserve(async () => true);
  state = hook.render(20, "a"); state.onContentSizeChange(500, 1600);
  assert.equal(positions[0].y, 1200); assert.equal(positions[0].animated, false);
});

test("a failed next feed batch preserves existing posts and retries the same cursor", async () => {
  let fail = true;
  const calls = [], map = data => data.reports;
  const hook = harness("hooks/useCursorFeed.js", { getCachedPage: () => undefined, AsyncStorage: { getItem: async () => "token" }, apiClient: { get: async (_url, config) => {
    calls.push(config.params);
    if (config.params.cursor && fail) throw new Error("Network unavailable");
    return { data: { reports: [{ id: config.params.cursor ? "older" : "newer" }], total: 100, hasMore: !config.params.cursor, nextCursor: config.params.cursor ? null : "next" } };
  } } });
  let state = hook.render("/reports", {}, map); await settle(); state = hook.render("/reports", {}, map);
  await state.loadMore(); state = hook.render("/reports", {}, map);
  assert.equal(state.rows.length, 1); assert.equal(state.meta.nextCursor, "next"); assert.ok(state.error);
  fail = false; await state.loadMore(); state = hook.render("/reports", {}, map);
  assert.equal(state.rows.length, 2); assert.equal(state.meta.hasMore, false); assert.equal(state.meta.total, 100);
  assert.equal(calls[1].cursor, calls[2].cursor); hook.cleanup();
});

test("a completed old-thread submission cannot clear the next thread's draft or change its count", async () => {
  const held = deferred(), toast = { error() {} };
  const hook = harness("hooks/usePaginatedComments.js", {
    AsyncStorage: { getItem: async () => "token" }, ensureCompleteProfile: async () => true, patchCachedReports() {}, triggerRefresh() {},
    apiClient: { get: async () => ({ data: { comments: [], total: 100, hasMore: false } }), post: () => held.promise },
  });
  let state = hook.render("a", 100, toast); await settle(); state = hook.render("a", 100, toast);
  state.setCommentText("Old thread"); state = hook.render("a", 100, toast);
  const submission = state.submit(); await settle();
  hook.render("b", 100, toast); await settle(); state = hook.render("b", 100, toast);
  state.setCommentText("Next thread draft");
  held.resolve({ data: { comment: { id: "wrong-thread", text: "Old thread" }, total: 101 } }); await submission;
  state = hook.render("b", 100, toast);
  assert.equal(state.commentText, "Next thread draft"); assert.equal(state.total, 100); assert.equal(state.comments.length, 0); hook.cleanup();
});

test("pending status polling rotates through all loaded comments, rather than starving later batches", async () => {
  const batches = [], toast = { error() {} };
  const rows = start => Array.from({ length: 10 }, (_, i) => ({ id: String(start + i), datePosted: String(start + i), sentiment_status: "pending" }));
  const hook = harness("hooks/usePaginatedComments.js", {
    AsyncStorage: { getItem: async () => "token" }, patchCachedReports() {},
    apiClient: { get: async (url, config) => {
      if (url.endsWith("comment-status")) { batches.push(config.params.ids.split(",")); return { data: { comments: [] } }; }
      return { data: { comments: rows(config.params.cursor ? 1 : 11), total: 100, hasMore: true, nextCursor: "next" } };
    } },
  });
  let state = hook.render("a", 100, toast); await settle(); state = hook.render("a", 100, toast);
  await state.loadMore(); hook.render("a", 100, toast);
  await hook.poll(); await hook.poll();
  assert.equal(batches.length, 2); assert.equal(new Set(batches.flat()).size, 20); hook.cleanup();
});

test("empty and whitespace-only comments never call requirements checks or the POST endpoint", async () => {
  let checks = 0, posts = 0;
  const toast = { error() {} };
  const hook = harness("hooks/usePaginatedComments.js", {
    AsyncStorage: { getItem: async () => "token" }, patchCachedReports() {},
    ensureCompleteProfile: async () => { checks++; return true; },
    apiClient: { get: async () => ({ data: { comments: [], total: 0, hasMore: false } }), post: async () => { posts++; } },
  });
  let state = hook.render("a", 0, toast); await settle(); state = hook.render("a", 0, toast);
  await state.submit();
  state.setCommentText(" \n\t "); state = hook.render("a", 0, toast); await state.submit();
  assert.equal(checks, 0); assert.equal(posts, 0); hook.cleanup();
});

test("unmet requirements or unavailable verification block submission without losing the draft", async () => {
  for (const outcome of [false, "verification-error"]) {
    let posts = 0, checks = 0;
    const toast = { error() {} };
    const hook = harness("hooks/usePaginatedComments.js", {
      AsyncStorage: { getItem: async () => "token" }, patchCachedReports() {},
      ensureCompleteProfile: async action => { assert.equal(action, "comment"); checks++; if (outcome === "verification-error") throw new Error("Cannot verify requirements"); return outcome; },
      apiClient: { get: async () => ({ data: { comments: [], total: 5, hasMore: false } }), post: async () => { posts++; } },
    });
    let state = hook.render("a", 5, toast); await settle(); state = hook.render("a", 5, toast);
    state.setCommentText("Keep my draft"); state = hook.render("a", 5, toast); await state.submit(); state = hook.render("a", 5, toast);
    assert.equal(checks, 1); assert.equal(posts, 0); assert.equal(state.commentText, "Keep my draft"); assert.equal(state.total, 5); assert.equal(state.sending, false);
    hook.cleanup();
  }
});

test("both Post Details send buttons disable and dim for blank drafts or busy states", () => {
  for (const file of ["User_RepPostView_Layout", "MyUser_RepPostView_Layout"]) {
    const source = read(`components/User_compo/${file}.jsx`);
    assert.match(source, /const commentDisabled = !commentText\.trim\(\) \|\| sending \|\| thread\.loading \|\| thread\.loadingMore/);
    assert.match(source, /disabled=\{commentDisabled\}/);
    assert.match(source, /commentDisabled && styles.sendButtonDisabled/);
    assert.match(source, /accessibilityState=\{\{ disabled: commentDisabled \}\}/);
  }
});

test("real comment preflight rejects incomplete profiles, suspensions, low credibility and daily limits", async () => {
  const source = read("services/profileCompletion.js").replace(/^import .*;\r?$/mg, "").replace(/export async function/g, "async function");
  for (const scenario of [
    { complete: false, access: { commentAllowed: true }, expected: false, notice: "profile" },
    { complete: true, access: { suspended: true, commentAllowed: false }, expected: false, notice: "access" },
    { complete: true, access: { commentAllowed: false, commentLimit: 0 }, expected: false, notice: "access" },
    { complete: true, access: { commentAllowed: false, commentLimit: 10 }, expected: false, notice: "access" },
    { complete: true, access: { commentAllowed: true }, expected: true },
  ]) {
    const notices = [];
    const context = vm.createContext({
      AsyncStorage: { getItem: async () => "token" },
      apiClient: { get: async path => ({ data: path === "/profile/completion" ? { complete: scenario.complete, missing: ["Birthdate"] } : scenario.access }) },
      notifyProfileRequirement: () => notices.push("profile"), notifyCredibilityNotice: () => notices.push("access"),
    });
    vm.runInContext(`${source}\nglobalThis.check = ensureCompleteProfile;`, context);
    assert.equal(await context.check("comment"), scenario.expected);
    assert.deepEqual(notices, scenario.notice ? [scenario.notice] : []);
  }
});
