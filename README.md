# SnappyPilot

A compose and reply assistant for **SnappyMail 2.38.2**, using **OpenRouter** by default. Built as a self-contained PHP/vanilla JavaScript plugin. npm provides development checks, browser testing and release packaging; Node.js is not a production dependency.

Implementation targets the exact `v2.38.2` upstream source, commit `e345550c7fddfffdda9095deba64e98dc1c59815`. See [integration evidence](docs/INTEGRATION.md) and [deployment instructions](DEPLOY.md). The local test harness uses the real Squire and SquireUI shipped in that tag, with mocked mail view models and provider requests. A live VPS/provider smoke test is still required before treating the installation as production-verified.

## Using it

Open Compose or Reply. Type `/` at the beginning of a paragraph, optionally after whitespace, or click **✦ Pilot** in the editor toolbar. `/prof` filters to Make professional. Up/Down navigates, Enter selects, Escape closes, and commands can also be clicked. Normal URL/path slashes do not trigger it.

Choose a command, review the scope, add an optional instruction, then choose **Generate**. The panel explains what will be shared with the configured provider. Results are always previews: **Replace/Insert**, **Insert below**, **Try again**, or **Discard**. Nothing is sent as email automatically.

Commands: Draft reply; Reply positively; Decline politely; Improve writing; Make shorter; Make longer; Make professional; Make friendlier; Fix grammar; Translate; Summarize thread; Ask about this email; Custom instruction.

Select text before using the toolbar to transform only that text. With no selection, rich-text transformations use the editable range above the earliest detected signature or quote/attribution. In plain mode, forwarded messages and saved drafts, explicitly select the passage to transform. Information commands show an answer without a Replace button.

## Architecture and files

```text
Browser → rl.pluginRemoteRequest → authenticated plugin JSON action
        → validation → action-specific prompts → Provider → HTTPS API
        ← plain text preview ← bounded, validated response
```

```text
snappy-pilot/
├── index.php                       Plugin bootstrap, settings, authentication
├── lib/
│   ├── Service.php                 Settings, request validation, prompts, Provider
│   └── OpenAICompatibleProvider.php HTTPS transport and response parsing
├── js/
│   ├── commands.js                 Commands and text helpers
│   ├── editor.js                   Squire adapter and context extraction
│   ├── ui.js                       Palette, instruction and result panels
│   └── SnappyPilot.js              Lifecycle and request orchestration
├── css/snappy-pilot.css            Scoped, responsive light/dark styles
├── scripts/
│   ├── check.mjs                   PHP/JS/shell syntax checks
│   ├── php.mjs                     Local PHP executable discovery
│   ├── package.mjs                 Allowlisted release assembly
│   ├── target.sh                   Validated target resolution
│   ├── deploy.sh                   Dry-run-first isolated deployment
│   ├── verify.sh                   Post-install file/runtime checks
│   └── uninstall.sh                Dry-run-first isolated removal
├── tests/
│   ├── backend.php                 Validation, prompts and provider failures
│   ├── upstream.php                Actual SnappyMail loader/API integration
│   ├── commands.test.mjs           Command filtering and UTF-8 bounds
│   ├── deployment.test.mjs         Deployment/uninstall isolation
│   └── browser.mjs                 Actual Squire/SquireUI browser integration
├── docs/
│   ├── INTEGRATION.md              Exact source references and limitations
│   └── VALIDATION.md               Test results and remaining live checks
├── DEPLOY.md
├── README.md
├── LICENSE
├── package.json
└── package-lock.json
```

The release under `dist/snappy-pilot` contains only `index.php`, `lib/`, `js/`, `css/`, `LICENSE`, `README.md`, `DEPLOY.md` and `docs/`. Keep the full project separately for development and deployment scripts. Templates are created as native DOM elements inside the existing compose editor; no Knockout templates or language bundle are required for the English V1 UI.

## OpenRouter setup and settings

Enable the extension in **Admin → Extensions**, open its configuration, and fill in:

