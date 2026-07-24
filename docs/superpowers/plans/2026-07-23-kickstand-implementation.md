# Kickstand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Kickstand, a Manifest V3 browser extension companion for Kick.com — manual channel tracking with live-status polling/notifications, plus live-stream and category browsing — with a stateless Cloudflare Worker proxying the OAuth token exchange.

**Architecture:** WXT-scaffolded extension (`extension/`) with a React popup and a `chrome.alarms`-driven background service worker; a separate Cloudflare Worker (`worker/`) that injects `client_secret` into `id.kick.com` OAuth calls so the secret never ships in the extension. The two are independent projects with no shared package — the small set of shared Kick API types is duplicated in each.

**Tech Stack:** WXT, TypeScript, React, pnpm, Vitest (+ `@webext-core/fake-browser` via WXT's Vitest plugin), Cloudflare Workers + Wrangler.

## Global Constraints

- Manifest V3, cross-browser (Chrome + Firefox) via WXT.
- OAuth 2.1 + PKCE against `id.kick.com`; `client_secret` lives only in the Worker's environment, never in the extension bundle.
- User login (PKCE) is required upfront in the MVP popup — all tracked-channels/discovery features are gated behind it.
- Channel lookup batches: `slug` array max 50 per `GET /public/v1/channels` call.
- Live-status polling batches: `user_id` array max 100 per `GET /public/v1/users/livestreams` call.
- Polling cadence: `chrome.alarms`, default every 1 minute (60–90s target), configurable in Settings.
- Storage split: `chrome.storage.sync` for `TrackedChannel[]` and `Settings` (small, user-authored); `chrome.storage.local` for `LiveStatusCache` and `AuthTokens` (larger/device-local). Implemented via WXT's `storage.defineItem` (`sync:` / `local:` key prefixes).
- No scraping and no use of undocumented/internal Kick endpoints (e.g. `kick.com/api/v2/*`) for any feature, including followed-channels — tracked channels are manual add-by-slug only.
- Cloudflare Worker is a stateless proxy — no KV, no persistence of tokens server-side.
- Automated tests (Vitest) cover `extension/lib/` only. Popup and background wiring are verified manually via `pnpm dev`.
- `KICK_CLIENT_ID` and the deployed Worker URL are placeholders (`extension/lib/config.ts`) until a real Kick OAuth app is registered — documented in the README.
- Full design context: `docs/superpowers/specs/2026-07-23-kickstand-design.md`.

---

### Task 1: Scaffold WXT extension, manifest config, placeholder icons, minimal popup + alarm skeleton

**Files:**
- Create: `extension/` (via WXT init — package.json, tsconfig.json, wxt.config.ts, entrypoints/)
- Create: `extension/scripts/generate-icons.mjs`
- Create: `extension/public/icons/16.png`, `32.png`, `48.png`, `128.png` (generated)
- Modify: `extension/wxt.config.ts`
- Modify: `extension/entrypoints/background.ts`
- Modify: `extension/entrypoints/popup/App.tsx`

**Interfaces:**
- Produces: a loadable, working extension with `pnpm dev` — popup renders "Kickstand", background service worker fires a `kickstand-poll` alarm every minute and logs it. This is the deliverable every later task builds on.

- [ ] **Step 1: Scaffold the WXT project**

```bash
cd /home/joao/projects/kickstand
pnpm dlx wxt@latest init extension
```

When prompted, choose: template → **React**, package manager → **pnpm**. (If the CLI supports non-interactive flags in your installed version, `pnpm dlx wxt@latest init extension --template react --pm pnpm` skips the prompts.)

- [ ] **Step 2: Configure the manifest**

Replace the contents of `extension/wxt.config.ts`:

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Kickstand',
    description: 'Track Kick.com channels, see who\'s live, and browse streams.',
    permissions: ['storage', 'alarms', 'notifications', 'identity', 'tabs'],
    host_permissions: ['https://api.kick.com/*', 'https://id.kick.com/*'],
    icons: {
      16: 'icons/16.png',
      32: 'icons/32.png',
      48: 'icons/48.png',
      128: 'icons/128.png',
    },
    action: {
      default_icon: {
        16: 'icons/16.png',
        32: 'icons/32.png',
        48: 'icons/48.png',
        128: 'icons/128.png',
      },
    },
  },
});
```

If `wxt init` did not already add `@wxt-dev/module-react` (check `extension/package.json`), install it:

```bash
cd extension
pnpm add -D @wxt-dev/module-react
```

- [ ] **Step 3: Generate placeholder icons**

```bash
cd extension
pnpm add -D sharp
```

Create `extension/scripts/generate-icons.mjs`:

```javascript
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const sizes = [16, 32, 48, 128];
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="24" fill="#53FC18"/>
  <text x="64" y="88" font-family="Arial, sans-serif" font-size="72" font-weight="bold" text-anchor="middle" fill="#0F0F0F">K</text>
</svg>`;

await mkdir('public/icons', { recursive: true });
for (const size of sizes) {
  const buffer = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  await writeFile(`public/icons/${size}.png`, buffer);
}
console.log('Generated icons:', sizes.join(', '));
```

Add a script to `extension/package.json` (`"scripts"` section):

```json
"generate-icons": "node scripts/generate-icons.mjs"
```

Run it:

```bash
pnpm generate-icons
```

Expected: `extension/public/icons/16.png`, `32.png`, `48.png`, `128.png` exist.

- [ ] **Step 4: Minimal popup**

Replace `extension/entrypoints/popup/App.tsx`:

```tsx
export default function App() {
  return (
    <div style={{ width: 320, padding: 16, fontFamily: 'sans-serif' }}>
      <h1>Kickstand</h1>
      <p>Extension scaffold is working.</p>
    </div>
  );
}
```

- [ ] **Step 5: Background alarm skeleton**

Replace `extension/entrypoints/background.ts`:

```typescript
const POLL_ALARM = 'kickstand-poll';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    browser.alarms.create(POLL_ALARM, { periodInMinutes: 1 });
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLL_ALARM) {
      console.log('[kickstand] poll alarm fired', new Date().toISOString());
    }
  });
});
```

- [ ] **Step 6: Verify in dev mode**

```bash
cd extension
pnpm dev
```

Expected: a Chromium window opens with Kickstand loaded unpacked; the popup shows "Kickstand — Extension scaffold is working." Open the extension's service worker console (`chrome://extensions` → Kickstand → "service worker" link) and confirm `[kickstand] poll alarm fired` logs (may take up to a minute for the first firing, or trigger manually from the same page by running `browser.alarms.create('kickstand-poll', {delayInMinutes: 0.01})` in the console).

- [ ] **Step 7: Commit**

```bash
cd /home/joao/projects/kickstand
git add extension
git commit -m "Scaffold WXT extension with minimal popup and background alarm"
```

---

### Task 2: Kick API types, storage module, live-status diff logic

