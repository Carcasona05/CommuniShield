import assert from "node:assert/strict";
import test from "node:test";
import { sentimentOrigin } from "../../clients/services/sentimentOrigin.js";
test("model origins distinguish immutable built-in, support, unresolved and legacy versions", () => {
  assert.equal(sentimentOrigin("word-character-tfidf-logistic-regression-cebuano@bundled"), "Built-in");
  assert.equal(sentimentOrigin("cascade:supporting|validated_support|builtin:bundled|support:12345678-0000-4000-8000-000000000000"), "Supporting 12345678");
  assert.equal(sentimentOrigin("cascade:unclear|support_disagreement|builtin:bundled|support:1,2"), "Cascade unresolved");
  assert.equal(sentimentOrigin("word-character-tfidf-logistic-regression-cebuano@old-job"), "Legacy model version");
  assert.equal(sentimentOrigin(null), "");
});
