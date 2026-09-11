import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
export const php = process.env.PHP_BIN || (existsSync('/opt/homebrew/opt/php@8.4/bin/php') ? '/opt/homebrew/opt/php@8.4/bin/php' : 'php');
if (process.argv[1]?.endsWith('/php.mjs')) {
    const result = spawnSync(php, process.argv.slice(2), { stdio: 'inherit' });
    if (result.error) console.error('PHP is required. Install PHP 8.4 or set PHP_BIN to its executable.');
    process.exit(result.status ?? 1);
}
