import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { reportCommentDisplay } from "../services/reportCommentDisplay.js";

test("comment display preserves the author and body with readable sentiment labels", () => {
  for (const label of ["positive", "negative", "neutral", "mixed", "unclear"]) {
    const comment = { user: "maria_santos", text: "Salamat kaayo!\nMore details.", sentiment: ` ${label.toUpperCase()} ` };
    const result = reportCommentDisplay(comment);
    assert.equal(result.name, "maria_santos");
    assert.equal(result.initial, "M");
    assert.equal(result.body, comment.text);
    assert.equal(result.sentiment.label.toLowerCase(), label);
    assert.equal(comment.sentiment, ` ${label.toUpperCase()} `);
  }
});

test("missing sentiment is never presented as neutral or as a successful analysis", () => {
  for (const sentiment of [undefined, null, "", "unavailable", "pending", "toString", "unknown-label"]) {
    assert.equal(reportCommentDisplay({ sentiment }).sentiment.label, "Not analyzed");
  }
  assert.equal(reportCommentDisplay({ sentiment: "unclear" }).sentiment.label, "Unclear");
  assert.equal(reportCommentDisplay({ user: " " }).name, "User");
  assert.equal(reportCommentDisplay().body, "");
});

test("long names and multilingual comments are not truncated or changed", () => {
  const name = "long_username_".repeat(20);
  const text = "Ngitngit kaayo among agianan. 😟\n".repeat(20);
  const display = reportCommentDisplay({ user: name, text, sentiment: "negative" });
  assert.equal(display.name, name);
  assert.equal(display.body, text);
});

test("comment cards use a prominent author row, accessible sentiment badges and larger text", () => {
  const source = readFileSync(new URL("../components/Admin_compo/ReportCommentCard.jsx", import.meta.url), "utf8");
  const styles = vm.runInNewContext(source.slice(source.indexOf("const styles = StyleSheet.create")) + "\nstyles;", {
    StyleSheet: { create: value => value },
  });
  assert.ok(source.indexOf("styles.username") < source.indexOf("styles.body"));
  assert.match(source, /accessibilityLabel=\{`Sentiment: \$\{sentiment.label\}`\}/);
  assert.doesNotMatch(source, /numberOfLines/);
  assert.ok(styles.username.fontSize >= 13);
  assert.ok(styles.sentimentText.fontSize >= 12);
  assert.ok(styles.body.lineHeight >= 20);
  assert.equal(styles.header.flexWrap, "wrap");
  const page = readFileSync(new URL("../app/(admin)/Admin_Ince_Map.jsx", import.meta.url), "utf8");
  assert.match(page, /paginatedComments.map/);
  assert.match(page, /<ReportCommentCard key=\{comment.id \|\| index\} comment=\{comment\}/);
  assert.match(page, /const COMMENTS_PER_PAGE = 5/);
  assert.doesNotMatch(page, /styles.commentMeta/);
});