**Files:**
- Create: `extension/lib/types.ts`
- Create: `extension/lib/storage.ts`
- Create: `extension/lib/storage.test.ts`
- Create: `extension/vitest.config.ts`
- Modify: `extension/package.json` (add `test` script + devDependencies)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `TrackedChannel`, `Settings`, `LiveStatusEntry`, `LiveStatusCache`, `AuthTokens` types; `trackedChannelsStorage`, `settingsStorage`, `liveStatusStorage`, `authTokensStorage` (WXT storage items, each with `.getValue()`, `.setValue()`, `.watch()`); `diffLiveTransitions(previous, next): number[]`; `DEFAULT_SETTINGS`. Also `KickCategory`, `KickCategoryWithTags`, `KickChannel`, `KickLivestream`, `PaginatedResponse<T>`, `TokenResponse` from `types.ts`, used by `lib/kick-api.ts` (Task 5) and `lib/auth.ts` (Task 4).

- [ ] **Step 1: Add Vitest**

```bash
cd extension
pnpm add -D vitest
```

Create `extension/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
});
```

Add to `extension/package.json` `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 2: Kick API response types**

Create `extension/lib/types.ts`:

```typescript
export interface KickCategory {
  id: number;
  name: string;
  thumbnail: string;
}

export interface KickCategoryWithTags extends KickCategory {
  tags: string[];
}

export interface KickStreamInfo {
  is_live: boolean;
  viewer_count: number;
  thumbnail: string;
  url: string;
  language?: string;
}

export interface KickChannel {
  broadcaster_user_id: number;
  slug: string;
  stream_title: string;
  category: KickCategory | null;
  stream: KickStreamInfo | null;
}

export interface KickLivestream {
  id: string;
  broadcaster_user: { id: number; username: string; profile_picture: string };
  channel: { slug: string };
  title: string;
  category: KickCategory | null;
  thumbnail: string;
  started_at: string;
  viewer_count: number;
  has_mature_content: boolean;
  language_code: string;
  tags: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { next_cursor: string | null };
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
}
```

- [ ] **Step 3: Write the failing test for the diff logic**

Create `extension/lib/storage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { diffLiveTransitions, type LiveStatusCache } from './storage';

function entry(isLive: boolean): LiveStatusCache[number] {
  return {
    isLive,
    viewerCount: 0,
    category: null,
    thumbnail: null,
    title: '',
    lastCheckedAt: Date.now(),
  };
}

