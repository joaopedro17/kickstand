# Kickstand Privacy Policy

_Last updated: 2026-11-11_

Kickstand is a browser extension that lets you track Kick.com channels, see
who's live, and browse Kick's live streams and categories. This policy
explains what data it handles.

## What Kickstand stores

Everything Kickstand stores stays in your browser's own extension storage.
Kickstand does not operate any server that receives or keeps it.

**Synced through your browser** (`storage.sync`). If you have Chrome Sync or
Firefox Sync turned on, these follow you to your other devices through
Google's or Mozilla's sync service:

- **Your tracked channel list:** each channel's Kick id and name, when you
  added it, and whether you muted it.
- **Your settings:** notifications on or off, how often to check for live
  channels, quiet hours, category-change alerts, the alert sound, blurring
  of mature thumbnails, and the language you last picked in Browse.

**On this device only** (`storage.local`):

- **Kick sign-in tokens** (access token, refresh token and their expiry
  times), so you stay signed in.
- **What the last check found** about your tracked channels: live or
  offline, stream title, category, viewer count, thumbnail and start time,
  and when each was last seen live.
- **Profile pictures:** yours, shown in place of the settings icon, and
  those of the channels you track, shown next to offline channels. They are
  fetched again after a day (yours) or a week (channels').
- **Channels and categories you hid from Browse**, with their names, so
  Settings can list them for you to show again.
- **A note of whether Kick asked Kickstand to slow down**, and until when,
  so it checks less often while Kick is rate-limiting it.

**When you log out**, Kickstand asks Kick to revoke both sign-in tokens and
deletes them, the cached live status, the badge and your profile picture.
Your tracked list and settings stay, so they are there when you log in
again.

## What Kickstand fetches, and from where

Kickstand talks to Kick's public API (`api.kick.com`) and Kick's sign-in
server (`id.kick.com`) directly, using the token from your own login, to:

- look up channels by name, including names you paste or the channel open
  in the current tab;
- check which tracked channels are live;
- list live streams and categories for the Browse and Categories tabs;
- fetch profile pictures: your own, and the public pictures of the channels
  you track;
- revoke your tokens when you log out.

Thumbnails and profile pictures are images hosted by Kick, loaded from the
addresses Kick's API returns. Kickstand loads nothing else from the web:
its icons, font and alert sound ship inside the extension.

Kick's profile response also contains your account name and email address.
Kickstand reads only the picture address out of it, and never stores,
shows or sends the rest.

## The token proxy

Kickstand uses a small Cloudflare Worker it operates as a sign-in proxy, so
the app's client secret never ships inside the extension. The worker only
ever receives what a token exchange with Kick needs: the authorization code,
PKCE code verifier and redirect address when you log in, or the refresh
token when your session is renewed. It forwards these to Kick's sign-in
server and returns Kick's answer. It accepts requests only from the
Kickstand extension, and does not log, store or keep any of this data.

## Browser permissions

- **storage, alarms, notifications, identity:** keep your list and settings,
  check for live channels on a schedule, show live alerts, and sign in
  through Kick's own login page.
- **activeTab:** when you open the popup, Kickstand reads the address of the
  tab you are on. If it is a Kick channel page, it offers to track that
  channel. The address is not stored or sent anywhere; only the channel name
  is looked up with Kick.
- **offscreen** (Chrome only): plays the optional alert sound, which Chrome
  extensions can't do from their background script.
- **tabs** (optional, off unless you turn it on): if you turn on "switch to
  the channel's open tab", Kickstand asks your browser for this permission.
  When you click an alert, it then looks through your open tabs' addresses
  for one showing that Kick channel and switches to it. Nothing about your
  tabs is stored or sent. Turning the setting off gives the permission back.

## What Kickstand does not do

- Does not sell or share any data with third parties.
- Does not use your data for advertising, analytics or tracking.
- Does not use your data for any purpose other than the features described
  above.
- Never sees your Kick password: sign-in happens on Kick's own login page.

## Contact

Questions or concerns can be raised via
[GitHub Issues](https://github.com/joaopedro17/kickstand/issues).
