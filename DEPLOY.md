# Local build and production deployment plan

**No production deployment has been performed.** These instructions affect plugin code only at:

`/var/lib/snappymail-data/_data_/_default_/plugins/snappy-pilot`

SnappyMail 2.38.2 runs at `/var/www/snappymail`, with PHP 8.4 FPM workers as `www-data` behind Caddy. Neither deployment script changes the versioned core, `include.php`, themes, another plugin, or the plugin parent. npm/Node is unnecessary on the VPS.

## Remaining discovery

Before deployment, run these read-only commands on the VPS. They establish parent traversal/permissions, cURL availability and FPM timeout/opcache configuration. No server login address or credentials are needed to build locally; the SSH host and staging directory are only needed when copying the release later.

```sh
stat -c '%A %a %U:%G %n' /var/lib/snappymail-data /var/lib/snappymail-data/_data_ /var/lib/snappymail-data/_data_/_default_ /var/lib/snappymail-data/_data_/_default_/plugins
namei -l /var/lib/snappymail-data/_data_/_default_/plugins
id www-data
command -v php php-fpm8.4 rsync realpath
php -v
php --ri curl
sudo php-fpm8.4 -i | grep -E 'cURL support|Loaded Configuration File|max_execution_time|opcache.validate_timestamps|opcache.revalidate_freq'
sudo grep -R -E '^[[:space:]]*(request_terminate_timeout|php_admin_value\[max_execution_time\])' /etc/php/8.4/fpm/pool.d
```

The script defaults to `www-data:www-data`, directories 0750, files 0640. This lets the FPM account read the isolated plugin; deployment ownership is not assumed to be root. You may choose a dedicated deployment owner with `--owner DEPLOY_USER --group www-data` for read-only FPM access. The script requires authority to create the destination and set only its permissions. It will not repair parent permissions; review discovery results if traversal fails.

No live API call is needed for discovery. Configure your OpenRouter key privately in Admin and choose an available model. The request timeout should fit your existing FPM/Caddy limits. If shorter server limits exist, lower the plugin timeout; this project does not change production service configuration.

## Build locally

From this project directory:

```sh
npm ci
npm test
npm run package
```

The release is `dist/snappy-pilot`. Package creation refuses to overwrite an older release. Keep a previous known-good release in your deliberate local release storage for rollback. Do not put backup copies inside SnappyMail's plugin/data directories.

Copy the release and deployment scripts to a staging directory on the VPS when deployment is approved. The commands below assume the **full project** has been copied to `/tmp/snappypilot-release` with its `dist/snappy-pilot` intact. `/tmp/snappypilot-release` is a staging example, not an inferred existing server directory. No secret belongs in that release. Deployment scripts do not initiate SSH or contact your server themselves.

## Exact deployment command

Review the dry run first, after the files exist in the staging directory:

```sh
cd /tmp/snappypilot-release
sudo bash scripts/deploy.sh --root /var/lib/snappymail-data/_data_/_default_/plugins --owner www-data --group www-data
```

After approval, the exact write command is:

```sh
cd /tmp/snappypilot-release
sudo bash scripts/deploy.sh --root /var/lib/snappymail-data/_data_/_default_/plugins --owner www-data --group www-data --apply
```

The script canonicalizes the existing parent and accepts only the `_data_/_default_/plugins` shape. Symlinks and ambiguous paths are rejected. It validates an allowlisted release, uses rsync only within `snappy-pilot`, and applies permissions to that tree only. `--root` may also receive the full `.../plugins/snappy-pilot` destination. Dry runs do not create directories or alter ownership.

## Enable and configure

In **Admin → Extensions**, enable SnappyPilot and open its settings. Enter `https://openrouter.ai/api/v1`, your OpenRouter API key, and your chosen model ID. Set **Enable SnappyPilot** to on and save. Reload the user webmail page.

Keep the extension enabled while entering, replacing or clearing the key. SnappyPilot suppresses verbose core POST logging for its settings updates only while its hooks are loaded. A disabled extension cannot intercept SnappyMail's logging. Its separate **Enable SnappyPilot** setting may remain off while configuring; that still leaves extension hooks active.

