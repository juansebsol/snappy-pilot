# SnappyMail 2.38.2 integration evidence

Inspected from Git tag `v2.38.2`, commit `e345550c7fddfffdda9095deba64e98dc1c59815`. All paths below are upstream, not files to change on a production host.

| Area | Exact source and observed behavior |
|---|---|
| Documented extension API | [`plugins/README.md`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/plugins/README.md) and [`plugins/example/index.php`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/plugins/example/index.php) |
| Loader | [`RainLoop/Plugins/Manager.php`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/snappymail/v/0.0.0/app/libraries/RainLoop/Plugins/Manager.php): `snappy-pilot` resolves to `SnappyPilotPlugin`, loads `index.php`, then calls `Init()` |
| Registration | [`AbstractPlugin.php`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/snappymail/v/0.0.0/app/libraries/RainLoop/Plugins/AbstractPlugin.php): `addJs`, `addCss`, `addJsonHook`, `addHook`, `jsonParam`, `jsonResponse`; `addTemplate` inspected but unnecessary for native DOM UI |
| Settings | [`Property.php`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/snappymail/v/0.0.0/app/libraries/RainLoop/Plugins/Property.php): PASSWORD and `SetEncrypted`; properties are not allowed in JS by default. `FilterAppDataPluginSection` returns only enabled/language |
| Encryption | [`Config/AbstractConfig.php`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/snappymail/v/0.0.0/app/libraries/RainLoop/Config/AbstractConfig.php): `getDecrypted` uses `APP_SALT`; [`Config/Plugin.php`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/snappymail/v/0.0.0/app/libraries/RainLoop/Config/Plugin.php) names `plugin-snappy-pilot.json` |
| Browser requests | [`dev/Common/Plugins.js`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/dev/Common/Plugins.js): `rl.pluginRemoteRequest(callback, action, params, timeout)` prefixes `Plugin`; callback receives `(error, data)` through [`AbstractFetch.js`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/dev/Remote/AbstractFetch.js) |
| Authentication/CSRF/logging | [`ServiceActions.php`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/snappymail/v/0.0.0/app/libraries/RainLoop/ServiceActions.php): ServiceJson validates normal POST token; logs POST after `SetActionParams`, and JSON result after callback. `filter.action-params` is the supported interception point for request-local log-level suppression. Explicit `getAccountFromToken(false)` is still required in plugin |
| Lifecycle | [`dev/Knoin/Knoin.js`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/dev/Knoin/Knoin.js): `rl-view-model.create`, `rl-view-model`, `rl-vm-visible`; [`AbstractViews.js`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/dev/Knoin/AbstractViews.js) supplies `viewModelTemplateID`, `viewModelDom`, `modalVisible` |
| Compose | [`dev/View/Popup/Compose.js`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/dev/View/Popup/Compose.js): template `Compose`, `oEditor`, `editorArea`, subject/to/cc, `aDraftInfo`, `draftUid`, `bFromDraft`, `mailvelope`; original `oLastMessage` is module-private and is not accessed by plugin |
| Editor wrapper | [`dev/Common/HtmlEditor.js`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/dev/Common/HtmlEditor.js): creates SquireUI asynchronously and owns its `.editor`; whole `setHtml` resets signature state, so plugin does not use it for applying suggestions |
| Squire UI | [`dev/External/SquireUI.js`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/dev/External/SquireUI.js): `squire-toolbar` fires with `{squire: this, actions}` before toolbar/editor DOM append. `.squire`, `.plain`, `.container`, `.mode` already exist. Signature marker is `div.rl-signature` |
| Squire engine | [`vendors/squire2/dist/squire-raw.js`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/vendors/squire2/dist/squire-raw.js): actual shipped implementation; `getRoot`, `getSelection`, `setSelection`, `getHTML`, `saveUndoState`, `insertPlainText`, `undo`. Plain insertion escapes text and internally uses the range-aware HTML insertion path |
| Message/thread | [`dev/View/User/MailBox/MessageView.js`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/dev/View/User/MailBox/MessageView.js), [`dev/Model/Message.js`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/dev/Model/Message.js), [`dev/Stores/User/Message.js`](https://github.com/the-djmaze/snappymail/blob/v2.38.2/dev/Stores/User/Message.js): `MailMessageView.message` is observable; model has UID/folder/plain/body. Thread arrays are IDs/metadata, not an available full-thread body API |

## JSON action

Registered action: `SnappyPilotGenerate`. Browser helper action: `SnappyPilotGenerate`. Network action: `PluginSnappyPilotGenerate`. Manager entry: `DoPluginSnappyPilotGenerate`. PHP callback: `SnappyPilotPlugin::Generate`.

One POST field `Payload` contains a JSON object with `action`, `text`, `context`, `subject`, `to`, `cc`, `instruction`, `language`. Successful responses have `Result: {ok: true, text: "..."}`; safe application errors have `Result: {ok: false, error: "..."}`. Core authentication/token/network failures may also arrive through the callback's error argument.

## Slash and insertion rules

The input listener runs only in the compose Squire root or its plain textarea. A collapsed caret, whitespace-only paragraph/line prefix followed by `/` and up to 35 letters/spaces opens filtering. URL/path slashes and selected text do not trigger it. The command token is removed using the editor API only after command selection. Escape preserves the typed token. The toolbar allows transformation of existing selections without typing a slash.

Opening the instruction form captures a range and full draft snapshot. Whole editable-range selection stops before the earliest signature, quote or immediate quote attribution. Commands requiring ambiguous whole-draft replacement instead require explicit selection. The pending result is discarded on compose hide or cancellation; applying also requires unchanged content and mode. Squire's range-aware plain-text insertion preserves the surrounding HTML and undo history. The palette uses a fixed position within the compose container rather than fragile caret geometry.

## Boundaries that cannot be recovered reliably

Forward formatting is ordinary paragraphs/divs with localized header labels. Plain signatures are raw strings and SquireUI's cached `_prev_txt_sig` is internal; the plugin does not rely on it. The original reply source is private to the compose module. Thread IDs do not expose full message bodies. These are handled using explicit selections, quoted context and matching displayed-message fallback, not DOM/core patches or hidden mailbox requests.

Whole-draft replacement cannot detect every signature pasted from another client. Imported/saved drafts and known forwards use conservative behavior; users should use explicit selection for unusual content. This source inspection establishes API compatibility, not a substitute for the deployment smoke test against the actual production configuration.
