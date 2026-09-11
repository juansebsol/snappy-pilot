# Local validation report

Validated with Node.js 24.11.0, PHP 8.4.25 and headless Google Chrome. Production is PHP 8.4.24; local testing matches the PHP 8.4 series, not that exact patch. The upstream checkout is SnappyMail `v2.38.2`, commit `e345550c7fddfffdda9095deba64e98dc1c59815`.

| Check | Result |
|---|---|
| PHP `php -l`, JS `node --check`, shell `bash -n` | Passed across 19 source/test/script files |
| Node test runner | 3 tests passed: command filtering, UTF-8 bounds, deployment/uninstall isolation |
| Backend validation/provider tests | 48 checks passed |
| Actual SnappyMail loader and plugin classes | Passed: class naming/loading, Init, assets, JSON hook, encrypted password setting, AppData allowlist, authentication, disabled state, generation/admin logging suppression |
| Actual bundled Squire and SquireUI browser tests | 28 checks passed |
| npm dependency audit at installation | 0 vulnerabilities reported for the installed lockfile |

Browser coverage includes toolbar lifecycle, no passive provider calls, editable draft boundaries, quote/signature preservation, Squire undo, selected text replacement, literal model HTML, protected selection rejection, stale-result refusal, forward/saved-draft fallback, plain selections, missing editor, Insert below, slash filtering and Enter selection, ordinary URL slashes, preflight/preview/apply, cancellation/late replies, contextual quote use, provider error/retry, Discard and a 390px viewport.

The real-browser screenshot at `test-results/snappypilot-preview.png` shows the plugin running inside the upstream editor harness. It is not a screenshot of the production mailbox. That generated test output is excluded from releases/git.

Deployment testing created an isolated temporary `_data_/_default_/plugins` tree and a neighboring plugin sentinel. Dry run created nothing; install/update touched only SnappyPilot; update removed an obsolete SnappyPilot file; uninstall preserved the parent and neighboring plugin; broad and symlink targets were refused. Test files were then removed from that test-created temporary directory.

The upstream logger emits PHP 8.4 deprecation notices for `E_STRICT` at its own lines 153 and 171 during integration tests. They do not fail the tests and no upstream file was patched. SnappyPilot's own PHP syntax/backend tests pass without those notices.

Not exercised locally: real OpenRouter credentials/billing/model availability, an actual provider timeout/DNS/TLS outage, a full authenticated SnappyMail/IMAP/SMTP session, Debian permissions and FPM/Caddy timeouts, production CSP/theme overrides, other browsers or assistive technologies. Provider failures are tested through injected responses/errors; browser tests mock view-model account state and the remote response while using the actual editor engine. Follow the VPS discovery and smoke test in DEPLOY.md before enabling real usage.
