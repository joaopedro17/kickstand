import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { ERROR_CODES, translateErrorCode } from './lib/error-messages';

const LOCALES_DIR = join(__dirname, 'locales');

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, unknown>, path);
    }
    return [path];
  });
}

function loadLocale(file: string): Record<string, unknown> {
  const content = readFileSync(join(LOCALES_DIR, file), 'utf-8');
  return load(content) as Record<string, unknown>;
}

describe('locale files', () => {
  const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.yml'));
  const enKeys = flattenKeys(loadLocale('en.yml')).sort();

  it('has at least the 8 expected locale files', () => {
    const expected = ['en', 'pt-BR', 'de', 'fr', 'sv', 'pl', 'es', 'it'];
    for (const locale of expected) {
      expect(files).toContain(`${locale}.yml`);
    }
  });

  for (const file of files) {
    if (file === 'en.yml') continue;

    it(`${file} has exactly the same keys as en.yml`, () => {
      const keys = flattenKeys(loadLocale(file)).sort();
      expect(keys).toEqual(enKeys);
    });
  }

  it('every locale key is a valid browser-extension message name after flattening', () => {
    for (const file of files) {
      const keys = flattenKeys(loadLocale(file));
      for (const key of keys) {
        const messageName = key.replaceAll('.', '_');
        expect(messageName).toMatch(/^[A-Za-z0-9_@]+$/);
      }
    }
  });

  it('every errors.* string in en.yml is shown for some error code', () => {
    const enErrorKeys = flattenKeys(loadLocale('en.yml'))
      .filter((k) => k.startsWith('errors.'))
      .map((k) => k.replace('.', '_'))
      .sort();
    const asked: string[] = [];
    vi.spyOn(browser.i18n, 'getMessage').mockImplementation((name: string) => {
      asked.push(name);
      return name;
    });

    ERROR_CODES.forEach(translateErrorCode);

    expect([...new Set(asked)].sort()).toEqual(enErrorKeys);
  });
});
