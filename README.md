# SnappyPilot

An AI workflow layer for [SnappyMail](https://snappymail.eu/), the lightweight webmail client.

SnappyPilot extends SnappyMail with drafting, rewriting, translation and email context assistance through OpenRouter. The foundation for agentic email orchestration, starting with compose and reply: you review the output and control what gets sent.

PHP + vanilla JavaScript. A self-contained plugin, with no frontend framework or Node.js runtime on the server.

## Install on your VPS

Requires SnappyMail 2.38.2, PHP 8.4 with cURL, Git and sudo access.

After editing the live plugin, see [refresh.md](refresh.md) to force the UI to pick up JS/CSS changes.

You can clone the repo anywhere temporary on the VPS. Use `/tmp/snappy-pilot`, then install the plugin into SnappyMail’s real plugin folder.

Run this **entire block on your VPS**:

```bash
cd /tmp && \
rm -rf snappy-pilot && \
git clone --depth 1 https://github.com/juansebsol/snappy-pilot.git && \
cd snappy-pilot && \
mkdir -p dist/snappy-pilot && \
cp -a index.php lib js css LICENSE README.md DEPLOY.md docs dist/snappy-pilot/ && \
sudo apt-get update && \
sudo apt-get install -y rsync && \
sudo bash scripts/deploy.sh \
  --root /var/lib/snappymail-data/_data_/_default_/plugins \
  --owner www-data \
  --group www-data \
  --apply
```

This clones the repository, assembles the plugin files and installs them here:

```text
/var/lib/snappymail-data/_data_/_default_/plugins/snappy-pilot
```

Open [SnappyMail Admin](https://mail.devmesh.xyz/?admin):

**Extensions → SnappyPilot → Enable**

Then open its settings, enter your **OpenRouter API key** and **model ID**, turn on **Enable SnappyPilot**, and save. The default API base URL is `https://openrouter.ai/api/v1`. Reload webmail.

## Use

In Compose or Reply, type `/` on a new line or click **✦ Pilot**. Draft replies, improve writing, change tone, translate, summarize available email context or give a custom instruction.

Select text to edit just that passage. Choose **Generate**, review the result, then **Replace**, **Insert below** or **Discard**. The API key stays server-side; email content is shared only when you request generation.

## Develop

PHP 8.4, Node.js 20+ and npm:

```bash
npm ci
npm test
npm run package
```

The release goes in `dist/snappy-pilot/`; packaging requires that folder to be absent. Plugin code lives in `index.php`, `lib/`, `js/` and `css/`.

- [Developer guide](docs/DEVELOPMENT.md) — architecture, configuration and test setup.
- [SnappyMail integration](docs/INTEGRATION.md) — verified APIs and editor boundaries.
- [Validation](docs/VALIDATION.md) — test coverage and remaining live checks.
- [Deployment reference](DEPLOY.md) — verification, updates and uninstall.

[MIT license](LICENSE).
