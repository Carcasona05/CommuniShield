import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createSessionData } from "../services/sessionData.js";
import { createReportPosting } from "../services/reportPostingState.js";

const draft = { fullName: "Test User", username: "tester", posterName: "Test User", displayNameType: "Fullname", location: "Corrected address", latitude: "9.88", longitude: "123.59", incidentCategory: "Safety", incidentType: "Theft", details: "Draft details", photos: ["local-photo"] };
const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture(overrides = {}) {
  const sessions = createSessionData();
  sessions.begin("owner-token", "user");
  const calls = { verify: 0, upload: 0, save: 0, success: 0 };
  const posting = createReportPosting({ sessions,
    verify: async () => { calls.verify++; return true; },
    upload: async () => { calls.upload++; return ["uploaded-photo"]; },
    save: async () => { calls.save++; return { report_id: "confirmed-id" }; },
    onSuccess: () => calls.success++, ...overrides });
  const start = () => posting.start(draft, { token: "owner-token", epoch: sessions.epoch() });
  return { posting, calls, sessions, start };
}

test("background task survives screen unsubscribe and success waits for backend confirmation", async () => {
  const upload = defer(), save = defer();
  const f = fixture({ upload: async (_photos, options) => { options.onProgress({ completed: 0, total: 1 }); return upload.promise; }, save: () => save.promise });
  const unsubscribe = f.posting.subscribe(() => {});
  assert.equal(f.start(), true);
  unsubscribe(); // Navigating away unmounts screen, not work.
  assert.equal(f.posting.snapshot().status, "uploading");
  assert.match(f.posting.snapshot().progress, /0\/1/);
  assert.equal(f.start(), false, "duplicate clicks cannot start another job");
  upload.resolve(["uploaded-photo"]); await flush();
  assert.equal(f.posting.snapshot().status, "saving");
  assert.equal(f.calls.success, 0);
  save.resolve({ report_id: "confirmed" }); await flush();
  assert.equal(f.posting.snapshot().status, "success");
  assert.equal(f.posting.snapshot().draft, null);
  assert.equal(f.calls.success, 1);
  f.posting.dispose();
});

test("upload failure retains full draft and retry revalidates before saving", async () => {
  let uploads = 0;
  const f = fixture({ upload: async () => { if (++uploads === 1) throw new Error("Photo failed"); return ["photo-url"]; } });
  f.start(); await flush();
  assert.equal(f.posting.snapshot().status, "failed");
  assert.deepEqual(f.posting.snapshot().draft, draft);
  assert.equal(f.calls.save, 0);
  assert.equal(f.posting.retry(), true);
  assert.equal(f.posting.retry(), false);
  await flush();
  assert.equal(f.calls.verify, 1);
  assert.equal(f.posting.snapshot().status, "success");
  f.posting.dispose();
});

test("failed draft can be restored with photos and original coordinates intact", async () => {
  const f = fixture({ upload: async () => { throw new Error("Upload failed"); } });
  f.start(); await flush();
  assert.equal(f.posting.edit(), true);
  const restored = f.posting.takeDraft();
  assert.deepEqual(restored, draft);
  assert.equal(f.posting.snapshot().status, "idle");
  assert.equal(f.posting.takeDraft(), null);
  f.posting.dispose();
});

test("retry cannot upload or save when current account checks fail", async () => {
  let uploads = 0;
  const f = fixture({ upload: async () => { uploads++; throw new Error("Photo failed"); }, verify: async () => false });
  f.start(); await flush();
  f.posting.retry(); await flush();
  assert.equal(uploads, 1);
  assert.equal(f.calls.save, 0);
  assert.equal(f.posting.snapshot().status, "failed");
  assert.deepEqual(f.posting.snapshot().draft, draft);
  f.posting.dispose();
});

test("a stale owner or a missing token cannot hand off a report", () => {
  const f = fixture();
  assert.equal(f.posting.start(draft, { token: "other-account", epoch: f.sessions.epoch() }), false);
  assert.equal(f.posting.start(draft, { token: null, epoch: f.sessions.epoch() }), false);
  assert.equal(f.posting.start(draft, { token: "owner-token", epoch: f.sessions.epoch() - 1 }), false);
  assert.equal(f.posting.snapshot().status, "idle");
  f.posting.dispose();
});

test("lost or failed save confirmation does not offer an unsafe duplicate retry", async () => {
  for (const response of [undefined, { status: 500 }, { status: 400 }]) {
    const f = fixture({ save: async () => { const error = new Error("Save response failed"); error.response = response; throw error; } });
    f.start(); await flush();
    assert.equal(f.posting.snapshot().status, "uncertain");
    assert.match(f.posting.snapshot().error, /Check My Reports/);
    assert.equal(f.posting.retry(), false);
    assert.equal(f.posting.edit(), false);
    assert.equal(f.calls.success, 0);
    f.posting.dispose();
  }
});

