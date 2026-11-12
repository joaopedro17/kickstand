import { browser, type Browser } from 'wxt/browser';
import { slugFromKickUrl } from '@/lib/channels/slug-input';

/**
 * Switching to a channel's open tab needs the optional `tabs` permission,
 * whose install warning Kickstand doesn't want everyone to see. The feature
 * is on exactly when the permission is granted: nothing else is stored, so
 * the two can't disagree when the user revokes it in the browser.
 */
const TABS: Browser.permissions.Permissions = { permissions: ['tabs'] };

export function canFocusTabs(): Promise<boolean> {
  return browser.permissions.contains(TABS);
}

/** Asks for the permission. Must be called straight from a click, before any await. */
export function allowTabFocus(): Promise<boolean> {
  return browser.permissions.request(TABS);
}

export async function disallowTabFocus(): Promise<void> {
  await browser.permissions.remove(TABS);
}

/** Calls `onChange` whenever the permission is granted or removed, here or in the browser's settings. */
export function watchTabFocus(onChange: (allowed: boolean) => void): () => void {
  const listener = () => canFocusTabs().then(onChange);
  browser.permissions.onAdded.addListener(listener);
  browser.permissions.onRemoved.addListener(listener);
  return () => {
    browser.permissions.onAdded.removeListener(listener);
    browser.permissions.onRemoved.removeListener(listener);
  };
}

/** Switches to an open tab showing the channel; false when there is none, or no permission to look. */
export async function focusChannelTab(slug: string): Promise<boolean> {
  if (!(await canFocusTabs())) return false;
  const tabs = await browser.tabs.query({ url: ['https://kick.com/*', 'https://www.kick.com/*'] });
  const open = tabs.find((tab) => slugFromKickUrl(tab.url) === slug);
  if (open?.id === undefined) return false;
  await browser.tabs.update(open.id, { active: true });
  await browser.windows.update(open.windowId, { focused: true });
  return true;
}
