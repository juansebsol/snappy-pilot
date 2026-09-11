#!/usr/bin/env bash
# Shared, read-only target resolution. Source from deploy/uninstall/verify.
set -euo pipefail
fail() { printf '%s\n' "$*" >&2; exit 1; }
resolve_target() {
    local requested="${1%/}"
    [[ "$requested" = /* ]] || fail 'Use an absolute plugin root or destination.'
    if [[ "${requested##*/}" == snappy-pilot ]]; then requested="${requested%/*}"; fi
    [[ -d "$requested" ]] || fail 'The existing writable plugin parent must be a directory.'
    PILOT_PARENT="$(cd -- "$requested" && pwd -P)"
    [[ "$PILOT_PARENT" == "$requested" ]] || fail 'Use the canonical parent path; symlinks and .. are not accepted.'
    [[ "$PILOT_PARENT" == */_data_/_default_/plugins ]] || fail 'Expected the writable _data_/_default_/plugins directory.'
    PILOT_TARGET="$PILOT_PARENT/snappy-pilot"
    [[ ! -L "$PILOT_TARGET" ]] || fail 'Refusing a symlink plugin target.'
    if [[ -e "$PILOT_TARGET" ]]; then
        [[ -d "$PILOT_TARGET" ]] || fail 'The plugin target is not a directory.'
        [[ -z "$(find "$PILOT_TARGET" -type l -print -quit)" ]] || fail 'Remove symlinks from the plugin directory before continuing.'
    fi
}
