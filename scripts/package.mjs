import { mkdirSync, cpSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['scripts/check.mjs'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(1);
const root = 'dist/snappy-pilot';
// Start with a new release folder; never include dev dependencies, tests or secrets.
if (existsSync(root)) {
    console.error('dist/snappy-pilot already exists. Move it aside before creating another release.');
    process.exit(1);
}
const safe = path => {
    if (lstatSync(path).isSymbolicLink()) throw new Error(`Symlink not allowed in release: ${path}`);
    if (lstatSync(path).isDirectory()) for (const file of readdirSync(path)) safe(`${path}/${file}`);
};
const files = ['index.php', 'lib', 'js', 'css', 'LICENSE', 'README.md', 'DEPLOY.md', 'docs'];
for (const file of files) safe(file);
mkdirSync(root, { recursive: true });
for (const file of files) cpSync(file, `${root}/${file}`, { recursive: true });
console.log('Release prepared in dist/snappy-pilot. Nothing has been deployed.');