describe('diffLiveTransitions', () => {
  it('flags a channel transitioning from offline to live', () => {
    const previous: LiveStatusCache = { 1: entry(false) };
    const next: LiveStatusCache = { 1: entry(true) };
    expect(diffLiveTransitions(previous, next)).toEqual([1]);
  });

  it('flags a channel with no previous entry that is now live', () => {
    const previous: LiveStatusCache = {};
    const next: LiveStatusCache = { 1: entry(true) };
    expect(diffLiveTransitions(previous, next)).toEqual([1]);
  });

  it('does not flag a channel that was already live', () => {
    const previous: LiveStatusCache = { 1: entry(true) };
    const next: LiveStatusCache = { 1: entry(true) };
    expect(diffLiveTransitions(previous, next)).toEqual([]);
  });

  it('does not flag a channel that is still offline', () => {
    const previous: LiveStatusCache = { 1: entry(false) };
    const next: LiveStatusCache = { 1: entry(false) };
    expect(diffLiveTransitions(previous, next)).toEqual([]);
  });

  it('does not flag a channel going live to offline', () => {
    const previous: LiveStatusCache = { 1: entry(true) };
    const next: LiveStatusCache = { 1: entry(false) };
    expect(diffLiveTransitions(previous, next)).toEqual([]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd extension
pnpm test
```

Expected: FAIL — `./storage` module does not exist yet.

- [ ] **Step 5: Implement the storage module**

Create `extension/lib/storage.ts`:

```typescript
import { storage } from 'wxt/storage';

export interface TrackedChannel {
  broadcasterUserId: number;
  slug: string;
  addedAt: number;
  muted: boolean;
}

export interface Settings {
  pollingIntervalMinutes: number;
  notificationsEnabled: boolean;
}

export interface LiveStatusEntry {
  isLive: boolean;
  viewerCount: number;
  category: { id: number; name: string } | null;
  thumbnail: string | null;
  title: string;
  lastCheckedAt: number;
  lastError?: string;
}

export type LiveStatusCache = Record<number, LiveStatusEntry>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
}

export const DEFAULT_SETTINGS: Settings = {
  pollingIntervalMinutes: 1,
  notificationsEnabled: true,
};

export const trackedChannelsStorage = storage.defineItem<TrackedChannel[]>(
  'sync:trackedChannels',
  { fallback: [] }
);

export const settingsStorage = storage.defineItem<Settings>('sync:settings', {
  fallback: DEFAULT_SETTINGS,
});

export const liveStatusStorage = storage.defineItem<LiveStatusCache>(
  'local:liveStatus',
  { fallback: {} }
);

export const authTokensStorage = storage.defineItem<AuthTokens | null>(
  'local:authTokens',
  { fallback: null }
);

export function diffLiveTransitions(
  previous: LiveStatusCache,
  next: LiveStatusCache
): number[] {
  const wentLive: number[] = [];
  for (const [idStr, entry] of Object.entries(next)) {
    const id = Number(idStr);
    const wasLive = previous[id]?.isLive ?? false;
    if (entry.isLive && !wasLive) {
      wentLive.push(id);
    }
  }
  return wentLive;
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd extension
pnpm test
```

Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
cd /home/joao/projects/kickstand
git add extension
git commit -m "Add Kick API types, WXT storage module, live-status diff logic"
```

---

### Task 3: Cloudflare Worker token proxy

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/wrangler.toml`
- Create: `worker/src/index.ts`
- Create: `worker/.dev.vars.example`

**Interfaces:**
- Consumes: nothing from the extension.
- Produces: `POST /token` (body `{ code, code_verifier, redirect_uri }` → returns Kick's raw token JSON), `POST /refresh` (body `{ refresh_token }` → returns Kick's raw token JSON). Consumed by `extension/lib/auth.ts` (Task 4) via `WORKER_BASE_URL` in `extension/lib/config.ts`.

- [ ] **Step 1: Scaffold the Worker project**

```bash
mkdir -p /home/joao/projects/kickstand/worker/src
cd /home/joao/projects/kickstand/worker
```

Create `worker/package.json`:

```json
{
  "name": "kickstand-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250101.0",
    "typescript": "^5.6.0",
    "wrangler": "^3.90.0"
  }
}
```

Create `worker/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "lib": ["ES2021"],
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Create `worker/wrangler.toml`:

```toml
name = "kickstand-token-proxy"
main = "src/index.ts"
compatibility_date = "2026-07-23"

[vars]
ALLOWED_ORIGIN = "chrome-extension://REPLACE_WITH_EXTENSION_ID"
```

Create `worker/.dev.vars.example` (documents required local secrets; real `.dev.vars` is gitignored):

```
CLIENT_ID=your_kick_client_id
CLIENT_SECRET=your_kick_client_secret
```

- [ ] **Step 2: Install dependencies**

```bash
cd /home/joao/projects/kickstand/worker
pnpm install
```

- [ ] **Step 3: Implement the proxy**

Create `worker/src/index.ts`:

```typescript
export interface Env {
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  ALLOWED_ORIGIN: string;
}

const KICK_TOKEN_URL = 'https://id.kick.com/oauth/token';

function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function proxyTokenRequest(
  body: Record<string, string>,
  env: Env
): Promise<Response> {
  const form = new URLSearchParams({
    ...body,
    client_id: env.CLIENT_ID,
    client_secret: env.CLIENT_SECRET,
  });

  const upstream = await fetch(KICK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env.ALLOWED_ORIGIN),
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env.ALLOWED_ORIGIN) });
    }

    if (request.method === 'POST' && url.pathname === '/token') {
      const { code, code_verifier, redirect_uri } = await request.json<{
        code: string;
        code_verifier: string;
        redirect_uri: string;
      }>();
      return proxyTokenRequest(
        { grant_type: 'authorization_code', code, code_verifier, redirect_uri },
        env
      );
    }

    if (request.method === 'POST' && url.pathname === '/refresh') {
      const { refresh_token } = await request.json<{ refresh_token: string }>();
      return proxyTokenRequest(
        { grant_type: 'refresh_token', refresh_token },
        env
      );
    }

    return new Response('Not found', {
      status: 404,
      headers: corsHeaders(env.ALLOWED_ORIGIN),
    });
  },
};
```

- [ ] **Step 4: Verify locally**

Create a real `worker/.dev.vars` (not committed) with test values:

```
CLIENT_ID=test_client_id
CLIENT_SECRET=test_client_secret
```

```bash
cd /home/joao/projects/kickstand/worker
pnpm dev
```

In another terminal:

```bash
curl -i -X POST http://localhost:8787/token \
  -H "Content-Type: application/json" \
  -d '{"code":"fake","code_verifier":"fake","redirect_uri":"https://example.com"}'
```

Expected: a response proxied from `id.kick.com` (likely a 400 with an OAuth error body, since `fake` isn't a real code) — confirms the Worker is forwarding the request with `client_id`/`client_secret` attached rather than erroring locally.

- [ ] **Step 5: Ignore local secrets and commit**

Create/append `/home/joao/projects/kickstand/.gitignore`:

```
node_modules/
dist/
.wrangler/
.dev.vars
```

```bash
cd /home/joao/projects/kickstand
git add worker .gitignore
git commit -m "Scaffold Cloudflare Worker token proxy (/token, /refresh)"
```

---

### Task 4: Auth module — PKCE login, token refresh, logout

**Files:**
- Create: `extension/lib/config.ts`
- Create: `extension/lib/auth.ts`
- Create: `extension/lib/auth.test.ts`
- Modify: `extension/package.json` (no new deps expected; uses Web Crypto + `fetch`, both available in the extension's Vitest environment via WXT's testing setup)

**Interfaces:**
- Consumes: `AuthTokens`, `authTokensStorage` from `lib/storage.ts` (Task 2); `TokenResponse` from `lib/types.ts` (Task 2); Worker's `/token` and `/refresh` from Task 3.
- Produces: `startLoginFlow(): Promise<AuthTokens>`, `getValidAccessToken(): Promise<string | null>`, `logout(): Promise<void>`, `isTokenExpiringSoon(tokens: AuthTokens, bufferMs?: number): boolean`, `refreshTokens(tokens: AuthTokens): Promise<AuthTokens | null>`. Consumed by `entrypoints/background.ts` (Task 6) and the popup (Tasks 7–8).

- [ ] **Step 1: Config placeholders**

Create `extension/lib/config.ts`:

```typescript
export const KICK_API_BASE = 'https://api.kick.com';
export const KICK_AUTHORIZE_URL = 'https://id.kick.com/oauth/authorize';

// TODO(setup): replace with the client_id from your registered Kick OAuth app.
export const KICK_CLIENT_ID = 'REPLACE_WITH_KICK_CLIENT_ID';

export const KICK_SCOPES = ['user:read', 'channel:read'];

// Points at `wrangler dev` locally; replace with the deployed Worker URL for production builds.
export const WORKER_BASE_URL = 'http://localhost:8787';
```

- [ ] **Step 2: Write the failing tests**

Create `extension/lib/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  isTokenExpiringSoon,
  refreshTokens,
  getValidAccessToken,
  logout,
} from './auth';
import { authTokensStorage, type AuthTokens } from './storage';

function tokens(overrides: Partial<AuthTokens> = {}): AuthTokens {
  return {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: Date.now() + 60 * 60 * 1000,
    refreshExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

describe('isTokenExpiringSoon', () => {
  it('is false when far from expiry', () => {
    expect(isTokenExpiringSoon(tokens())).toBe(false);
  });

  it('is true when within the buffer window', () => {
    expect(
      isTokenExpiringSoon(tokens({ expiresAt: Date.now() + 30 * 1000 }))
    ).toBe(true);
  });

  it('is true when already expired', () => {
    expect(
      isTokenExpiringSoon(tokens({ expiresAt: Date.now() - 1000 }))
    ).toBe(true);
  });
});

describe('refreshTokens', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores and returns refreshed tokens on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'access-2',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'refresh-2',
          refresh_expires_in: 86400,
          scope: 'user:read',
        }),
      })
    );

    const result = await refreshTokens(tokens());
    expect(result?.accessToken).toBe('access-2');
    expect((await authTokensStorage.getValue())?.accessToken).toBe('access-2');
  });

  it('returns null on a failed refresh', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const result = await refreshTokens(tokens());
    expect(result).toBeNull();
  });
});

describe('getValidAccessToken', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when logged out', async () => {
    expect(await getValidAccessToken()).toBeNull();
  });

  it('returns the current token when not expiring soon', async () => {
    await authTokensStorage.setValue(tokens());
    expect(await getValidAccessToken()).toBe('access-1');
  });

  it('refreshes and returns the new token when expiring soon', async () => {
    await authTokensStorage.setValue(tokens({ expiresAt: Date.now() + 1000 }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'access-refreshed',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'refresh-refreshed',
          refresh_expires_in: 86400,
          scope: 'user:read',
        }),
      })
    );
    expect(await getValidAccessToken()).toBe('access-refreshed');
  });

  it('clears tokens and returns null when refresh fails', async () => {
    await authTokensStorage.setValue(tokens({ expiresAt: Date.now() + 1000 }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    expect(await getValidAccessToken()).toBeNull();
    expect(await authTokensStorage.getValue()).toBeNull();
  });
});

describe('logout', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('clears stored tokens', async () => {
    await authTokensStorage.setValue(tokens());
    await logout();
    expect(await authTokensStorage.getValue()).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd extension
pnpm test
```

Expected: FAIL — `./auth` module does not exist yet.

- [ ] **Step 4: Implement the auth module**

Create `extension/lib/auth.ts`:

```typescript
import {
  KICK_AUTHORIZE_URL,
  KICK_CLIENT_ID,
  KICK_SCOPES,
  WORKER_BASE_URL,
} from './config';
import { authTokensStorage, type AuthTokens } from './storage';
import type { TokenResponse } from './types';

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateRandomToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array.buffer);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

function toAuthTokens(response: TokenResponse): AuthTokens {
  const now = Date.now();
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: now + response.expires_in * 1000,
    refreshExpiresAt: now + response.refresh_expires_in * 1000,
  };
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<TokenResponse> {
  const res = await fetch(`${WORKER_BASE_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: codeVerifier, redirect_uri: redirectUri }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json();
}

export async function startLoginFlow(): Promise<AuthTokens> {
  const verifier = generateRandomToken();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateRandomToken();
  const redirectUri = browser.identity.getRedirectURL();

  const authUrl = new URL(KICK_AUTHORIZE_URL);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', KICK_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', KICK_SCOPES.join(' '));
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);

  const responseUrl = await browser.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  });
  if (!responseUrl) throw new Error('Login was cancelled');

  const redirected = new URL(responseUrl);
  const code = redirected.searchParams.get('code');
  const returnedState = redirected.searchParams.get('state');
  if (!code) throw new Error('No authorization code returned');
  if (returnedState !== state) throw new Error('OAuth state mismatch');

  const tokenResponse = await exchangeCodeForTokens(code, verifier, redirectUri);
  const tokens = toAuthTokens(tokenResponse);
  await authTokensStorage.setValue(tokens);
  return tokens;
}

