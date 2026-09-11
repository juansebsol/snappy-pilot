#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/target.sh"
PILOT_ROOT='/var/lib/snappymail-data/_data_/_default_/plugins'
PILOT_APPLY=0
while (($#)); do
    case "$1" in
        --root) (($# >= 2)) || fail 'Missing --root value'; PILOT_ROOT="$2"; shift 2;;
        --apply) PILOT_APPLY=1; shift;;
        *) fail 'Usage: bash scripts/uninstall.sh [--root ABSOLUTE_PLUGIN_ROOT] [--apply]';;
    esac
done
resolve_target "$PILOT_ROOT"
[[ -e "$PILOT_TARGET" ]] || { printf 'SnappyPilot is already absent.\n'; exit 0; }
printf 'Remove ONLY: %s\n' "$PILOT_TARGET"
if (( ! PILOT_APPLY )); then printf 'Dry run. Disable SnappyPilot in Admin first, then rerun with --apply.\n'; exit 0; fi
rm -rf -- "$PILOT_TARGET"
printf 'Removed SnappyPilot plugin files. Recover by reinstalling your release.\nSnappyMail-managed configuration (including the key) remains; see DEPLOY.md. Reload webmail.\n'
