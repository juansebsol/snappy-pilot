import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

test('Deployment and uninstall operate only on the validated plugin target', () => {
    const temp = realpathSync(mkdtempSync(path.join(tmpdir(), 'snappypilot-deploy-test-')));
    const parent = `${temp}/_data_/_default_/plugins`;
    const target = `${parent}/snappy-pilot`;
    const release = `${temp}/release`;
    mkdirSync(parent, { recursive: true });
    mkdirSync(release);
    for (const item of ['index.php', 'lib', 'js', 'css', 'LICENSE', 'README.md']) cpSync(item, `${release}/${item}`, { recursive: true });
    mkdirSync(`${parent}/unrelated`);
    writeFileSync(`${parent}/unrelated/sentinel`, 'preserve me');
    const run = (script, args) => spawnSync('bash', [`scripts/${script}.sh`, ...args], { encoding: 'utf8' });
    const base = ['--root', parent, '--source', release, '--owner', String(userInfo().uid), '--group', String(userInfo().gid)];
    try {
        let result = run('deploy', base);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(existsSync(target), false, 'Dry run must not create target');
        result = run('deploy', [...base, '--apply']);
        assert.equal(result.status, 0, result.stderr);
        assert.ok(existsSync(`${target}/index.php`));
        writeFileSync(`${target}/obsolete-file`, 'old release');
        result = run('deploy', [...base, '--apply']);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(existsSync(`${target}/obsolete-file`), false, 'Update removes obsolete plugin files');
        assert.equal(readFileSync(`${parent}/unrelated/sentinel`, 'utf8'), 'preserve me');
        result = run('uninstall', ['--root', parent]);
        assert.equal(result.status, 0, result.stderr);
        assert.ok(existsSync(target), 'Uninstall dry run preserves files');
        result = run('uninstall', ['--root', parent, '--apply']);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(existsSync(target), false);
        assert.equal(readFileSync(`${parent}/unrelated/sentinel`, 'utf8'), 'preserve me');
        assert.notEqual(run('uninstall', ['--root', temp, '--apply']).status, 0, 'Broad parent rejected');
        symlinkSync(`${parent}/unrelated`, target);
        assert.notEqual(run('deploy', [...base, '--apply']).status, 0, 'Symlink target rejected');
        assert.notEqual(run('uninstall', ['--root', parent, '--apply']).status, 0, 'Symlink uninstall rejected');
    } finally {
        // Only this test-created mkdtemp directory is removed.
        rmSync(temp, { recursive: true, force: true });
    }
});
