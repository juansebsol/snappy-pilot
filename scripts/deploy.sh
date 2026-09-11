#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/target.sh"
PILOT_SOURCE="$SCRIPT_DIR/../dist/snappy-pilot"
PILOT_ROOT='/var/lib/snappymail-data/_data_/_default_/plugins'
PILOT_OWNER='www-data'
PILOT_GROUP='www-data'
PILOT_APPLY=0
while (($#)); do
    case "$1" in
        --root|--source|--owner|--group)
            (($# >= 2)) || fail "Missing value for $1"
            case "$1" in
                --root) PILOT_ROOT="$2";; --source) PILOT_SOURCE="$2";;
                --owner) PILOT_OWNER="$2";; --group) PILOT_GROUP="$2";;
            esac
            shift 2;;
        --apply) PILOT_APPLY=1; shift;;
        *) fail 'Usage: bash scripts/deploy.sh [--root ABSOLUTE_PLUGIN_ROOT] [--source RELEASE_DIR] [--owner USER] [--group GROUP] [--apply]';;
    esac
done
resolve_target "$PILOT_ROOT"
command -v rsync >/dev/null || fail 'Install rsync first.'
[[ -d "$PILOT_SOURCE" ]] || fail 'Build the release with npm run package first.'
PILOT_SOURCE="$(cd -- "$PILOT_SOURCE" && pwd -P)"
[[ "$PILOT_SOURCE" != "$PILOT_TARGET" && "$PILOT_SOURCE" != "$PILOT_TARGET/"* ]] || fail 'Release source must be outside the target.'
[[ -f "$PILOT_SOURCE/index.php" ]] || fail 'Build the release with npm run package first.'
[[ -z "$(find "$PILOT_SOURCE" -type l -print -quit)" ]] || fail 'Release source contains symlinks.'
for path in "$PILOT_SOURCE"/* "$PILOT_SOURCE"/.[!.]* "$PILOT_SOURCE"/..?*; do
    [[ -e "$path" ]] || continue
    case "${path##*/}" in index.php|lib|js|css|LICENSE|README.md|DEPLOY.md|docs) ;; *) fail "Unexpected release file: $path";; esac
done
for file in index.php lib/Service.php lib/OpenAICompatibleProvider.php js/commands.js js/editor.js js/ui.js js/SnappyPilot.js css/snappy-pilot.css LICENSE README.md; do
    [[ -f "$PILOT_SOURCE/$file" ]] || fail "Incomplete release: $file"
done
printf 'SnappyPilot target: %s\nOwner/group: %s:%s\n' "$PILOT_TARGET" "$PILOT_OWNER" "$PILOT_GROUP"
if (( ! PILOT_APPLY )); then
    printf 'Dry run: rerun with --apply after review. Disable SnappyPilot in Admin before updating.\n'
    rsync -rnic --delete -- "$PILOT_SOURCE/" "$PILOT_TARGET/"
    exit 0
fi
id "$PILOT_OWNER" >/dev/null || fail 'Unknown file owner.'
mkdir -p -- "$PILOT_TARGET"
rsync -ric --delete -- "$PILOT_SOURCE/" "$PILOT_TARGET/"
# Only this validated plugin tree receives ownership/mode changes.
chown -R "$PILOT_OWNER:$PILOT_GROUP" "$PILOT_TARGET"
find "$PILOT_TARGET" -type d -exec chmod 0750 {} +
find "$PILOT_TARGET" -type f -exec chmod 0640 {} +
printf 'Installed. Enable/configure SnappyPilot under Admin → Extensions, then reload the webmail page.\nNo cache or core files were changed. See DEPLOY.md for cache refresh guidance.\n'
