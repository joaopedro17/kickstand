# <img src="extension/public/icons/48.png" width="38" align="left" /> Kickstand
> A browser companion for Kick.com — track channels, catch who's live, browse the rest

Kickstand lets you follow Kick.com channels by slug and see at a glance who's
live, right from your browser toolbar. It notifies you when a tracked channel
goes live, and lets you browse the platform's live streams and categories
without leaving your current tab.

Manifest V3, cross-browser (Chrome + Firefox), built with
[WXT](https://wxt.dev) + TypeScript + React.

## Frequently Asked Questions

### Why do I have to type the channel slug instead of searching by name?

Kick's public API only supports looking up a channel by its exact slug —
there's no search-by-display-name endpoint to query against. The slug is the
part of the channel's URL after `kick.com/`, e.g. `xqc` for `kick.com/xqc`.

### Why isn't the Browse tab sorted by viewer count out of the box?

Kick's `/public/v2/livestreams` endpoint has no sort parameter — it always
returns livestreams oldest-started-first. Kickstand fetches a larger batch
per page and sorts it client-side by viewer count to approximate what the
website shows, but with thousands of concurrent streams a perfect global
ranking would require fetching every live stream on the platform, which
isn't practical from a popup.

### Will I get logged out often?

No. Kick access tokens last 2 hours, but refresh tokens last 30 days on a
sliding window that resets on every successful refresh. As long as you open
the extension at least once a month, you effectively stay logged in
indefinitely.

## Support

Kickstand is free and always will be. If it's saved you a few tab-switches
and you feel like saying thanks, you can [buy me a coffee](https://buymeacoffee.com/joaopedro.luz17)
— entirely optional, hugely appreciated.

## Credits

Kickstand was inspired by [Gumbo](https://github.com/Seldszar/Gumbo), Alexandre
Breteau's excellent Twitch companion extension. If you want the same
experience for Twitch, go check it out.

## License

Copyright (c) 2026 João Pedro

This software is released under the terms of the MIT License. See the
[LICENSE](LICENSE) file for further information.
