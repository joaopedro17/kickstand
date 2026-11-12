import { browser } from 'wxt/browser';

type ToolbarButton = Pick<typeof browser.action, 'setBadgeText' | 'setBadgeBackgroundColor' | 'setBadgeTextColor'>;

/**
 * The toolbar button's API. Manifest V3 calls it `action`; the Firefox
 * build is Manifest V2, where it is `browserAction` with the same methods
 * and `action` is undefined. Calling `browser.action` there threw at
 * start-up, before the background registered any listener, so Firefox
 * could not log in (1.2.1 and earlier). The browser types only describe
 * MV3, hence the cast.
 */
export function toolbarButton(): ToolbarButton {
  return browser.action ?? (browser as unknown as { browserAction: ToolbarButton }).browserAction;
}
