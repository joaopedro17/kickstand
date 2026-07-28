# Contributing to Kickstand

This covers the full local dev setup — the Kick OAuth app, the Cloudflare
Worker, loading the extension manually, and how store releases are
published. For the quick version, see the [Build](README.md#build) section
in the README.

## Project structure

- `extension/` — the WXT browser extension (popup, background service
  worker, Kick API client).
- `worker/` — a Cloudflare Worker that proxies the OAuth token exchange so
  `client_secret` never ships inside the extension.

## Install

[link-firefox]: https://addons.mozilla.org/en-US/firefox/addon/kickstand/ 'Version published on Mozilla Add-ons'

[<img src="https://raw.githubusercontent.com/alrra/browser-logos/main/src/firefox/firefox.svg" width="48" alt="Firefox" valign="middle">][link-firefox]
[<img valign="middle" src="https://img.shields.io/amo/v/kickstand.svg?label=%20">][link-firefox]

<img src="https://raw.githubusercontent.com/alrra/browser-logos/main/src/chrome/chrome.svg" width="48" alt="Chrome" valign="middle">
<img valign="middle" src="https://img.shields.io/badge/Chrome%20Web%20Store-pending%20review-lightgrey">

Chrome Web Store listing is awaiting review — build from source and load it
unpacked in the meantime (see [Build](#build) below).

## Build

Requires Node.js 18+ and [pnpm](https://pnpm.io). Kickstand talks to Kick's
OAuth API through a small Cloudflare Worker, so signing in needs a Kick OAuth
app and a running Worker too — full setup (extension key pinning, OAuth
registration, Worker deploy, loading unpacked, store publishing) is in
[CONTRIBUTING.md](CONTRIBUTING.md).

```bash
cd extension
pnpm install
pnpm generate-icons   # once, or after changing scripts/generate-icons.mjs
pnpm dev
```

This opens a Chromium window with Kickstand loaded unpacked and live-reloads
on file changes.

## Tests

```bash
cd extension
pnpm test
```

Unit tests cover `extension/lib/` (auth, Kick API client, storage/diff
logic). Popup and background wiring are verified manually via `pnpm dev`.

## Full setup

### Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io)
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is
  enough) for the Worker
- A Kick OAuth application (see step 2 below)

### 1. Generate a stable extension key

Chrome derives the extension's ID from a public key embedded in the
manifest. Generating one up front keeps the ID (and therefore the OAuth
redirect URI below) identical across every rebuild, instead of a new random
ID on every unpacked reload:

```bash
mkdir -p extension/.secrets
openssl genrsa -out extension/.secrets/extension-key.pem 2048
openssl rsa -in extension/.secrets/extension-key.pem -pubout -outform DER \
  -out extension/.secrets/extension-key-pub.der
openssl base64 -A -in extension/.secrets/extension-key-pub.der \
  -out extension/.secrets/extension-key-pub.b64
```

`extension/.secrets/` is gitignored — keep `extension-key.pem` safe and out
of version control. `wxt.config.ts` reads the `.b64` file and embeds it as
the manifest `key`, so this only needs to be done once per checkout.

### 2. Register a Kick OAuth app

Kickstand needs a `client_id`/`client_secret` pair from Kick's developer
portal (`kick.com/settings/developer`), with a redirect URI matching your
extension's identity redirect: `https://<extension-id>.chromiumapp.org/` for
Chrome. Build the extension once (see step 5) to compute the ID from the key
you just generated — no need to load it unpacked first.

Once registered, you'll have a `client_id` and `client_secret`.

**Important — the pinned key's ID is a dev-only convenience.** `pnpm zip`
sets `WXT_SKIP_MANIFEST_KEY` for the Chrome build, so the Chrome Web Store
assigns its own ID on first submission rather than deriving one from
`extension-key-pub.b64`. That store-assigned ID (`CHROME_EXTENSION_ID` in
the table below, visible on the Developer Dashboard after the first manual
submission) is permanent and is what real users' `browser.identity.getRedirectURL()`
resolves to — it is what must be registered as the Kick OAuth app's redirect
URI and in `worker/wrangler.toml`'s `ALLOWED_ORIGINS`, not the locally
pinned dev ID. Mixing the two up causes an OAuth `redirect_uri mismatch`
that only reproduces on the published build (Kickstand hit this in its
first Chrome Web Store review).

### 3. Deploy the Cloudflare Worker

```bash
cd worker
pnpm install
pnpm dlx wrangler login
pnpm dlx wrangler secret put CLIENT_ID       # paste your Kick client_id
pnpm dlx wrangler secret put CLIENT_SECRET   # paste your Kick client_secret
```

Edit `worker/wrangler.toml` and set `ALLOWED_ORIGIN` to your extension's
origin (`chrome-extension://<extension-id>` or `moz-extension://<extension-id>`).

Deploy:

```bash
pnpm deploy
```

Note the deployed Worker URL (e.g. `https://kickstand-token-proxy.<you>.workers.dev`).

For local development instead of deploying, copy `.dev.vars.example` to
`.dev.vars`, fill in real values, and run `pnpm dev` (starts on
`http://localhost:8787`).

### 4. Configure the extension

Edit `extension/lib/config.ts`:

```typescript
export const KICK_CLIENT_ID = 'your_kick_client_id';
export const WORKER_BASE_URL = 'https://kickstand-token-proxy.<you>.workers.dev';
```

### 5. Run the extension in dev mode

```bash
cd extension
pnpm install
pnpm generate-icons   # only needed once, or after changing scripts/generate-icons.mjs
pnpm dev
```

This opens a Chromium window with Kickstand loaded unpacked and live-reloads
on file changes.

### 6. Load the extension unpacked manually

**Chrome:**
1. Run `pnpm build` inside `extension/` (outputs to `extension/.output/chrome-mv3/`).
2. Go to `chrome://extensions`, enable "Developer mode".
3. Click "Load unpacked" and select `extension/.output/chrome-mv3/`.

**Firefox:**
1. Run `pnpm build:firefox` inside `extension/` (outputs to
   `extension/.output/firefox-mv3/`).
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click "Load Temporary Add-on" and select any file inside
   `extension/.output/firefox-mv3/` (e.g. `manifest.json`).

## Publishing

Store submissions run through [`.github/workflows/release.yml`](.github/workflows/release.yml),
triggered manually from the Actions tab (`workflow_dispatch`) — it never runs
on a regular push, so shipping a new store version is always a deliberate
click.

The workflow uses WXT's built-in [`wxt submit`](https://wxt.dev/guide/essentials/publishing.html)
command, which can only update an *existing* store listing — the first
submission to each store has to be done manually through that store's
dashboard before any of this can run:

1. **Chrome Web Store**: pay the one-time $5 developer fee and create the
   listing manually via the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. **Firefox Add-ons**: create a developer account and submit the first
   version manually via [addons.mozilla.org](https://addons.mozilla.org/developers/).

Once both exist, run `pnpm wxt submit init` inside `extension/` to generate
a local `.env.submit` (gitignored) with the required credentials, then copy
each value into the repo's GitHub Actions secrets
(Settings → Secrets and variables → Actions):

| Secret | Where it comes from |
| --- | --- |
| `CHROME_EXTENSION_ID` | Chrome Web Store Developer Dashboard, after the first manual submission |
| `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET` | Google Cloud Console OAuth client (Chrome Web Store API enabled) |
| `CHROME_REFRESH_TOKEN` | Generated by `wxt submit init`'s OAuth flow |
| `FIREFOX_EXTENSION_ID` | The add-on's UUID, from its AMO listing after the first manual submission |
| `FIREFOX_JWT_ISSUER` / `FIREFOX_JWT_SECRET` | addons.mozilla.org → Manage API Keys |