test("a denied save can retry after fresh validation without reuploading successful images", async () => {
  let saves = 0;
  const f = fixture({ save: async () => {
    if (++saves === 1) { const error = new Error("Access denied"); error.response = { status: 403 }; throw error; }
    return { report_id: "saved" };
  } });
  f.start(); await flush();
  assert.equal(f.posting.snapshot().status, "failed");
  f.posting.retry(); await flush();
  assert.equal(f.calls.upload, 1);
  assert.equal(f.calls.verify, 1);
  assert.equal(f.posting.snapshot().status, "success");
  f.posting.dispose();
});

test("logout clears draft, aborts work and fences late results from another account", async () => {
  const upload = defer();
  let signal, progress;
  const f = fixture({ upload: (_photos, options) => { signal = options.signal; progress = options.onProgress; return upload.promise; } });
  f.start();
  f.sessions.reset("logout");
  assert.equal(signal.aborted, true);
  assert.equal(f.posting.snapshot().draft, null);
  f.sessions.begin("different-account", "user");
  progress({ completed: 1, total: 1 });
  upload.resolve(["private-photo"]); await flush();
  assert.equal(f.calls.save, 0);
  assert.equal(f.calls.success, 0);
  assert.equal(f.posting.snapshot().status, "idle");
  f.posting.dispose();
});

test("missing report ID is not success, and refresh failures cannot undo a confirmed save", async () => {
  const missing = fixture({ save: async () => ({}) });
  missing.start(); await flush();
  assert.equal(missing.posting.snapshot().status, "uncertain");
  missing.posting.dispose();
  const confirmed = fixture({ onSuccess: () => { throw new Error("Refresh failed"); } });
  confirmed.start(); await flush();
  assert.equal(confirmed.posting.snapshot().status, "success");
  confirmed.posting.dispose();
});

test("confirmed completion revision survives toast dismissal for retained draft reset", async () => {
  const f = fixture();
  f.start(); await flush();
  assert.equal(f.posting.snapshot().completionRevision, 1);
  f.posting.dismiss();
  assert.equal(f.posting.snapshot().status, "idle");
  assert.equal(f.posting.snapshot().completionRevision, 1);
  f.start(); await flush();
  assert.equal(f.posting.snapshot().completionRevision, 2);
  f.posting.dispose();
});

test("post form resets every draft field and scroll after confirmed completion, not handoff", () => {
  const form = readFileSync(new URL("../app/(tabs)/User_PostReport.jsx", import.meta.url), "utf8");
  assert.match(form, /completionRevision/);
  for (const code of ['setDisplayNameType("Fullname")', 'setLocation("")', 'setLatitude("")', 'setLongitude("")', 'setIncidentCategory("")', 'setIncidentType("")', 'setDetails("")', 'setPhotos([])']) assert.ok(form.includes(code));
  assert.match(form, /scrollRef.current\?\.scrollTo\(\{ y: 0, animated: false \}\)/);
  assert.match(form, /freshLocationRef.current && !draft/);
  const handler = form.slice(form.indexOf("const handlePostReport"), form.indexOf("if (!fontsLoaded)"));
  assert.doesNotMatch(handler, /setPhotos\(\[\]\)|setDetails\(""\)/);
});

test("submission hands off immediately and uploading is plain floating text with success toast", () => {
  const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const form = read("app/(tabs)/User_PostReport.jsx");
  assert.ok(form.indexOf('setSubmitStage("Preparing report…")') < form.indexOf("reportPosting.start("));
  assert.doesNotMatch(form, /ensureCompleteProfile|ensureParticipationReady/);
  assert.match(form, /reportPosting.start/);
  assert.doesNotMatch(form, /uploadImages|navigationTimerRef|apiClient.post/);
  assert.match(form, /router.replace\("\/User_Home"\)/);
  assert.match(form, /const draft = reportPosting.takeDraft\(\)/);
  assert.match(form, /locationSequenceRef.current\+\+/);
  const layout = read("app/(tabs)/_layout.jsx");
  assert.match(layout, /<ReportPostingStatus \/>/);
  const status = read("components/ReportPostingStatus.jsx");
  assert.match(status, /Uploading your post…/);
  assert.match(status, /bottom: bottomSpace \+ navHeight \+ plusSize \+ 18/);
  assert.match(status, /textAlign: "center"/);
  assert.match(status, /fontSize: 18/);
  assert.doesNotMatch(status, /paddingRight/);
  assert.match(status, /position: "absolute"/);
  assert.doesNotMatch(status, /backgroundColor|borderWidth|ActivityIndicator/);
  assert.match(status, /success\("Report submitted successfully/);
  assert.match(status, /reportPosting.dismiss\(\)/);
  assert.match(status, /Edit draft/);
  assert.match(status, /Check My Reports/);
});
