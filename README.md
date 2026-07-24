# Kickstand

A browser extension companion for [Kick.com](https://kick.com) — track
channels by slug, see who's live at a glance, get notified when a tracked
channel goes live, and browse top live streams and categories.

Manifest V3, cross-browser (Chrome + Firefox), built with
[WXT](https://wxt.dev) + TypeScript + React.

## Project structure

- `extension/` — the WXT browser extension (popup, background service
  worker, Kick API client).
- `worker/` — a Cloudflare Worker that proxies the OAuth token exchange so
  `client_secret` never ships inside the extension.

## Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io)
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is
  enough) for the Worker
- A Kick OAuth application (see below)

## 1. Register a Kick OAuth app

Kickstand needs a `client_id`/`client_secret` pair from Kick's developer
portal, with a redirect URI matching your extension's identity redirect
(`https://<extension-id>.chromiumapp.org/` for Chrome — you'll get the
extension ID after loading it unpacked once; you can also generate a
consistent ID ahead of time with a `key` field in the manifest if Kick
requires the URI before install).

Once registered, you'll have a `client_id` and `client_secret`.

## 2. Deploy the Cloudflare Worker

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

## 3. Configure the extension

Edit `extension/lib/config.ts`:

```typescript
export const KICK_CLIENT_ID = 'your_kick_client_id';
export const WORKER_BASE_URL = 'https://kickstand-token-proxy.<you>.workers.dev';
```

## 4. Run the extension in dev mode

```bash
cd extension
pnpm install
pnpm generate-icons   # only needed once, or after changing scripts/generate-icons.mjs
pnpm dev
```

This opens a Chromium window with Kickstand loaded unpacked and live-reloads
on file changes.

## 5. Load the extension unpacked manually

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

## Tests

```bash
cd extension
pnpm test
```

Unit tests cover `extension/lib/` (auth, Kick API client, storage/diff
logic). Popup and background wiring are verified manually via `pnpm dev`.

## Design & implementation plan

- `docs/superpowers/specs/2026-07-23-kickstand-design.md`
- `docs/superpowers/plans/2026-07-23-kickstand-implementation.md`
