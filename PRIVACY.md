# Kickstand Privacy Policy

_Last updated: 2026-07-24_

Kickstand is a browser extension that lets you track Kick.com channels, see
who's live, and browse Kick's live streams and categories. This policy
explains what data it handles.

## What Kickstand stores

- **Kick OAuth tokens** (access token, refresh token, expiry times) — stored
  locally on your device (`chrome.storage.local`) so you stay signed in.
  Never transmitted anywhere except to Kick's own servers to authenticate
  API requests, and to refresh the token when it expires.
- **Your tracked channel list and settings** (polling interval, notification
  preferences) — stored via your browser's built-in sync storage
  (`chrome.storage.sync`). If you have Chrome Sync or Firefox Sync enabled,
  this syncs across your own devices through Google's or Mozilla's sync
  infrastructure — Kickstand does not operate any server that receives or
  stores this data.
- **Cached live-status data** (viewer counts, stream titles, thumbnails for
  tracked channels) — stored locally on your device, used only to render
  the popup and toolbar badge without re-fetching on every open.

## What Kickstand fetches from Kick

Kickstand calls Kick's public API (`api.kick.com`) and OAuth server
(`id.kick.com`) directly, using the access token from your own login, to:

- Look up channels by slug
- Fetch live-stream and category listings
- Fetch your own Kick profile (used only to show your profile picture in
  place of the settings icon)

Kick's profile endpoint also returns your account name and email address as
part of that response. Kickstand does not store, display, or transmit
either — only the profile picture URL is read out of the response.

## The Cloudflare Worker

Kickstand uses a small Cloudflare Worker it operates as an OAuth proxy, so
the app's client secret never ships inside the extension. The worker only
ever sees the OAuth authorization code, PKCE code verifier, redirect URI, or
refresh token needed to complete a token exchange with Kick — it forwards
these directly to Kick's OAuth server and returns the result. It does not
log, store, or retain any of this data.

## What Kickstand does not do

- Does not sell or share any data with third parties
- Does not use your data for advertising, analytics, or tracking
- Does not use your data for any purpose other than the features described
  above
- Does not have access to your Kick password at any point — sign-in happens
  through Kick's own OAuth login page

## Contact

Questions or concerns can be raised via
[GitHub Issues](https://github.com/joaopedro17/kickstand/issues).
