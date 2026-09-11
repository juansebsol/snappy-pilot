import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = { window: {}, TextEncoder };
vm.runInNewContext(readFileSync('js/commands.js', 'utf8'), context);
const P = context.window.SnappyPilot;
test('All 13 commands are searchable, including /prof', () => {
    assert.equal(P.commands.length, 13);
    assert.equal(P.filter('prof')[0].id, 'professional');
    assert.equal(P.filter('no matching command').length, 0);
});
test('UTF-8 context truncation respects byte limits and code points', () => {
    const output = P.limit('🌎'.repeat(10000), 24000);
    assert.equal(output.truncated, true);
    assert.ok(new TextEncoder().encode(output.text).length <= 24000);
    assert.equal(output.text.includes('\uFFFD'), false);
    assert.equal(P.limit('short', 100).text, 'short');
});
