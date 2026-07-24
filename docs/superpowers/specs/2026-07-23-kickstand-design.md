# Kickstand — Design Spec

Date: 2026-07-23

## Overview

Kickstand is a browser extension companion for Kick.com (modeled on "Gumbo:
Twitch Companion"). Users manually track Kick channels by slug, see who's
live at a glance from the toolbar, get notified when a tracked channel goes
live, and browse top live streams/categories. Manifest V3, cross-browser
(Chrome + Firefox), built with WXT, TypeScript + React for the popup.

## Repo Structure

Two independent folders, no workspace linking — the extension (WXT/pnpm) and
the Worker (Wrangler) are separate deploy targets with different toolchains
and lifecycles. The small set of shared Kick API response shapes (~5
interfaces) is duplicated as plain type files in each project rather than
extracted into a shared package.

```
kickstand/
├── extension/
│   ├── wxt.config.ts
│   ├── entrypoints/
│   │   ├── background.ts
│   │   └── popup/
│   ├── lib/
│   │   ├── kick-api.ts
│   │   ├── auth.ts
│   │   ├── storage.ts
│   │   └── types.ts
│   ├── public/icons/        # generated placeholder icon set (16/32/48/128)
│   └── package.json
├── worker/
│   ├── src/index.ts
│   ├── wrangler.toml
│   └── package.json
├── docs/superpowers/specs/
└── README.md
```

Package manager: pnpm. Testing: Vitest, unit tests on `lib/` only (no E2E
for this MVP).

## Kick API Reference (from api.kick.com/swagger/doc.yaml)

- OAuth token: `POST https://id.kick.com/oauth/token` — form params
  `grant_type` (`authorization_code` | `refresh_token`), `client_id`,
  `client_secret`, `code`/`redirect_uri` or `refresh_token`. Response:
  `access_token`, `token_type`, `expires_in`, `refresh_token`,
  `refresh_expires_in`, `scope`.
- `GET /public/v1/channels` — `slug` (array, max 50) or
  `broadcaster_user_id` (array, max 50), not both. Returns
  `broadcaster_user_id`, `slug`, `stream_title`, `category`, `stream`
  (`is_live`, `viewer_count`, `thumbnail`, ...).
- `GET /public/v1/users/livestreams` — `user_id` (array, max 100). Returns
  `LivestreamV2[]`: `id`, `broadcaster_user`, `channel.slug`, `title`,
  `category`, `thumbnail`, `started_at`, `viewer_count`,
  `has_mature_content`, `language_code`, `tags`.
- `GET /public/v2/livestreams` — `category_id[]` (max 25),
  `language_code[]` (max 25), `limit` (default 100, max 1000), `cursor`.
  Returns paginated `LivestreamV2[]`.
- `GET /public/v2/categories` — `cursor`, `limit` (default 25, max 1000),
  `name[]`, `tag[]`, `id[]`. Returns paginated `CategoryWithTags[]`
  (`id`, `name`, `thumbnail`, `tags`).
- All five endpoints accept either a `UserAccessToken` or an
  `AppAccessToken` (client_credentials) — no user-specific scope required
  for read-only tracking/discovery.

**Constraint (explicit):** there is no followed-channels endpoint in the
public API. Kickstand does not scrape or work around this — including not
using undocumented internal endpoints such as `kick.com/api/v2/channels/followed`
(this was considered and explicitly rejected; see Decisions below). Tracked
channels are added manually by slug. The tracked-channels store is designed
so a followed-channels sync can be added later if/when Kick ships an
official endpoint.

## Auth: OAuth 2.1 + PKCE (required upfront)

Even though the read endpoints above work with an app-only token, the MVP
gates the popup behind a full user login (per explicit decision — sets up
naturally for future user-scoped features like a real followed-channels
sync).

1. User clicks "Log in with Kick" → extension generates PKCE
   `code_verifier`/`code_challenge`, calls
   `chrome.identity.launchWebAuthFlow` against
   `id.kick.com/oauth/authorize` with the extension's
   `https://<ext-id>.chromiumapp.org/` redirect URI.
2. Kick redirects back with `code` → extension POSTs
   `{ code, code_verifier, redirect_uri }` to Worker `POST /token`.
3. Worker attaches `client_id`/`client_secret` (env vars), forwards
   `grant_type=authorization_code` to `id.kick.com/oauth/token`, returns the
   token response as-is.
4. Extension stores tokens in `chrome.storage.local`.
5. `lib/auth.ts` checks `expiresAt` before each API call (2 min buffer);
   refreshes via Worker `POST /refresh` if needed. Repeated failure after
   refresh clears auth state and the popup falls back to logged-out.

**Worker** (`/worker`, stateless, no KV/persistence):
- `POST /token` — `{ code, code_verifier, redirect_uri }` → proxies
  `authorization_code` grant.
- `POST /refresh` — `{ refresh_token }` → proxies `refresh_token` grant.
- Env vars/secrets: `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI` (via
  `wrangler secret put`). CORS restricted to the extension's origin
  (`chrome-extension://<id>` / `moz-extension://<id>`).
- `CLIENT_ID`/`REDIRECT_URI` are placeholders until a real Kick OAuth app is
  registered; documented in the README.

## Data Model

`chrome.storage.sync` (small, user-authored, cross-device):

```ts
interface TrackedChannel {
  broadcasterUserId: number;
  slug: string;
  addedAt: number;
  muted: boolean;
}
interface Settings {
  pollingIntervalMinutes: number; // default 1 (~60-90s via alarms)
  notificationsEnabled: boolean;
}
```

`chrome.storage.local` (larger, device-local, machine-generated):

```ts
interface LiveStatusCache {
  [broadcasterUserId: number]: {
    isLive: boolean;
    viewerCount: number;
    category: { id: number; name: string } | null;
    thumbnail: string | null;
    title: string;
    lastCheckedAt: number;
    lastError?: string;
  };
}
interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
}
```

## Background Polling & Notifications

`entrypoints/background.ts`:

- On install/startup, create `chrome.alarms` alarm `kickstand-poll` using
  `Settings.pollingIntervalMinutes`.
- Alarm handler: ensure valid token (refresh if needed, skip if logged
  out) → read `TrackedChannel[]` → batch `broadcasterUserId`s into groups of
  ≤100 → `GET /public/v1/users/livestreams` per batch → diff against
  previous `LiveStatusCache` → fire `chrome.notifications.create` for each
  `false→true` transition where `muted` is false → write updated cache →
  update toolbar badge (`chrome.action.setBadgeText`) with live count.
- `chrome.runtime.onMessage` `poll-now` action lets the popup trigger an
  immediate poll (manual refresh), debounced against the alarm.
- `chrome.storage.onChanged` on the tracked list resolves newly-added slugs
  → `broadcaster_user_id` via `GET /public/v1/channels` (batches ≤50)
  before the next poll needs it.
- A failed batch preserves the last-known cache entries and stamps
  `lastError`/`lastCheckedAt` rather than wiping state. A 401 triggers one
  refresh-and-retry; repeated 401 clears auth state.

## Popup UI

`entrypoints/popup/`:

- `App.tsx` — logged-out screen (login button) vs tab bar + active tab.
- Tabs: **Following**, **Browse**, **Categories** (local state, no router).
- **Following** — reads `TrackedChannel[]` (sync) + `LiveStatusCache`
  (local) directly, no network call on open. Live-first sort (viewer count
  desc), then offline. Row: thumbnail, slug, category, viewer count,
  mute toggle, remove. "Add channel" input resolves slug via
  `/public/v1/channels` on submit; inline error if not found.
- **Browse** — `GET /public/v2/livestreams`, cursor pagination ("load
  more"), optional category filter, fetched on demand.
- **Categories** — `GET /public/v2/categories`, cursor pagination, grid of
  thumbnails; clicking jumps to Browse filtered by `category_id`.
- Clicking any card opens `https://kick.com/{slug}` in a new tab.
- Settings (gear icon): polling interval, notifications toggle, tracked
  channel management (remove/mute), logout.
- Styling: plain CSS modules, no UI framework.

## Error Handling

All Kick API calls go through `lib/kick-api.ts`, which normalizes errors
(network / 401 / 429 / other) so background and popup handle them the same
way. Browse/Categories fetch failures show inline retry. Add-channel
slug-not-found shows inline validation error. Auth failure mid-use bounces
the popup to the login screen.

## Testing

Vitest unit tests only, covering `lib/`:
- `auth.ts` — expiry detection, refresh-before-expiry, refresh-failure
  handling.
- `kick-api.ts` — ID batching (≤100 / ≤50 chunking), error normalization.
- `storage.ts` — schema read/write helpers, live-status diffing (the
  transition logic that drives notifications).

Popup/background wiring verified manually via `pnpm dev` (WXT live reload).

## README Requirements

- Setup (pnpm install, dev commands for both `extension/` and `worker/`).
- Loading the extension unpacked in Chrome and Firefox.
- Registering a Kick OAuth app (client_id, redirect URI) and where those
  placeholders live.
- Deploying the Cloudflare Worker (`wrangler secret put` for
  `CLIENT_SECRET`, `wrangler deploy`), and pointing the extension at the
  deployed Worker URL.

## Decisions Log

- **Auth scope for MVP:** user OAuth+PKCE required upfront, even though the
  read endpoints work with an app-only token — chosen to set up naturally
  for future user-scoped features (real followed-channels sync, etc.).
- **Worker statelessness:** stateless proxy, no KV — tokens live in
  `chrome.storage.local` on the extension side only.
- **Followed-channels sync via undocumented endpoint:** considered
  (`kick.com/api/v2/channels/followed`, found via browser devtools) and
  explicitly rejected. It's an internal, undocumented, unversioned
  endpoint on `kick.com` (not the public `api.kick.com`), authenticated
  with a website session token not obtainable through the public OAuth
  flow — using it would require a content script extracting session state
  from the user's kick.com session, contradicts the original "don't scrape
  or work around the missing endpoint" constraint, and carries real risk
  (endpoint could change/break anytime, unofficial API use risks
  extension-store review rejection). MVP stays with manual add-by-slug.
- **Repo structure:** two independent folders (`extension/`, `worker/`),
  no pnpm workspace — the shared type surface is small enough that
  duplication is cheaper than monorepo tooling.
