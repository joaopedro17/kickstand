import { defineConfig } from 'wxt';
import { readFileSync } from 'node:fs';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: (env) => {
    // Pins the Chrome extension ID (see extension/.secrets/extension-id.txt)
    // for local unpacked builds so the Kick OAuth redirect URI and the
    // Worker's ALLOWED_ORIGINS stay valid across reloads. Keep
    // extension-key.pem out of git. The Chrome Web Store assigns its own ID
    // and rejects any manifest containing a "key" field, so `pnpm zip` sets
    // WXT_SKIP_MANIFEST_KEY to omit it from store-submission builds.
    //
    // Only read the key file for Chrome builds — Firefox ignores "key"
    // entirely, and WXT's sources zip (required for AMO review) excludes
    // dotfiles regardless of git-tracking, so a Firefox build must never
    // depend on `.secrets/` existing.
    const manifestKey =
      env.browser === 'chrome' && !process.env.WXT_SKIP_MANIFEST_KEY
        ? readFileSync(
            new URL('./.secrets/extension-key-pub.b64', import.meta.url),
            'utf-8',
          ).trim()
        : undefined;

    return {
      ...(manifestKey ? { key: manifestKey } : {}),
      // Firefox derives the identity redirect URL (browser.identity.getRedirectURL())
      // from this ID, so it must be stable across builds — unlike Chrome's "key",
      // Firefox doesn't reject an explicit id on store submission.
      browser_specific_settings: {
        gecko: {
          id: '{70dfad10-6ff8-4d37-b28a-5875d0895ada}',
          // Required by AMO since 2025-11-03. Only authenticationInfo applies:
          // Kickstand stores the Kick OAuth access/refresh tokens locally to
          // keep the user signed in. Nothing else (tracked channels, cached
          // stream data) falls into any of Mozilla's listed categories.
          data_collection_permissions: {
            required: ['authenticationInfo'],
          },
        },
      },
      name: 'Kickstand',
      description: 'Track Kick.com channels, see who\'s live, and browse streams.',
      permissions: ['storage', 'alarms', 'notifications', 'identity'],
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
    };
  },
});
