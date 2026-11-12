# <img src="extension/public/icons/48.png" width="38" align="left" /> Kickstand
> A browser companion for Kick.com — track channels, catch who's live, browse the rest

Kickstand lets you follow Kick.com channels and see at a glance who's live,
right from your browser toolbar. It notifies you when a tracked channel goes
live, and lets you browse the platform's live streams and categories without
leaving your current tab.

- **Add channels your way:** paste names or `kick.com` links (several at
  once), track the channel open in your current tab in one click, or hit
  "+" on any stream in Browse. Move your list between browsers with copy,
  download and import.
- **Know who's live, and for how long:** live channels first with viewers
  and uptime, "last live" for offline ones, a filter for long lists.
- **Alerts that fit you:** check every 1, 2 or 5 minutes, quiet hours,
  per-channel mute, optional category-change alerts and sound, and
  switching to the channel's open tab instead of opening another.
- **Browse on your terms:** filter by language, blur mature thumbnails, and
  hide channels or categories you don't want to see.

Cross-browser (Chrome on Manifest V3, Firefox on Manifest V2), built with
[WXT](https://wxt.dev) + TypeScript + React.

## Frequently Asked Questions

### Can I search for a channel by name?

Not by display name: Kick's public API can only look a channel up by its
exact name in the URL (`xqc` for `kick.com/xqc`). You don't have to type it,
though. Paste a channel's link, several names or links at once, or a whole
list; open the popup on a channel's page and click "Track"; or add streamers
straight from the Browse tab.

### Can I import the channels I already follow on Kick?

Not yet. Kick's public API doesn't offer the list of channels you follow,
and Kickstand won't scrape Kick's website for it. Kick says it is on its
roadmap ([KickDevDocs#87](https://github.com/KickEngineering/KickDevDocs/issues/87));
Kickstand will add an "Import from Kick" button once it is available. Until
then, paste your channels' names or links into the add box, or import a list
in Settings.

### Why does Kickstand ask to see my tabs?

Only if you turn on "switch to the channel's open tab" in Settings. Your
browser then asks you to allow it, and Kickstand uses it only to find an
already-open tab of the channel when you click an alert. Turning the setting
off gives the permission back. See the [privacy policy](PRIVACY.md).

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
