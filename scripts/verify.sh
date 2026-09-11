#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/target.sh"
resolve_target "${1:-/var/lib/snappymail-data/_data_/_default_/plugins}"
[[ -f "$PILOT_TARGET/index.php" ]] || fail 'SnappyPilot index.php is missing.'
for file in index.php lib/Service.php lib/OpenAICompatibleProvider.php; do php -l "$PILOT_TARGET/$file"; done
php -r 'exit(extension_loaded("curl") ? 0 : 1);' || fail 'PHP cURL is missing.'
for file in js/commands.js js/editor.js js/ui.js js/SnappyPilot.js css/snappy-pilot.css; do
    [[ -r "$PILOT_TARGET/$file" ]] || fail "Unreadable asset: $file"
done
printf 'Files, PHP syntax and CLI cURL verified. Now run the browser smoke test in DEPLOY.md.\n'
