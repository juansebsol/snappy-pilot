# Refresh SnappyPilot so you see code changes

SnappyMail does **not** load `js/` and `css/` as separate files in the browser. It compiles them into cached bundles:

- JS → `/?/Plugins/js/0/`
- CSS → embedded in the theme CSS response

After you edit plugin files, invalidate that cache **and** hard-reload the page. A normal refresh is often not enough.

## Fast path (usually enough)

1. Save your changes under  
   `/var/lib/snappymail-data/_data_/_default_/plugins/snappy-pilot/`
2. Bump the plugin version in `index.php` (example: `1.0.6` → `1.0.7`).  
   SnappyMail folds the plugin version into the asset cache hash, so a bump forces a new bundle.
3. In the browser: **hard refresh** the webmail tab  
   - macOS: `Cmd+Shift+R`  
   - Windows/Linux: `Ctrl+Shift+R`
4. Confirm the update (see **Verify** below).

## If it still looks old

1. Open **Admin → About → Clear cache**
2. Hard refresh the user webmail tab again (`Cmd/Ctrl+Shift+R`)
3. If needed, close the tab and open a fresh one (bfcache / an old tab shell can stick)

You should **not** need to manually delete files under `_data_/_default_/cache/` for normal UI updates.

## Verify the new build is live

### A. Browser console

1. Open DevTools → Console
2. Hard refresh
3. Look for: `[SnappyPilot] loaded { enabled: … }`

### B. Unique string in the bundle

Put a temporary unique string in your change (label, console log, hint text), then:

```sh
curl -sS 'https://mail.devmesh.xyz/?/Plugins/js/0/' | grep -o 'YOUR_UNIQUE_STRING\|to summon Pilot'
```

If your string is in that response, the **server** is serving the new JS. If the server has it but the browser does not, hard refresh, clear Admin cache, or use a private window.

### C. Temporary slash-menu probe

For a hard-to-miss check, temporarily add a fake command in `js/SnappyPilot.js`, hard refresh, open `/`, confirm it appears, then remove it and bump the version again.

## What to edit

| Area | Files |
|------|--------|
| Slash commands / menu labels | `js/commands.js`, sometimes `js/SnappyPilot.js` |
| Compose tip / panels | `js/ui.js`, `js/SnappyPilot.js`, `css/snappy-pilot.css` |
| Editor behavior | `js/editor.js` |
| Plugin version / hooks | `index.php` |

After CSS changes, hard refresh matters especially — theme CSS is cached too.

## Notes for this VPS

- Some plugin files are owned by `www-data` and are not writable by `admin` without elevation. `js/SnappyPilot.js` and `index.php` are good places for quick load probes.
- Full production deploys still use `scripts/deploy.sh` (see `DEPLOY.md`). This file is only about **seeing local edits** once they are already on disk in the live plugin folder.
