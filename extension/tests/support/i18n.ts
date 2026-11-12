import { vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

/**
 * Makes every translated string render as `<its_message_name>`. Every visible
 * word must come from the locale files, so a hard-coded English string then
 * shows up as plain text instead of a message name.
 */
export function showMessageKeys(): void {
  vi.spyOn(fakeBrowser.i18n, 'getMessage').mockImplementation((name: string) => `<${name}>`);
}