SnappyMail itself writes its normal extension configuration in the data root's configs directory when you use Admin. This is native settings management, separate from deployment: the file is normally `/var/lib/snappymail-data/_data_/_default_/configs/plugin-snappy-pilot.json`. The script neither writes nor deletes that file. The API key uses SnappyMail encryption with `APP_SALT`; normal user AppData contains only enabled/language.

## Exact verification commands

Run the file checks **as the FPM account**:

```sh
cd /tmp/snappypilot-release
sudo -u www-data bash scripts/verify.sh /var/lib/snappymail-data/_data_/_default_/plugins
```

If your staging directory is private to a deployment user, allow `www-data` read/traverse access to the non-secret scripts or run equivalent direct checks:

```sh
sudo -u www-data php -l /var/lib/snappymail-data/_data_/_default_/plugins/snappy-pilot/index.php
sudo -u www-data php -l /var/lib/snappymail-data/_data_/_default_/plugins/snappy-pilot/lib/Service.php
sudo -u www-data php -l /var/lib/snappymail-data/_data_/_default_/plugins/snappy-pilot/lib/OpenAICompatibleProvider.php
sudo -u www-data test -r /var/lib/snappymail-data/_data_/_default_/plugins/snappy-pilot/js/SnappyPilot.js
```

Browser smoke test, using non-sensitive sample content:

1. Sign in and open Compose. Verify **✦ Pilot** exists and typing `/prof` offers Make professional. Escape should leave Compose open.
2. Write a short draft; select one sentence and use Pilot → Fix grammar → Generate. Confirm a preview appears and the rest of the draft remains unchanged until Replace.
3. Replace, then use the normal rich-text Undo. Confirm restoration, signature and quote preservation.
4. Reply to a test email. Generate Draft reply and check that the preview reflects that email. Discard it. Opening another unrelated message should never cause a provider request.
5. Generate, then edit the draft or close Compose before completion. A stale response must not overwrite or appear in another draft.
6. Test plain mode and forwarded drafts with an explicit selection. Confirm cancellation, timeout/provider errors and retry produce a useful result.
7. In browser network tools, inspect `PluginSnappyPilotGenerate`. The request should contain email data only after Generate; no API key should appear in request parameters, page source or user AppData. Do not save sensitive request dumps.
8. Human-review a reply before sending through SnappyMail's existing Send button. SnappyPilot never sends automatically.

## Updates, cache and rollback

Disable SnappyPilot in Admin before replacing files so active requests do not mix release versions. Wait for any generation requests to finish. Package a release with an incremented `VERSION` in `index.php` and matching npm version. Run the same dry run and apply commands, re-enable, then hard reload webmail.

SnappyMail incorporates the plugin class/version into its asset cache hash. A new version plus page reload should invalidate assets. If old assets persist, use **Admin → About → Clear cache** (`AdminClearCache` in 2.38.2) and reload. This clears SnappyMail-managed cache; no manual recursive deletion is prescribed. If FPM opcache is configured never to check timestamps, coordinate its existing reload procedure separately; the scripts never restart FPM or Caddy.

The script updates files in place with `rsync --delete` scoped to the plugin directory, so keep the extension disabled during updates. It does not make silent backup copies. To roll back, deploy a retained known-good release to the same target using `--source /absolute/path/to/previous/snappy-pilot`, then clear the app cache and reload if necessary.

## Exact uninstall command

While the plugin is still installed, clear its API key in Admin and save, then disable the extension. Review the dry run:

```sh
cd /tmp/snappypilot-release
sudo bash scripts/uninstall.sh --root /var/lib/snappymail-data/_data_/_default_/plugins
```

Remove only the validated SnappyPilot code directory:

```sh
sudo bash scripts/uninstall.sh --root /var/lib/snappymail-data/_data_/_default_/plugins --apply
```

Reload webmail, using Admin Clear cache if the toolbar remains. Removal is recoverable by reinstalling a retained release; the uninstall script does not maintain backups. It leaves SnappyMail's own plugin configuration and unrelated settings untouched. Clear/revoke the provider key as appropriate before removal; the script will not delete data outside its authorized plugin target.
