import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("plus checks access once with immediate feedback and locks repeated taps", () => {
  const nav = read("components/BottomNavBar.jsx");
  assert.match(nav, /onPress=\{openReport\}/);
  assert.equal((nav.match(/await ensureParticipationReady\(\)/g) || []).length, 1);
  assert.match(nav, /if \(openingRef.current\) return/);
  assert.match(nav, /allowed && sessionData.current\(epoch\)/);
  assert.ok(nav.indexOf("setOpeningReport(true)") < nav.indexOf("await ensureParticipationReady()"));
});

test("form focus restores drafts without repeating entry access checks", () => {
  const screen = read("app/(tabs)/User_PostReport.jsx");
  assert.match(screen, /useFocusEffect\(useCallback/);
  assert.match(screen, /reportPosting.takeDraft\(\)/);
  assert.doesNotMatch(screen, /ensureParticipationReady|ensureCompleteProfile|entryAccess/);
});

test("Post Report does not repeat frontend access preflights; backend still enforces authorization", () => {
  const screen = read("app/(tabs)/User_PostReport.jsx");
  assert.match(screen, /disabled=\{submitting \|\| postingBlocked\}/);
  assert.match(screen, /if \(postingBlocked \|\| submitLockRef.current\) return/);
  const handler = screen.slice(screen.indexOf("const handlePostReport"), screen.indexOf("if (!fontsLoaded)"));
  assert.doesNotMatch(handler, /ensureCompleteProfile|apiClient.get/);
  const routes = readFileSync(new URL("../../server/src/routes/reportRoute.ts", import.meta.url), "utf8");
  assert.match(routes, /router.post\("\/reports", authenticate, requireCompleteUserProfile, requireCredibilityWriteAccess\("report"\), createReport\)/);
});

test("profile and incident options use session cache for the first form render", () => {
  const screen = read("app/(tabs)/User_PostReport.jsx");
  assert.match(screen, /useState\(\(\) => \{\s*const profile = getCache\("api:\/profile"\)/);
  assert.match(screen, /useState\(\(\) => getCache\("api:\/incidents\/options"\)/);
});

test("address edits do not change GPS coordinates and remain locked during location fetch/submission", () => {
  const screen = read("app/(tabs)/User_PostReport.jsx");
  assert.match(screen, /onChangeText=\{\(text\) => \{ if \(!submitLockRef.current\) setLocation\(text\); \}\}/);
  assert.match(screen, /editable=\{!loadingLocation && !submitting\}/);
  assert.match(screen, /!draft.location.trim\(\)/);
  const posting = read("services/reportPosting.js");
  assert.match(posting, /location: draft.location.trim\(\),\s*latitude: draft.latitude,\s*longitude: draft.longitude,/);
  assert.match(screen, /setLatitude\(fetchedLatitude\)/);
  assert.match(screen, /setLongitude\(fetchedLongitude\)/);
  assert.match(screen, /Refresh replaces both the address and coordinates/);
});