export function isTokenExpiringSoon(
  tokens: AuthTokens,
  bufferMs = 2 * 60 * 1000
): boolean {
  return Date.now() >= tokens.expiresAt - bufferMs;
}

export async function refreshTokens(
  tokens: AuthTokens
): Promise<AuthTokens | null> {
  try {
    const res = await fetch(`${WORKER_BASE_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refreshToken }),
    });
    if (!res.ok) return null;
    const tokenResponse: TokenResponse = await res.json();
    const refreshed = toAuthTokens(tokenResponse);
    await authTokensStorage.setValue(refreshed);
    return refreshed;
  } catch {
    return null;
  }
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await authTokensStorage.getValue();
  if (!tokens) return null;
  if (!isTokenExpiringSoon(tokens)) return tokens.accessToken;

  const refreshed = await refreshTokens(tokens);
  if (!refreshed) {
    await authTokensStorage.setValue(null);
    return null;
  }
  return refreshed.accessToken;
}

export async function logout(): Promise<void> {
  await authTokensStorage.setValue(null);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd extension
pnpm test
```

Expected: PASS (all `auth.test.ts` and `storage.test.ts` tests).

- [ ] **Step 6: Commit**

```bash
cd /home/joao/projects/kickstand
git add extension
git commit -m "Add PKCE auth module: login flow, token refresh, logout"
```

---

### Task 5: Kick API client — channel resolution, live-status batching, discovery

**Files:**
- Create: `extension/lib/kick-api.ts`
- Create: `extension/lib/kick-api.test.ts`

**Interfaces:**
- Consumes: `KickChannel`, `KickLivestream`, `KickCategoryWithTags`, `PaginatedResponse<T>` from `lib/types.ts` (Task 2); `KICK_API_BASE` from `lib/config.ts` (Task 4).
- Produces: `chunk<T>(items: T[], size: number): T[][]`; `KickApiError` (class, with `kind: 'network' | 'unauthorized' | 'rate-limited' | 'other'` and `status?: number`); `resolveChannelsBySlug(slugs: string[], accessToken: string): Promise<KickChannel[]>`; `fetchLivestreamsForUsers(userIds: number[], accessToken: string): Promise<KickLivestream[]>`; `fetchLivestreams(params: { categoryId?: number[]; cursor?: string; limit?: number }, accessToken: string): Promise<PaginatedResponse<KickLivestream>>`; `fetchCategories(params: { cursor?: string; limit?: number; name?: string[] }, accessToken: string): Promise<PaginatedResponse<KickCategoryWithTags>>`. Consumed by `entrypoints/background.ts` (Task 6), Following tab (Task 8), Browse tab (Task 9), Categories tab (Task 10).

- [ ] **Step 1: Write the failing tests**

Create `extension/lib/kick-api.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  chunk,
  KickApiError,
  resolveChannelsBySlug,
  fetchLivestreamsForUsers,
  fetchLivestreams,
  fetchCategories,
} from './kick-api';

describe('chunk', () => {
  it('splits an array into groups of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single chunk when smaller than the size', () => {
    expect(chunk([1, 2], 100)).toEqual([[1, 2]]);
  });

  it('returns an empty array for empty input', () => {
    expect(chunk([], 10)).toEqual([]);
  });
});

describe('kick-api requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolveChannelsBySlug batches slugs into groups of 50 and merges results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ broadcaster_user_id: 1, slug: 'a' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const slugs = Array.from({ length: 60 }, (_, i) => `slug-${i}`);
    const result = await resolveChannelsBySlug(slugs, 'token');

    expect(fetchMock).toHaveBeenCalledTimes(2); // 60 slugs -> batches of 50 + 10
    expect(result).toHaveLength(2);
  });

  it('fetchLivestreamsForUsers batches ids into groups of 100', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const ids = Array.from({ length: 150 }, (_, i) => i);
    await fetchLivestreamsForUsers(ids, 'token');

    expect(fetchMock).toHaveBeenCalledTimes(2); // 150 ids -> batches of 100 + 50
  });

  it('fetchLivestreams passes category/cursor/limit as query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [], pagination: { next_cursor: null } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchLivestreams({ categoryId: [10, 20], cursor: 'abc', limit: 50 }, 'token');

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe('/public/v2/livestreams');
    expect(calledUrl.searchParams.getAll('category_id')).toEqual(['10', '20']);
    expect(calledUrl.searchParams.get('cursor')).toBe('abc');
    expect(calledUrl.searchParams.get('limit')).toBe('50');
  });

  it('fetchCategories hits /public/v2/categories', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [], pagination: { next_cursor: null } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchCategories({ limit: 25 }, 'token');

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe('/public/v2/categories');
  });

  it('throws KickApiError with kind "unauthorized" on a 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    );
    await expect(fetchLivestreamsForUsers([1], 'token')).rejects.toMatchObject(
      new KickApiError('unauthorized', 'x', 401)
    );
  });

  it('throws KickApiError with kind "rate-limited" on a 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) })
    );
    await expect(fetchLivestreamsForUsers([1], 'token')).rejects.toMatchObject({
      kind: 'rate-limited',
    });
  });

  it('throws KickApiError with kind "network" when fetch itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(fetchLivestreamsForUsers([1], 'token')).rejects.toMatchObject({
      kind: 'network',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd extension
pnpm test
```

Expected: FAIL — `./kick-api` module does not exist yet.

- [ ] **Step 3: Implement the Kick API client**

Create `extension/lib/kick-api.ts`:

```typescript
import { KICK_API_BASE } from './config';
import type {
  KickCategoryWithTags,
  KickChannel,
  KickLivestream,
  PaginatedResponse,
} from './types';

export type KickApiErrorKind = 'network' | 'unauthorized' | 'rate-limited' | 'other';

export class KickApiError extends Error {
  kind: KickApiErrorKind;
  status?: number;

  constructor(kind: KickApiErrorKind, message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

type QueryParams = Record<string, string | number | string[] | number[] | undefined>;

async function kickFetch<T>(
  path: string,
  params: QueryParams,
  accessToken: string
): Promise<T> {
  const url = new URL(`${KICK_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(key, String(v));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new KickApiError('network', 'Network request failed');
  }

  if (response.status === 401) {
    throw new KickApiError('unauthorized', 'Access token rejected', 401);
  }
  if (response.status === 429) {
    throw new KickApiError('rate-limited', 'Rate limited', 429);
  }
  if (!response.ok) {
    throw new KickApiError('other', `Request failed with status ${response.status}`, response.status);
  }

  return response.json();
}

export async function resolveChannelsBySlug(
  slugs: string[],
  accessToken: string
): Promise<KickChannel[]> {
  const results: KickChannel[] = [];
  for (const batch of chunk(slugs, 50)) {
    const res = await kickFetch<{ data: KickChannel[] }>(
      '/public/v1/channels',
      { slug: batch },
      accessToken
    );
    results.push(...res.data);
  }
  return results;
}

export async function fetchLivestreamsForUsers(
  userIds: number[],
  accessToken: string
): Promise<KickLivestream[]> {
  const results: KickLivestream[] = [];
  for (const batch of chunk(userIds, 100)) {
    const res = await kickFetch<{ data: KickLivestream[] }>(
      '/public/v1/users/livestreams',
      { user_id: batch },
      accessToken
    );
    results.push(...res.data);
  }
  return results;
}

export async function fetchLivestreams(
  params: { categoryId?: number[]; cursor?: string; limit?: number },
  accessToken: string
): Promise<PaginatedResponse<KickLivestream>> {
  return kickFetch<PaginatedResponse<KickLivestream>>(
    '/public/v2/livestreams',
    { category_id: params.categoryId, cursor: params.cursor, limit: params.limit },
    accessToken
  );
}

export async function fetchCategories(
  params: { cursor?: string; limit?: number; name?: string[] },
  accessToken: string
): Promise<PaginatedResponse<KickCategoryWithTags>> {
  return kickFetch<PaginatedResponse<KickCategoryWithTags>>(
    '/public/v2/categories',
    { cursor: params.cursor, limit: params.limit, name: params.name },
    accessToken
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd extension
pnpm test
```

Expected: PASS (all `kick-api.test.ts` tests, plus previously-passing `storage.test.ts` and `auth.test.ts`).

- [ ] **Step 5: Commit**

```bash
cd /home/joao/projects/kickstand
git add extension
git commit -m "Add Kick API client: channel resolution, livestream batching, discovery"
```

---

### Task 6: Background polling loop — live status, notifications, badge

**Files:**
- Modify: `extension/entrypoints/background.ts`

**Interfaces:**
- Consumes: `getValidAccessToken` from `lib/auth.ts` (Task 4); `fetchLivestreamsForUsers`, `KickApiError` from `lib/kick-api.ts` (Task 5); `trackedChannelsStorage`, `settingsStorage`, `liveStatusStorage`, `diffLiveTransitions`, `LiveStatusCache`, `LiveStatusEntry` from `lib/storage.ts` (Task 2).
- Produces: `pollNow(): Promise<void>` (exported for the `poll-now` runtime message and reused by the alarm handler). No new consumers within this plan, but this is the function a manual "Refresh" button in the popup would call via `browser.runtime.sendMessage({ type: 'poll-now' })`.
- Note: this task has no automated test per the spec's testing scope (background/popup wiring is manually verified) — this is a deliberate scope decision from the design doc, not a skipped step.

- [ ] **Step 1: Implement the full polling loop**

Replace `extension/entrypoints/background.ts`:

```typescript
import { getValidAccessToken } from '@/lib/auth';
import { fetchLivestreamsForUsers, chunk } from '@/lib/kick-api';
import {
  trackedChannelsStorage,
  settingsStorage,
  liveStatusStorage,
  diffLiveTransitions,
  type LiveStatusCache,
  type LiveStatusEntry,
} from '@/lib/storage';

const POLL_ALARM = 'kickstand-poll';

function emptyEntry(): LiveStatusEntry {
  return {
    isLive: false,
    viewerCount: 0,
    category: null,
    thumbnail: null,
    title: '',
    lastCheckedAt: 0,
  };
}

async function setupAlarm(): Promise<void> {
  const settings = await settingsStorage.getValue();
  await browser.alarms.create(POLL_ALARM, {
    periodInMinutes: settings.pollingIntervalMinutes,
  });
}

export async function pollNow(): Promise<void> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    await browser.action.setBadgeText({ text: '' });
    return;
  }

  const tracked = await trackedChannelsStorage.getValue();
  if (tracked.length === 0) {
    await browser.action.setBadgeText({ text: '' });
    return;
  }

  const previous = await liveStatusStorage.getValue();
  const next: LiveStatusCache = { ...previous };
  const ids = tracked.map((c) => c.broadcasterUserId);

  for (const batch of chunk(ids, 100)) {
    try {
      const livestreams = await fetchLivestreamsForUsers(batch, accessToken);
      for (const id of batch) {
        const stream = livestreams.find((l) => l.broadcaster_user.id === id);
        next[id] = stream
          ? {
              isLive: true,
              viewerCount: stream.viewer_count,
              category: stream.category,
              thumbnail: stream.thumbnail,
              title: stream.title,
              lastCheckedAt: Date.now(),
            }
          : {
              ...(previous[id] ?? emptyEntry()),
              isLive: false,
              lastCheckedAt: Date.now(),
            };
      }
    } catch (err) {
      for (const id of batch) {
        next[id] = {
          ...(previous[id] ?? emptyEntry()),
          lastError: err instanceof Error ? err.message : String(err),
          lastCheckedAt: Date.now(),
        };
      }
    }
  }

  const wentLive = diffLiveTransitions(previous, next);
  const settings = await settingsStorage.getValue();
  if (settings.notificationsEnabled) {
    for (const id of wentLive) {
      const channel = tracked.find((c) => c.broadcasterUserId === id);
      if (channel && !channel.muted) {
        await browser.notifications.create(`kickstand-live-${id}`, {
          type: 'basic',
          iconUrl: browser.runtime.getURL('/icons/128.png'),
          title: `${channel.slug} is live!`,
          message: next[id].category?.name ?? 'Streaming now on Kick',
        });
      }
    }
  }

  await liveStatusStorage.setValue(next);
  const liveCount = Object.values(next).filter((e) => e.isLive).length;
  await browser.action.setBadgeText({ text: liveCount > 0 ? String(liveCount) : '' });
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => setupAlarm());
  browser.runtime.onStartup.addListener(() => setupAlarm());
  settingsStorage.watch(() => setupAlarm());

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLL_ALARM) pollNow();
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'poll-now') return pollNow();
  });
});
```

- [ ] **Step 2: Manual verification**

```bash
cd extension
pnpm test
```

Expected: PASS — this task didn't touch any file with unit tests, so this just confirms the refactor didn't break `lib/`.

```bash
pnpm dev
```

In the loaded extension's service worker console (`chrome://extensions` → Kickstand → "service worker"), run:

