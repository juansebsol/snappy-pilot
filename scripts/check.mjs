import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { php } from './php.mjs';
const files = ['index.php'];
for (const directory of ['lib', 'js', 'scripts', 'tests']) {
    files.push(...readdirSync(directory).filter(file => /\.(php|js|mjs|sh)$/.test(file)).map(file => `${directory}/${file}`));
}
for (const file of files) {
    const [binary, args] = file.endsWith('.php') ? [php, ['-l', file]]
        : file.endsWith('.sh') ? ['bash', ['-n', file]] : [process.execPath, ['--check', file]];
    const result = spawnSync(binary, args, { encoding: 'utf8' });
    if (result.status !== 0) {
        console.error(file, result.error?.message || result.stderr || result.stdout);
        process.exit(1);
    }
}
console.log(`Syntax checks passed: ${files.length} PHP, JavaScript and shell files.`);
