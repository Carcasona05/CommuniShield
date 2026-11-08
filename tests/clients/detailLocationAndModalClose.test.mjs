import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../clients/${path}`, import.meta.url), "utf8");

test("both Post Details layouts render only one formatted location row", () => {
  for (const name of ["User_RepPostView_Layout", "MyUser_RepPostView_Layout"]) {
    const source = read(`components/User_compo/${name}.jsx`);
    assert.equal((source.match(/<View style=\{styles\.locationRow\}>/g) || []).length, 1);
    assert.match(source, /formatDisplayLocation\((?:post|report)\.location\)/);
  }
});

test("dataset sheets use an accessible X button and retain busy protection", () => {
  const source = read("components/Admin_compo/SentimentDatasetManager.jsx");
  assert.doesNotMatch(source, /title="Close"/);
  assert.match(source, /accessibilityLabel="Close modal"[^>]*disabled=\{busy\}[^>]*onPress=\{onClose\}/);
  assert.match(source, /<Ionicons name="close" size=\{24\}/);
});

test("Super Admin report preview has only a footer Close button beside PDF export", () => {
  const source = read("app/(sadmin)/SAdmin_ReportManagement.jsx");
  const header = source.slice(source.indexOf('<View style={styles.previewHeader}>'), source.indexOf('<ScrollView', source.indexOf('<View style={styles.previewHeader}>')));
  assert.doesNotMatch(header, /name="close"|setPreviewVisible\(false\)/);
  assert.match(source, /Export as PDF<\/Text>[\s\S]*?accessibilityLabel="Close report document">[\s\S]*?styles.previewCloseButtonText[^\n]*>Close<\/Text>/);
  assert.match(source, /\(hovered \|\| pressed\) && styles.previewCloseButtonHovered/);
  assert.match(source, /\(hovered \|\| pressed\) && styles.previewCloseButtonTextHovered/);
  assert.match(source, /<Pressable style=\{\(\{ hovered, pressed \}\) => \[styles.previewPrimaryButton, \(hovered \|\| pressed\) && styles.previewPrimaryButtonHovered\]\} onPress=\{handlePrintPreview\}/);
  assert.match(source, /previewFooter: \{[^\n]*flexWrap: "wrap"[^\n]*flexShrink: 0/);
  assert.match(source, /previewScroll: \{[^\n]*flexShrink: 1/);
  assert.match(source, /previewCloseButton: \{[^\n]*minHeight: 44[^\n]*borderColor: "#294880"/);
});