```javascript
await browser.runtime.sendMessage({ type: 'poll-now' });
```

Expected: no throw (returns `undefined` immediately since there's no logged-in user yet — that's Task 7+8's job). This confirms the message listener and `pollNow` wiring work end-to-end before real data exists to poll.

- [ ] **Step 3: Commit**

```bash
cd /home/joao/projects/kickstand
git add extension
git commit -m "Wire background alarm to real polling: live status, notifications, badge"
```

---

### Task 7: Popup shell — auth-gated tab bar

**Files:**
- Create: `extension/entrypoints/popup/LoginScreen.tsx`
- Create: `extension/entrypoints/popup/TabBar.tsx`
- Modify: `extension/entrypoints/popup/App.tsx`

**Interfaces:**
- Consumes: `startLoginFlow`, `logout` from `lib/auth.ts` (Task 4); `authTokensStorage` from `lib/storage.ts` (Task 2).
- Produces: `App.tsx` renders `<LoginScreen />` when logged out, or `<TabBar activeTab, onTabChange>` + the active tab's content when logged in. `FollowingTab`/`BrowseTab`/`CategoriesTab` (Tasks 8–10) are the tab content components `App.tsx` will render by name.

- [ ] **Step 1: Login screen**

Create `extension/entrypoints/popup/LoginScreen.tsx`:

```tsx
import { useState } from 'react';
import { startLoginFlow } from '@/lib/auth';

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      await startLoginFlow();
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ width: 320, padding: 24, fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h1>Kickstand</h1>
      <p>Track Kick channels and see who's live.</p>
      <button onClick={handleLogin} disabled={loading}>
        {loading ? 'Logging in…' : 'Log in with Kick'}
      </button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Tab bar**

Create `extension/entrypoints/popup/TabBar.tsx`:

```tsx
export type TabName = 'following' | 'browse' | 'categories';

const TABS: { name: TabName; label: string }[] = [
  { name: 'following', label: 'Following' },
  { name: 'browse', label: 'Browse' },
  { name: 'categories', label: 'Categories' },
];

export function TabBar({
  active,
  onChange,
}: {
  active: TabName;
  onChange: (tab: TabName) => void;
}) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid #ddd' }}>
      {TABS.map((tab) => (
        <button
          key={tab.name}
          onClick={() => onChange(tab.name)}
          style={{
            flex: 1,
            padding: 8,
            background: 'none',
            border: 'none',
            borderBottom: tab.name === active ? '2px solid #53FC18' : '2px solid transparent',
            fontWeight: tab.name === active ? 'bold' : 'normal',
            cursor: 'pointer',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Wire the popup shell**

Replace `extension/entrypoints/popup/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { authTokensStorage } from '@/lib/storage';
import { LoginScreen } from './LoginScreen';
import { TabBar, type TabName } from './TabBar';

export default function App() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>('following');

  useEffect(() => {
    authTokensStorage.getValue().then((tokens) => setLoggedIn(tokens !== null));
    return authTokensStorage.watch((tokens) => setLoggedIn(tokens !== null));
  }, []);

  if (loggedIn === null) return null; // brief loading flash avoided
  if (!loggedIn) return <LoginScreen onLoggedIn={() => setLoggedIn(true)} />;

  return (
    <div style={{ width: 360, fontFamily: 'sans-serif' }}>
      <TabBar active={activeTab} onChange={setActiveTab} />
      <div style={{ padding: 12 }}>
        {activeTab === 'following' && <p>Following tab (Task 8)</p>}
        {activeTab === 'browse' && <p>Browse tab (Task 9)</p>}
        {activeTab === 'categories' && <p>Categories tab (Task 10)</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

```bash
cd extension
pnpm test
```

Expected: PASS — no `lib/` files changed.

```bash
pnpm dev
```

Expected: popup shows the "Log in with Kick" screen (clicking it will fail until `KICK_CLIENT_ID` is a real value — that's expected and documented in the README, Task 11). Manually verify the logged-in shell renders instead by running in the popup's devtools console:

```javascript
await browser.storage.local.set({
  authTokens: {
    accessToken: 'test',
    refreshToken: 'test',
    expiresAt: Date.now() + 3600_000,
    refreshExpiresAt: Date.now() + 86400_000,
  },
});
```

then reopening the popup — expect the tab bar with "Following / Browse / Categories" to appear.

- [ ] **Step 5: Commit**

```bash
cd /home/joao/projects/kickstand
git add extension
git commit -m "Add auth-gated popup shell: login screen and tab bar"
```

---

### Task 8: Following tab — tracked channels, add/remove/mute

**Files:**
- Create: `extension/entrypoints/popup/FollowingTab.tsx`
- Modify: `extension/entrypoints/popup/App.tsx`

**Interfaces:**
- Consumes: `trackedChannelsStorage`, `liveStatusStorage`, `TrackedChannel`, `LiveStatusCache` from `lib/storage.ts` (Task 2); `resolveChannelsBySlug`, `KickApiError` from `lib/kick-api.ts` (Task 5); `getValidAccessToken` from `lib/auth.ts` (Task 4).
- Produces: `<FollowingTab />`, rendered by `App.tsx` in place of the Task 7 placeholder.

- [ ] **Step 1: Implement the Following tab**

Create `extension/entrypoints/popup/FollowingTab.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { getValidAccessToken } from '@/lib/auth';
import { resolveChannelsBySlug, KickApiError } from '@/lib/kick-api';
import {
  trackedChannelsStorage,
  liveStatusStorage,
  type TrackedChannel,
  type LiveStatusCache,
} from '@/lib/storage';

export function FollowingTab() {
  const [channels, setChannels] = useState<TrackedChannel[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveStatusCache>({});
  const [slugInput, setSlugInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    trackedChannelsStorage.getValue().then(setChannels);
    liveStatusStorage.getValue().then(setLiveStatus);
    const unwatchChannels = trackedChannelsStorage.watch(setChannels);
    const unwatchStatus = liveStatusStorage.watch(setLiveStatus);
    return () => {
      unwatchChannels();
      unwatchStatus();
    };
  }, []);

  async function handleAdd() {
    const slug = slugInput.trim().toLowerCase();
    if (!slug) return;
    setAddError(null);
    setAdding(true);
    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) throw new Error('Not logged in');
      const [resolved] = await resolveChannelsBySlug([slug], accessToken);
      if (!resolved) throw new Error(`No channel found for "${slug}"`);

      const current = await trackedChannelsStorage.getValue();
      if (current.some((c) => c.broadcasterUserId === resolved.broadcaster_user_id)) {
        throw new Error(`"${slug}" is already tracked`);
      }

      const updated: TrackedChannel[] = [
        ...current,
        {
          broadcasterUserId: resolved.broadcaster_user_id,
          slug: resolved.slug,
          addedAt: Date.now(),
          muted: false,
        },
      ];
      await trackedChannelsStorage.setValue(updated);
      setSlugInput('');
      await browser.runtime.sendMessage({ type: 'poll-now' });
    } catch (err) {
      setAddError(
        err instanceof KickApiError
          ? `Kick API error: ${err.message}`
          : err instanceof Error
          ? err.message
          : 'Failed to add channel'
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: number) {
    const updated = channels.filter((c) => c.broadcasterUserId !== id);
    await trackedChannelsStorage.setValue(updated);
  }

  async function handleToggleMute(id: number) {
    const updated = channels.map((c) =>
      c.broadcasterUserId === id ? { ...c, muted: !c.muted } : c
    );
    await trackedChannelsStorage.setValue(updated);
  }

  function openChannel(slug: string) {
    browser.tabs.create({ url: `https://kick.com/${slug}` });
  }

  const sorted = [...channels].sort((a, b) => {
    const aLive = liveStatus[a.broadcasterUserId]?.isLive ?? false;
    const bLive = liveStatus[b.broadcasterUserId]?.isLive ?? false;
    if (aLive !== bLive) return aLive ? -1 : 1;
    const aViewers = liveStatus[a.broadcasterUserId]?.viewerCount ?? 0;
    const bViewers = liveStatus[b.broadcasterUserId]?.viewerCount ?? 0;
    return bViewers - aViewers;
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        <input
          value={slugInput}
          onChange={(e) => setSlugInput(e.target.value)}
          placeholder="channel-slug"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button onClick={handleAdd} disabled={adding}>
          {adding ? 'Adding…' : 'Add'}
        </button>
      </div>
      {addError && <p style={{ color: 'crimson', fontSize: 12 }}>{addError}</p>}

      {sorted.length === 0 && <p>No tracked channels yet. Add one by slug above.</p>}

      {sorted.map((channel) => {
        const status = liveStatus[channel.broadcasterUserId];
        return (
          <div
            key={channel.broadcasterUserId}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #eee' }}
          >
            {status?.thumbnail && (
              <img src={status.thumbnail} alt="" width={64} height={36} style={{ objectFit: 'cover' }} />
            )}
            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openChannel(channel.slug)}>
              <div style={{ fontWeight: status?.isLive ? 'bold' : 'normal' }}>
                {channel.slug} {status?.isLive && '🔴'}
              </div>
              {status?.isLive && (
                <div style={{ fontSize: 12, color: '#666' }}>
                  {status.viewerCount.toLocaleString()} viewers · {status.category?.name ?? ''}
                </div>
              )}
            </div>
            <button onClick={() => handleToggleMute(channel.broadcasterUserId)}>
              {channel.muted ? 'Unmute' : 'Mute'}
            </button>
            <button onClick={() => handleRemove(channel.broadcasterUserId)}>Remove</button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the popup**

In `extension/entrypoints/popup/App.tsx`, add the import and replace the placeholder:

```tsx
import { FollowingTab } from './FollowingTab';
```

```tsx
{activeTab === 'following' && <FollowingTab />}
```

(Leave the `browse` and `categories` placeholders for Tasks 9–10.)

- [ ] **Step 3: Manual verification**

```bash
cd extension
pnpm test
```

Expected: PASS — no `lib/` files changed.

```bash
pnpm dev
```

With the fake logged-in state from Task 7 Step 4 still in storage, open the popup: expect the Following tab with an add-channel input and empty-state message. Adding a slug will fail until `KICK_CLIENT_ID`/Worker are real (expected — covered by the README in Task 11); confirm the inline error renders rather than crashing the popup.

- [ ] **Step 4: Commit**

```bash
cd /home/joao/projects/kickstand
git add extension
git commit -m "Add Following tab: tracked channel list, add/remove/mute"
```

---

### Task 9: Browse tab — top live streams

**Files:**
- Create: `extension/entrypoints/popup/BrowseTab.tsx`
- Modify: `extension/entrypoints/popup/App.tsx`

**Interfaces:**
- Consumes: `fetchLivestreams`, `KickApiError` from `lib/kick-api.ts` (Task 5); `getValidAccessToken` from `lib/auth.ts` (Task 4); `KickLivestream` from `lib/types.ts` (Task 2).
- Produces: `<BrowseTab />`, rendered by `App.tsx` in place of the Task 7 placeholder.

- [ ] **Step 1: Implement the Browse tab**

Create `extension/entrypoints/popup/BrowseTab.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { getValidAccessToken } from '@/lib/auth';
import { fetchLivestreams, KickApiError } from '@/lib/kick-api';
import type { KickLivestream } from '@/lib/types';

export function BrowseTab() {
  const [streams, setStreams] = useState<KickLivestream[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) throw new Error('Not logged in');
      const res = await fetchLivestreams(
        { cursor: reset ? undefined : cursor ?? undefined, limit: 20 },
        accessToken
      );
      setStreams((prev) => (reset ? res.data : [...prev, ...res.data]));
      setCursor(res.pagination.next_cursor);
    } catch (err) {
      setError(
        err instanceof KickApiError ? `Kick API error: ${err.message}` : 'Failed to load streams'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openStream(slug: string) {
    browser.tabs.create({ url: `https://kick.com/${slug}` });
  }

  return (
    <div>
      {error && (
        <div style={{ color: 'crimson', fontSize: 12, marginBottom: 8 }}>
          {error} <button onClick={() => load(true)}>Retry</button>
        </div>
      )}

      {streams.map((stream) => (
        <div
          key={stream.id}
          style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid #eee', cursor: 'pointer' }}
          onClick={() => openStream(stream.channel.slug)}
        >
          <img src={stream.thumbnail} alt="" width={80} height={45} style={{ objectFit: 'cover' }} />
          <div>
            <div style={{ fontWeight: 'bold' }}>{stream.broadcaster_user.username}</div>
            <div style={{ fontSize: 12, color: '#666' }}>{stream.title}</div>
            <div style={{ fontSize: 12, color: '#666' }}>
              {stream.viewer_count.toLocaleString()} viewers · {stream.category?.name ?? ''}
            </div>
          </div>
        </div>
      ))}

      {cursor && (
        <button onClick={() => load(false)} disabled={loading} style={{ width: '100%', marginTop: 8 }}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the popup**

In `extension/entrypoints/popup/App.tsx`:

```tsx
import { BrowseTab } from './BrowseTab';
```

```tsx
{activeTab === 'browse' && <BrowseTab />}
```

- [ ] **Step 3: Manual verification**

```bash
cd extension
pnpm test
```

Expected: PASS — no `lib/` files changed.

```bash
pnpm dev
```

Switch to the Browse tab: expect an inline error + Retry button (since there's no real access token yet), confirming the error path renders correctly rather than crashing.

- [ ] **Step 4: Commit**

```bash
cd /home/joao/projects/kickstand
git add extension
git commit -m "Add Browse tab: paginated top live streams"
```

---

### Task 10: Categories tab + Settings panel

**Files:**
- Create: `extension/entrypoints/popup/CategoriesTab.tsx`
- Create: `extension/entrypoints/popup/SettingsPanel.tsx`
- Modify: `extension/entrypoints/popup/App.tsx`
- Modify: `extension/entrypoints/popup/BrowseTab.tsx` (accept an optional initial category filter)

**Interfaces:**
- Consumes: `fetchCategories` from `lib/kick-api.ts` (Task 5); `getValidAccessToken` from `lib/auth.ts` (Task 4); `KickCategoryWithTags` from `lib/types.ts` (Task 2); `settingsStorage`, `Settings`, `trackedChannelsStorage` from `lib/storage.ts` (Task 2); `logout` from `lib/auth.ts` (Task 4).
- Produces: `<CategoriesTab onSelectCategory={(id, name) => void} />`, `<SettingsPanel />`, both rendered by `App.tsx`. Clicking a category switches `App.tsx` to the Browse tab with that category pre-filtered.

- [ ] **Step 1: Add a category filter to BrowseTab**

In `extension/entrypoints/popup/BrowseTab.tsx`, change the component to accept a prop and use it:

```tsx
export function BrowseTab({ categoryId }: { categoryId?: number } = {}) {
```

Update the `load` function's `fetchLivestreams` call to include the filter:

```tsx
const res = await fetchLivestreams(
  {
    cursor: reset ? undefined : cursor ?? undefined,
    limit: 20,
    categoryId: categoryId ? [categoryId] : undefined,
  },
  accessToken
);
```

Update the `useEffect` dependency array so switching categories reloads:

```tsx
useEffect(() => {
  load(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [categoryId]);
```

- [ ] **Step 2: Implement the Categories tab**

Create `extension/entrypoints/popup/CategoriesTab.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { getValidAccessToken } from '@/lib/auth';
import { fetchCategories, KickApiError } from '@/lib/kick-api';
import type { KickCategoryWithTags } from '@/lib/types';

export function CategoriesTab({
  onSelectCategory,
}: {
  onSelectCategory: (id: number, name: string) => void;
}) {
  const [categories, setCategories] = useState<KickCategoryWithTags[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) throw new Error('Not logged in');
      const res = await fetchCategories(
        { cursor: reset ? undefined : cursor ?? undefined, limit: 25 },
        accessToken
      );
      setCategories((prev) => (reset ? res.data : [...prev, ...res.data]));
      setCursor(res.pagination.next_cursor);
    } catch (err) {
      setError(
        err instanceof KickApiError ? `Kick API error: ${err.message}` : 'Failed to load categories'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {error && (
        <div style={{ color: 'crimson', fontSize: 12, marginBottom: 8 }}>
          {error} <button onClick={() => load(true)}>Retry</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {categories.map((category) => (
          <div
            key={category.id}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelectCategory(category.id, category.name)}
          >
            <img src={category.thumbnail} alt="" width="100%" style={{ aspectRatio: '3/4', objectFit: 'cover' }} />
            <div style={{ fontSize: 12, textAlign: 'center' }}>{category.name}</div>
          </div>
        ))}
      </div>

      {cursor && (
        <button onClick={() => load(false)} disabled={loading} style={{ width: '100%', marginTop: 8 }}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement the Settings panel**

Create `extension/entrypoints/popup/SettingsPanel.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { logout } from '@/lib/auth';
import {
  settingsStorage,
  trackedChannelsStorage,
  type Settings,
  type TrackedChannel,
} from '@/lib/storage';

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [channels, setChannels] = useState<TrackedChannel[]>([]);

  useEffect(() => {
    settingsStorage.getValue().then(setSettings);
    trackedChannelsStorage.getValue().then(setChannels);
    const unwatchSettings = settingsStorage.watch(setSettings);
    const unwatchChannels = trackedChannelsStorage.watch(setChannels);
    return () => {
      unwatchSettings();
      unwatchChannels();
    };
  }, []);

  if (!settings) return null;

  async function updateInterval(minutes: number) {
    await settingsStorage.setValue({ ...settings!, pollingIntervalMinutes: minutes });
  }

  async function toggleNotifications() {
    await settingsStorage.setValue({
      ...settings!,
      notificationsEnabled: !settings!.notificationsEnabled,
    });
  }

  async function removeChannel(id: number) {
    await trackedChannelsStorage.setValue(channels.filter((c) => c.broadcasterUserId !== id));
  }

  return (
    <div>
      <h3>Settings</h3>

      <label>
        Polling interval
        <select
          value={settings.pollingIntervalMinutes}
          onChange={(e) => updateInterval(Number(e.target.value))}
        >
          <option value={1}>Every 1 minute</option>
          <option value={1.5}>Every 1.5 minutes</option>
        </select>
      </label>

      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.notificationsEnabled}
            onChange={toggleNotifications}
          />
          Notify when a tracked channel goes live
        </label>
      </div>

      <h4>Tracked channels</h4>
      {channels.map((channel) => (
        <div key={channel.broadcasterUserId} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{channel.slug}</span>
          <button onClick={() => removeChannel(channel.broadcasterUserId)}>Remove</button>
        </div>
      ))}

      <button onClick={() => logout()} style={{ marginTop: 12 }}>
        Log out
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Wire both into the popup shell**

Replace `extension/entrypoints/popup/App.tsx` with the final version:

```tsx
import { useEffect, useState } from 'react';
import { authTokensStorage } from '@/lib/storage';
import { LoginScreen } from './LoginScreen';
import { TabBar, type TabName } from './TabBar';
import { FollowingTab } from './FollowingTab';
import { BrowseTab } from './BrowseTab';
import { CategoriesTab } from './CategoriesTab';
import { SettingsPanel } from './SettingsPanel';

export default function App() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>('following');
  const [browseCategory, setBrowseCategory] = useState<{ id: number; name: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    authTokensStorage.getValue().then((tokens) => setLoggedIn(tokens !== null));
    return authTokensStorage.watch((tokens) => setLoggedIn(tokens !== null));
  }, []);

  if (loggedIn === null) return null;
  if (!loggedIn) return <LoginScreen onLoggedIn={() => setLoggedIn(true)} />;

  return (
    <div style={{ width: 360, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px' }}>
        <div style={{ flex: 1 }}>
          <TabBar
            active={activeTab}
            onChange={(tab) => {
              setActiveTab(tab);
              if (tab !== 'browse') setBrowseCategory(null);
            }}
          />
        </div>
        <button onClick={() => setShowSettings((v) => !v)} title="Settings">
          ⚙️
        </button>
      </div>

      <div style={{ padding: 12 }}>
        {showSettings ? (
          <SettingsPanel />
        ) : (
          <>
            {activeTab === 'following' && <FollowingTab />}
            {activeTab === 'browse' && <BrowseTab categoryId={browseCategory?.id} />}
            {activeTab === 'categories' && (
              <CategoriesTab
                onSelectCategory={(id, name) => {
                  setBrowseCategory({ id, name });
                  setActiveTab('browse');
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Manual verification**

```bash
cd extension
pnpm test
```

Expected: PASS — no `lib/` files changed.

```bash
pnpm dev
```

Verify: Categories tab shows an inline error + Retry (no real token yet); the gear icon toggles the Settings panel showing the polling interval selector, notifications checkbox, and Log out button; clicking Log out returns to the login screen.

- [ ] **Step 6: Commit**

```bash
cd /home/joao/projects/kickstand
git add extension
git commit -m "Add Categories tab and Settings panel; wire full popup shell"
```

---

### Task 11: README

**Files:**
- Create: `/home/joao/projects/kickstand/README.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: setup instructions referencing `extension/lib/config.ts` placeholders and `worker/wrangler.toml` / Worker secrets from Tasks 3–4.

- [ ] **Step 1: Write the README**

Create `/home/joao/projects/kickstand/README.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
cd /home/joao/projects/kickstand
git add README.md
git commit -m "Add README: setup, unpacked loading, Worker deployment"
```