| Field | Default / behavior |
|---|---|
| Enable SnappyPilot | Off until configured |
| API base URL | `https://openrouter.ai/api/v1` (without `/chat/completions`) |
| API key | Required; password input, encrypted using SnappyMail's settings mechanism |
| Model ID | Required; copy an exact available `provider/model` ID from OpenRouter |
| Maximum output tokens | 1200; range 64–8192 |
| Temperature | Blank; omitted unless set to 0–2 |
| Default language | English; used when the draft provides no language cue |
| Additional writing preferences | Optional administrator prompt; up to 4000 bytes |
| Request timeout | 45 seconds; range 5–90 |

The provider posts non-streaming chat completions with a bearer token. For OpenRouter it adds `X-OpenRouter-Title: SnappyPilot`; it does not send your site URL. Other compatible HTTPS endpoints can be used by changing the endpoint and model. Compatibility depends on the endpoint supporting chat completions and `max_tokens`. Model IDs are not hardcoded or silently substituted. Temperature is optional for model compatibility.

See [OpenRouter API reference](https://openrouter.ai/docs/api/reference/overview) for the request/response contract and [models](https://openrouter.ai/models) for the current model catalog. Configure spending controls on the provider account; V1 does not implement per-user budgets or server-side rate quotas. All authenticated SnappyMail users can invoke an enabled plugin.

## Editor and context handling

The toolbar event provides `SquireUI`; the adapter uses `ui.squire.getRoot()`, `getSelection()`, `setSelection()`, `getHTML()`, `saveUndoState()` and `insertPlainText()`. Native `Range` objects identify selected/editable text. Squire handles replacing the selected range and escaping generated text. Existing HTML outside that range stays intact. Replaced text may lose its previous inline styling; users can undo rich-text edits with the existing editor Undo command.

`div.rl-signature` and `blockquote` are protected. A preceding attribution paragraph is excluded from whole-draft replacement. Selections crossing protected content are rejected. Forward and saved-draft whole-text transformations are disabled because boundaries cannot be reliably recovered. Plain mode uses the actual `SquireUI.plain` textarea and `setRangeText()` only on an explicit selection or an insertion point. Native undo for this plain-text insertion is not guaranteed; preview and Discard remain available before applying.

For replies, context comes from the current compose quote. If absent, a displayed message is used only when its UID and folder match the compose reply/forward metadata. Subject/To/Cc come from compose observables. Unrelated displayed emails are never included. Transformations send selected/editable text only, without reply context or recipients. Contextual actions may include subject, recipients and a source sender line. No attachments or mailbox-wide fetching. A “thread summary” covers only available quoted/displayed text, not every message with the same subject.

Inputs have byte limits: draft/selection 16 KB, context 24 KB, instruction 4 KB, subject 1 KB, To and Cc 2 KB each, language 100 bytes, request 64 KB. Context is truncated at UTF-8 boundaries with a visible disclosure. Oversized target text is rejected rather than partially transformed. Output is capped at 48 KB and the full provider response at 256 KB. Truncated provider completions are rejected rather than offered as complete drafts.

## Privacy and security

Email data leaves the app only when Generate or Try again is explicitly invoked. The configured provider and its downstream model host process that content according to their policies. Review whether that is appropriate for sensitive email. Email text is treated as untrusted prompt data; V1 exposes no tools, mail actions, or sending capabilities.

The API key remains server-side, encrypted at rest with SnappyMail's `APP_SALT` mechanism and absent from normal user AppData. The native administrator settings UI returns a password placeholder for the saved value and allows replacing it. SnappyMail controls this storage outside the plugin directory. Protect the data root, configuration and salt through existing server permissions and backups.

Generation requires POST plus a valid mail account. SnappyMail's normal JSON transport performs its CSRF-token check. The plugin does not add unauthenticated service routes. Endpoint/key/model are administrator configuration only, never browser request parameters. HTTPS certificate validation is required, redirects are disabled, and cURL has connect/request timeouts and a bounded response buffer. Administrator-selected compatible endpoints are trusted; the plugin does not accept arbitrary user-selected URLs.

No plugin logging is enabled. The `filter.action-params` hook reduces the request-local SnappyMail logger to error level before its POST/result logging for generation and SnappyPilot administrator settings updates. This prevents verbose SnappyMail JSON logs from recording email bodies, suggestions or newly entered keys while the extension is enabled. **Enable the extension before entering/replacing a key, and clear its key before disabling it.** SnappyMail does not initialize disabled plugins, so their hooks cannot suppress core logging; avoid editing credentials on a disabled extension with verbose core logging enabled. Raw provider errors/exceptions are not returned or logged. External proxy/APM request-body logging is outside the plugin's control. All result UI uses `textContent`; Squire's `insertPlainText()` prevents model HTML from executing.

Every insertion checks the editor mode, open/visible state and full draft snapshot. Changes during generation invalidate replacement. Closing/cancelling ignores late callbacks and aborts the browser request. An already-started server/provider request can still finish and consume credits until its timeout.

## Development and testing

Requirements: PHP 8.4 with cURL, Node.js 20+, npm. Browser tests use an installed Google Chrome in an isolated headless profile. No npm package runs in production and no JavaScript bundling is necessary.

```sh
npm ci
npm test
git clone --depth 1 --branch v2.38.2 https://github.com/the-djmaze/snappymail.git /tmp/snappypilot-upstream-2382
SNAPPYMAIL_SOURCE=/tmp/snappypilot-upstream-2382 node scripts/php.mjs tests/upstream.php
SNAPPYMAIL_SOURCE=/tmp/snappypilot-upstream-2382 npm run test:browser
npm run package
```

`npm test` runs `php -l` on PHP files, JavaScript/shell syntax checks, unit checks and backend tests. `PHP_BIN` can override the PHP executable; the runner also recognizes Homebrew PHP 8.4. Upstream tests stub account/transport context but use the real plugin loader/base/settings/logger. Browser tests load the tag's bundled Squire and SquireUI and test the plugin's native lifecycle. Provider tests use injected responses, so no API key or live mail is needed. The real OpenRouter network path and full authenticated mail session require the post-install smoke test.

`npm run package` refuses to overwrite an existing release folder; move the previous release somewhere deliberate before creating a new one. Release versions must be incremented in `index.php` and `package.json` when changing assets because SnappyMail hashes plugin versions for caching.

## Deployment, updates and uninstall

Follow [DEPLOY.md](DEPLOY.md). The confirmed target is `/var/lib/snappymail-data/_data_/_default_/plugins/snappy-pilot`. The deploy script accepts either the existing plugin root or full destination, defaults to a dry run, and requires `--apply` for writes. It updates only SnappyPilot. Disable the extension while updating files, then re-enable and reload. No production system is contacted by the npm scripts.

Uninstall first clears the key and disables SnappyPilot through Admin, then removes only the plugin directory. SnappyMail-managed configuration is retained by the script. Reinstalling the release restores the code. Caches can be refreshed through the existing Admin Clear cache action if needed; no core/theme changes or service restarts are required normally.

## Known limitations and roadmap

V1 supports Squire HTML and conservative plain-mode editing. Source mode, alternative WYSIWYG editors, and Mailvelope compose are excluded. Existing unlocked/decrypted content is not automatically excluded if presented in a normal editor; the explicit Generate disclosure applies. UI strings are English. Caret positioning is deliberately replaced by a stable compose-toolbar anchor. Selection inside a protected quote/signature is not transformable; copy it to editable draft text if that is intended. IME composition does not open the slash menu mid-composition.

Unmarked signatures/imported forward content cannot be reliably identified. Whole-draft behavior assumes the normal SnappyMail-generated HTML structure; explicit selection is the safest option for imported/pasted content. Replacements do not preserve all formatting inside the transformed range. No live provider or full VPS authentication test has been performed as part of local development.

Future additions can implement other `Provider` classes, localized UI, per-user usage controls, richer context sourcing and mailbox search. Mailbox actions, calendar integration, tool calling and autonomous workflows are out of V1 scope and would need explicit approval boundaries.
