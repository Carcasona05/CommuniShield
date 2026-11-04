import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
const source=readFileSync(new URL('../../clients/app/(tabs)/User_ProfileSettings.jsx',import.meta.url),'utf8');
test('Credibility Score component and all referenced styles remain unchanged',()=>{
  const component=source.slice(source.indexOf('const CredibilityScore ='),source.indexOf('const buildProfileDetails'));
  const names=[...component.matchAll(/styles\.([A-Za-z0-9_]+)/g)].map(x=>x[1]);
  const parts=[component,...new Set(names).values()].map((value,index)=>index===0?value:source.match(new RegExp('^  '+value+': \\{[\\s\\S]*?^  \\},','m'))?.[0]||value);
  assert.equal(createHash('sha256').update(parts.join('\n')).digest('hex'),'a6734899d88382a35a6c5aa683793ef03a353914b2e81242f8ae57843ae53c9e');
});
test('mobile profile uses horizontal label/value rows and preserves permission-only address editing',()=>{
  assert.match(source,/<Divboxwhite testID="profile-details-container" style=\{styles.detailsCard\}>/);
  assert.match(source,/detailsCard: \{\s+padding: 14,[\s\S]*?backgroundColor: "#FFFFFF"/);
  assert.match(source,/<ThemedHeader accessibilityRole="header" style=\{styles.profileTitle\}>Profile Details/);
  assert.match(source,/savedComplete && missingDetails.length === 0 \? <View testID="profile-complete-badge"/);
  assert.match(source,/required=\{missingDetails.includes\("First name"\)\}/);
  assert.match(source,/required=\{missingDetails.includes\("Last name"\)\}/);
  assert.doesNotMatch(source,/showRequirements|You’re all set|profile-completion-checklist/);
  assert.match(source,/const MOBILE_FONT = Platform.select\(\{ ios: "System", android: "sans-serif", default: "system-ui" \}\)/);
  assert.match(source,/detailsRow: \{\s+flexDirection: "row"/);
  assert.match(source,/value: \{\s+flex: 1,[\s\S]*?textAlign: "right"/);
  assert.match(source,/testID=\{`profile-field-\$\{fieldKey\}`\}/);
  assert.match(source,/if \(!editMode \|\| locationLock.current \|\| saving \|\| deviceCoordinates\) return/);
  assert.match(source,/visible=\{showLocationConsent && editMode\}/);
});
test('Your access has mobile activity rows, collapsible help and timed suspension details',()=>{
  const access=readFileSync(new URL('../../clients/components/CredibilityAccessPanel.jsx',import.meta.url),'utf8');
  assert.match(access,/<AllowanceRow icon="document-text-outline" label="Reports"/);
  assert.match(access,/<AllowanceRow icon="chatbubble-ellipses-outline" label="Comments"/);
  assert.match(access,/accessibilityLabel="Refresh account access"/);
  assert.match(access,/accessibilityState=\{\{ expanded: showScoring \}\}/);
  assert.match(access,/testID="timed-suspension-details"/);
  assert.match(access,/Verified by an Admin or Super Admin: \+15 once per report/);
  assert.doesNotMatch(access,/apiClient.post/);
});
