import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';

const source = process.env.SNAPPYMAIL_SOURCE;
if (!source) throw new Error('Set SNAPPYMAIL_SOURCE to an upstream v2.38.2 checkout.');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let checks = 0;
const check = (ok, label) => { assert.ok(ok, label); ++checks; };
const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
    await page.setContent(`<!doctype html><html><head><title>SnappyPilot · editor integration test</title></head><body>
        <main id="compose"><h2>New message</h2><p>To: Alex &lt;alex@example.test&gt;</p><p>Subject: Next steps</p><div id="editor"></div></main>
        </body></html>`);
    await page.addStyleTag({ content: `body{margin:40px;background:#f6f7f9;color:#28303c;font:14px system-ui}main{max-width:840px;margin:auto;background:white;padding:24px;border:1px solid #ddd;border-radius:10px}.squire-toolbar{padding:8px;background:#f8f9fa}.squire-toolbar .btn-group{display:inline-block}.squire-toolbar button,.squire-toolbar select{font-size:11px;padding:4px;border:1px solid #ddd;background:white}.squire-wysiwyg{min-height:440px;padding:18px;outline:none;line-height:1.6}.squire-plain{width:100%;min-height:420px}.squire-mode-wysiwyg .squire-plain{display:none}.squire-mode-plain .squire-wysiwyg{display:none}.rl-signature{color:#777}blockquote{border-left:2px solid #ddd;padding-left:15px;margin-top:25px;color:#777}` });
    await page.addStyleTag({ path: 'css/snappy-pilot.css' });
    await page.evaluate(() => {
        const observable = initial => {
            let value = initial;
            const subs = [];
            const obs = (...args) => {
                if (!args.length) return value;
                value = args[0]; subs.forEach(fn => fn(value));
            };
            obs.subscribe = fn => { subs.push(fn); return { dispose() {} }; };
            return obs;
        };
        window.fixture = { observable, requests: [], response: 'Could you please send the file when you have a moment?', delay: 20, enabled: true };
        window.shortcuts = { getMetaKey: () => 'Ctrl' };
        window.rl = {
            i18n: () => '',
            pluginSettingsGet: (slug, key) => key === 'enabled' ? fixture.enabled : 'English',
            Utils: {
                htmlToPlain: html => { const node = document.createElement('div'); node.innerHTML = html; return node.textContent; },
                plainToHtml: text => { const node = document.createElement('div'); node.textContent = text; return node.innerHTML.replace(/\n/g, '<br>'); },
                cleanHtml: html => ({ html })
            },
            app: { Remote: { abort: () => { fixture.aborted = true; } } },
            pluginRemoteRequest: (callback, action, parameters) => {
                fixture.requests.push({ action, parameters });
                setTimeout(() => callback(0, { Result: fixture.failure ? { ok: false, error: 'Provider unavailable' } : { ok: true, text: fixture.response } }), fixture.delay);
            }
        };
        window.vm = { viewModelTemplateID: 'Compose', viewModelDom: document.querySelector('#compose'),
            modalVisible: observable(true), subject: observable('Next steps'), to: observable('Alex <alex@example.test>'),
            cc: observable(''), draftUid: observable(''), bFromDraft: false, aDraftInfo: null };
    });
    await page.addScriptTag({ path: path.join(source, 'vendors/squire2/dist/squire-raw.js') });
    await page.addScriptTag({ path: path.join(source, 'dev/External/SquireUI.js') });
    for (const file of ['commands.js', 'editor.js', 'ui.js', 'SnappyPilot.js']) await page.addScriptTag({ path: `js/${file}` });
    await page.evaluate(() => {
        dispatchEvent(new CustomEvent('rl-view-model.create', { detail: vm }));
        window.editorUI = new SquireUI(document.querySelector('#editor'));
        editorUI.setMode('wysiwyg');
        vm.oEditor = { editor: editorUI };
        dispatchEvent(new CustomEvent('rl-view-model', { detail: vm }));
        window.adapter = new SnappyPilot.Editor(editorUI, vm);
        window.command = id => SnappyPilot.commands.find(item => item.id === id);
        window.setFixture = html => {
            editorUI.squire.setHTML(html);
            editorUI.mode = 'wysiwyg';
            vm.bFromDraft = false; vm.aDraftInfo = null; vm.draftUid('');
            vm.modalVisible(true);
            editorUI.squire.focus();
            const range = document.createRange();
            range.selectNodeContents(editorUI.squire.getRoot().firstElementChild);
            range.collapse(false);
            editorUI.squire.setSelection(range);
        };
        setFixture('<div>send the file pls</div><div class="rl-signature"><b>Sam</b><br>Design team</div><p>On Tuesday, Alex wrote:</p><blockquote><div>Can you share the draft?</div></blockquote>');
    });
    check(await page.getByRole('button', { name: '✦ Pilot' }).count() === 1, 'Toolbar registration');
    check(await page.evaluate(() => fixture.requests.length) === 0, 'No passive provider calls');
    const safety = await page.evaluate(async () => {
        const before = editorUI.squire.getHTML();
        const signature = editorUI.squire.getRoot().querySelector('.rl-signature').outerHTML;
        const quote = editorUI.squire.getRoot().querySelector('blockquote').outerHTML;
        const snap = adapter.capture(command('professional'));
        adapter.apply(snap, 'Could you please send the file?');
        const preserved = signature === editorUI.squire.getRoot().querySelector('.rl-signature').outerHTML
            && quote === editorUI.squire.getRoot().querySelector('blockquote').outerHTML;
        await new Promise(resolve => setTimeout(resolve, 20));
        editorUI.squire.undo();
        return { preserved, text: snap.text, undone: editorUI.squire.getHTML() === before };
    });
    check(safety.preserved && safety.text === 'send the file pls', 'Whole draft excludes signature, attribution and quote');
    check(safety.undone, 'Squire undo restores the draft');
    const selectedResult = await page.evaluate(() => {
        setFixture('<div>Hello <b>world</b> and friends</div>');
        const root = editorUI.squire.getRoot();
        const range = document.createRange(); range.selectNodeContents(root.querySelector('b')); editorUI.squire.setSelection(range);
        const snap = adapter.capture(command('grammar')); adapter.apply(snap, '<img src=x onerror=alert(1)>');
        return { selected: snap.text, text: root.textContent, html: root.innerHTML, image: !!root.querySelector('img') };
    });
    check(selectedResult.selected === 'world' && selectedResult.text.replace(/\u00a0/g, ' ').includes('Hello <img src=x onerror=alert(1)> and friends') && !selectedResult.image,
        'Selected text only; model HTML is literal text: ' + JSON.stringify(selectedResult));
    check(await page.evaluate(() => {
        setFixture('<div>Hello</div><blockquote>quoted history</blockquote>');
        const range = document.createRange(); range.selectNodeContents(editorUI.squire.getRoot()); editorUI.squire.setSelection(range);
        try { adapter.capture(command('grammar')); return false; } catch { return true; }
    }), 'Selections crossing quotes are rejected');
    check(await page.evaluate(() => {
        setFixture('<div>Hello</div>'); const snap = adapter.capture(command('grammar'));
        editorUI.squire.insertPlainText('new typing');
        try { adapter.apply(snap, 'stale'); return false; } catch { return true; }
    }), 'Stale results cannot overwrite typing');
    check(await page.evaluate(() => {
        setFixture('<div>Forwarded text</div>'); vm.aDraftInfo = ['forward', 1, 'INBOX'];
        try { adapter.capture(command('grammar')); return false; } catch { return true; }
    }), 'Unmarked forward requires explicit selection');
    check(await page.evaluate(() => {
        setFixture('<div>Saved draft</div>'); vm.draftUid('21');
        try { adapter.capture(command('grammar')); return false; } catch { return true; }
    }), 'Saved draft requires explicit selection');
    check(await page.evaluate(() => {
        setFixture('<div>Hello</div>'); editorUI.setMode('plain'); editorUI.plain.value = 'Hello\n-- Sam\n> quote'; editorUI.plain.setSelectionRange(0, 5);
        const snap = adapter.capture(command('grammar')); adapter.apply(snap, 'Hi');
        return editorUI.plain.value === 'Hi\n-- Sam\n> quote';
    }), 'Plain selection preserves remaining text');
    check(await page.evaluate(() => {
        editorUI.plain.setSelectionRange(0, 0);
        try { adapter.capture(command('grammar')); return false; } catch { return true; }
    }), 'Plain whole draft fallback is conservative');
    check(await page.evaluate(() => {
        try { new SnappyPilot.Editor(null, vm); return false; } catch { return true; }
    }), 'Missing editor fails gracefully');
    check(await page.evaluate(() => {
        editorUI.setMode('wysiwyg');
        setFixture('<div>Original draft</div><div class="rl-signature">Sam</div><p>Alex wrote:</p><blockquote>Old email</blockquote>');
        const signature = editorUI.squire.getRoot().querySelector('.rl-signature').outerHTML;
        const snap = adapter.capture(command('professional')); adapter.apply(snap, 'Alternative draft', true);
        return editorUI.squire.getRoot().textContent.includes('Original draft')
            && editorUI.squire.getRoot().textContent.includes('Alternative draft')
            && editorUI.squire.getRoot().querySelector('.rl-signature').outerHTML === signature;
    }), 'Insert below preserves original draft and signature');
    await page.evaluate(() => {
        editorUI.setMode('wysiwyg'); setFixture('<div><br></div>');
    });
    await page.locator('.squire-wysiwyg').click();
    await page.keyboard.type('/prof');
    await page.getByRole('option', { name: /Make professional/ }).waitFor();
    check(await page.locator('.sp-pilot-command').count() === 1, 'Slash prefix filtering');
    await page.keyboard.press('Escape');
    check(await page.locator('.sp-pilot').count() === 0, 'Escape closes palette without closing compose');
    await page.evaluate(() => setFixture('<div>write this better</div><div><br></div>'));
    await page.evaluate(() => {
        const range = document.createRange(); range.selectNodeContents(editorUI.squire.getRoot().lastElementChild); range.collapse(true); editorUI.squire.setSelection(range);
    });
    await page.keyboard.type('/prof');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Generate', exact: true }).waitFor();
    check(await page.evaluate(() => !editorUI.squire.getRoot().textContent.includes('/prof') && editorUI.squire.getRoot().textContent.includes('write this better')), 'Keyboard command selection removes only the slash token');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.evaluate(() => setFixture('<div>https://example.test/path</div>'));
    await page.keyboard.type('/');
    check(await page.locator('.sp-pilot').count() === 0, 'Ordinary URL slashes do not open palette');
    await page.evaluate(() => setFixture('<div>send the file pls</div><div class="rl-signature">Sam<br>Design team</div><p>On Tuesday, Alex wrote:</p><blockquote>Can you share the draft?</blockquote>'));
    await page.getByRole('button', { name: '✦ Pilot' }).click();
    await page.getByRole('option', { name: /Make professional/ }).click();
    check(await page.getByRole('button', { name: 'Generate', exact: true }).count() === 1, 'Preview scope and privacy before generation');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await page.getByRole('button', { name: 'Replace', exact: true }).waitFor();
    check(await page.evaluate(() => editorUI.squire.getRoot().textContent.includes('send the file pls')), 'Generation does not edit draft');
    const request = await page.evaluate(() => fixture.requests.at(-1));
    check(request.action === 'SnappyPilotGenerate' && JSON.parse(request.parameters.Payload).context === '', 'Transforms send no email context');
    mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/snappypilot-preview.png', fullPage: true });
    await page.getByRole('button', { name: 'Replace', exact: true }).click();
    check(await page.evaluate(() => editorUI.squire.getRoot().textContent.includes('Could you please send the file')), 'Explicit Replace applies result');
    await page.evaluate(() => { setFixture('<div><br></div><blockquote>Tuesday works for me.</blockquote>'); fixture.delay = 250; });
    await page.getByRole('button', { name: '✦ Pilot' }).click();
    await page.getByRole('option', { name: /Draft reply/ }).click();
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await page.evaluate(() => vm.modalVisible(false));
    await page.waitForTimeout(300);
    check(await page.locator('.sp-pilot').count() === 0 && await page.evaluate(() => fixture.aborted), 'Closing compose ignores late result and cancels browser request');
    const replyPayload = await page.evaluate(() => JSON.parse(fixture.requests.at(-1).parameters.Payload));
    check(replyPayload.context.includes('Tuesday works'), 'Contextual reply includes current quote');
    await page.evaluate(() => { setFixture('<div>Hello</div>'); fixture.failure = true; fixture.delay = 1; });
    await page.getByRole('button', { name: '✦ Pilot' }).click();
    await page.getByRole('option', { name: /Fix grammar/ }).click();
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await page.getByRole('alert').waitFor();
    check(await page.getByRole('alert').textContent() === 'Provider unavailable', 'Provider failure shown safely');
    await page.evaluate(() => { fixture.failure = false; });
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByRole('button', { name: 'Replace', exact: true }).waitFor();
    check(true, 'Retry succeeds');
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    check(await page.evaluate(() => editorUI.squire.getRoot().textContent.trim() === 'Hello'), 'Discard preserves draft');
    await page.setViewportSize({ width: 390, height: 760 });
    await page.getByRole('button', { name: '✦ Pilot' }).click();
    const box = await page.locator('.sp-pilot').boundingBox();
    check(box.x >= 0 && box.x + box.width <= 390, 'Palette fits small viewport');
    check(errors.length === 0, `No browser errors: ${errors.join('; ')}`);
    console.log(`Browser: ${checks} checks passed against upstream Squire and SquireUI. Screenshot: test-results/snappypilot-preview.png`);
} finally { await browser.close(); }
