import { defineConfig } from 'wxt';
import { readFileSync } from 'node:fs';

// Pins the extension ID (see extension/.secrets/extension-id.txt) for local
// unpacked builds so the Kick OAuth redirect URI and the Worker's
// ALLOWED_ORIGIN stay valid across reloads. Keep extension-key.pem out of
// git. The Chrome Web Store assigns its own ID and rejects any manifest
// containing a "key" field, so `pnpm zip`/`zip:firefox` set
// WXT_SKIP_MANIFEST_KEY to omit it from store-submission builds.
const manifestKey = process.env.WXT_SKIP_MANIFEST_KEY
  ? undefined
  : readFileSync(
      new URL('./.secrets/extension-key-pub.b64', import.meta.url),
      'utf-8',
    ).trim();

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    ...(manifestKey ? { key: manifestKey } : {}),
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
