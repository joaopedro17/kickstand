import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup } from '@testing-library/react';
import { load } from 'js-yaml';
import { afterEach, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// Vitest runs without globals, so Testing Library cannot register its own
// afterEach cleanup; unmount rendered components between tests here.
afterEach(() => {
  cleanup();
});

// The fake browser has no i18n. Report an English browser, and serve the
// real English strings, keyed the way the browser stores them
// (`following.addButton` -> `following_addButton`), so tests read and assert
// on exactly what an English-speaking user sees.
// Named substitutions like {slug} are applied by @wxt-dev/i18n afterwards.
function flatten(tree: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const name = prefix ? `${prefix}_${key}` : key;
    return typeof value === 'string'
      ? { ...acc, [name]: value }
      : { ...acc, ...flatten(value as Record<string, unknown>, name) };
  }, {});
}

const englishMessages = flatten(
  load(readFileSync(resolve(__dirname, '../../locales/en.yml'), 'utf-8')) as Record<
    string,
    unknown
  >
);

beforeEach(() => {
  // WXT's own test setup stubs these once per file. Tests that undo their
  // fetch stub with vi.unstubAllGlobals() remove these too, and libraries
  // that read the global (@wxt-dev/i18n) would then find no browser.
  vi.stubGlobal('chrome', fakeBrowser);
  vi.stubGlobal('browser', fakeBrowser);
  vi.spyOn(fakeBrowser.i18n, 'getMessage').mockImplementation(
    (name: string) => englishMessages[name] ?? ''
  );
  vi.spyOn(fakeBrowser.i18n, 'getUILanguage').mockReturnValue('en-US');
});
