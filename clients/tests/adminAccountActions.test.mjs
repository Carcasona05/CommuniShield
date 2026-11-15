import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { adminEditChanges, adminEditValues } from "../services/adminAccountEdit.js";

const original = { id: "admin-1", name: "Jene", email: "jene@example.com", role: "admin", department: "Safety", phone: "09123456789", status: "Active" };

test("untouched or reverted edits have no changes: Jene -> Jener -> Jene", () => {
  assert.deepEqual(adminEditChanges(original, { ...original }), {});
  assert.deepEqual(adminEditChanges(original, { ...original, name: "Jener" }), { name: "Jener" });
  assert.deepEqual(adminEditChanges(original, { ...original, name: "Jene" }), {});
});

test("every editable field enables save only while its current value differs", () => {
  const replacements = { name: "Jener", email: "other@example.com", role: "super_admin", department: "Traffic", phone: "09987654321" };
  for (const [field, value] of Object.entries(replacements)) {
    assert.deepEqual(adminEditChanges(original, { ...original, [field]: value }), { [field]: value });
    assert.deepEqual(adminEditChanges(original, { ...original, [field]: original[field] }), {});
  }
  assert.deepEqual(adminEditChanges(original, { ...original, name: "Jener", department: "Traffic" }), { name: "Jener", department: "Traffic" });
});

test("formatting-only changes, status metadata and a different account are not edit requests", () => {
  assert.deepEqual(adminEditChanges(original, { ...original, name: " Jene ", email: " JENE@EXAMPLE.COM " }), {});
  assert.deepEqual(adminEditChanges(original, { ...original, status: "Disabled" }), {});
  assert.deepEqual(adminEditChanges(original, { ...original, id: "admin-2", name: "Jener" }), {});
  assert.deepEqual(adminEditChanges(null, original), {});
  assert.equal(adminEditValues({ name: "  " }).name, "");
});

test("edit request payload omits unchanged email, role and status", () => {
  const changes = adminEditChanges(original, { ...original, name: "Jener" });
  assert.deepEqual(changes, { name: "Jener" });
  assert.equal("email" in changes, false);
  assert.equal("status" in changes, false);
});

test("modal disables unchanged/reverted saves and blocks duplicate submissions", () => {
  const ui = readFileSync(new URL("../components/modals/SuperAdmin_EditReq.jsx", import.meta.url), "utf8");
  assert.match(ui, /adminEditChanges\(original, formData\)/);
  assert.match(ui, /disabled=\{!hasChanges \|\| saving\}/);
  assert.match(ui, /if \(!hasChanges \|\| savingRef.current\) return/);
  assert.match(ui, /await onSave\(\{ id: formData.id, \.\.\.changes \}\)/);
  assert.match(ui, /setOriginal\(\{ \.\.\.admin \}\)/);
  assert.match(ui, /\[admin, visible\]/);
});

test("Disable, Activate and Delete only request confirmation before any mutation", () => {
  const source = readFileSync(new URL("../app/(sadmin)/SAdmin_AdminAccounts.jsx", import.meta.url), "utf8");
  const deleteHandler = source.slice(source.indexOf("const handleDeleteAdmin"), source.indexOf("const handleToggleStatus"));
  const statusHandler = source.slice(source.indexOf("const handleToggleStatus"), source.indexOf("const closeConfirmation"));
  assert.match(deleteHandler, /setPendingAction\(\{ \.\.\.admin, action: "Delete"/);
  assert.match(statusHandler, /action: admin.status === "Active" \? "Disable" : "Activate"/);
  assert.doesNotMatch(deleteHandler + statusHandler, /apiClient\./);
  assert.match(source, /visible=\{confirmationVisible\}/);
  assert.match(source, /onPress=\{closeConfirmation\}/);
  assert.match(source, /onPress=\{confirmAccountAction\}/);
  assert.match(source, /if \(!confirmationVisible \|\| !pendingAction \|\| actionBusyRef.current\) return/);
  assert.match(source, /\{ status: target.nextStatus \}/);
  assert.match(source, /pendingAction\?\.name \|\| pendingAction\?\.email/);
});

test("closing confirmation retains account details during fade-out", () => {
  const source = readFileSync(new URL("../app/(sadmin)/SAdmin_AdminAccounts.jsx", import.meta.url), "utf8");
  const close = source.slice(source.indexOf("const closeConfirmation"), source.indexOf("const confirmAccountAction"));
  assert.match(close, /setConfirmationVisible\(false\)/);
  assert.doesNotMatch(close, /setPendingAction/);
  assert.doesNotMatch(source, /setPendingAction\(null\)/);
  assert.equal((source.match(/setConfirmationVisible\(true\)/g) || []).length, 2);
});

test("confirmation highlights the target account and action consequences", () => {
  const source = readFileSync(new URL("../app/(sadmin)/SAdmin_AdminAccounts.jsx", import.meta.url), "utf8");
  for (const style of ["confirmAccount", "confirmAvatar", "confirmName", "confirmEmail", "confirmRole", "confirmStatus", "confirmImpact"]) {
    assert.ok(source.includes(`styles.${style}`));
  }
  assert.match(source, /StatusBadge label=\{pendingAction\?\.status/);
  assert.match(source, /This action cannot be undone/);
});

test("disabled notices share a clear recovery step and preserve forced sign-out", () => {
  const notice = readFileSync(new URL("../components/modals/AccountDisabledNotice.jsx", import.meta.url), "utf8");
  assert.match(notice, /Account Disabled/);
  assert.match(notice, /Contact your supervisor or system administrator/);
  assert.match(notice, /onRequestClose=\{signOut \? \(\) => \{\} : onConfirm\}/);
  assert.match(notice, /onPress=\{onConfirm\}/);
  for (const layout of ["Admin_compo/Admin_Layout.jsx", "SAdmin_Compo/SAdmin_Layout.jsx"]) {
    const source = readFileSync(new URL(`../components/${layout}`, import.meta.url), "utf8");
    assert.match(source, /AccountDisabledNotice visible=\{showDisabledModal\} onConfirm=\{handleDisabledLogout\} signOut/);
  }
  const login = readFileSync(new URL("../app/(auth)/Admin_Login.jsx", import.meta.url), "utf8");
  assert.match(login, /AccountDisabledNotice visible=\{disabledModalVisible\} email=\{email.trim\(\)\}/);
});
