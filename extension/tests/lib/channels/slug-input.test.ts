import { describe, it, expect } from 'vitest';
import { MAX_SLUGS_PER_SUBMIT, parseSlugInput, slugFromKickUrl } from '@/lib/channels/slug-input';

const slugsOf = (text: string) => parseSlugInput(text).slugs;

describe('parseSlugInput', () => {
  it('takes a plain slug, lower-cased', () => {
    expect(parseSlugInput('  XQC ')).toEqual({ slugs: ['xqc'], invalid: [], skipped: [] });
  });

  it('takes an @name', () => {
    expect(slugsOf('@trainwreckstv')).toEqual(['trainwreckstv']);
  });

  it('takes kick.com links in every common form', () => {
    expect(
      slugsOf(
        [
          'https://kick.com/one',
          'http://www.kick.com/two',
          'kick.com/three',
          'www.kick.com/four/',
          'https://kick.com/five?ref=abc',
          'https://kick.com/six#chat',
          'https://kick.com/seven/videos',
          'HTTPS://KICK.COM/Eight',
        ].join(' ')
      )
    ).toEqual(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']);
  });

  it('splits on spaces, commas, semicolons and new lines', () => {
    expect(slugsOf('a, b;c\nd\r\ne\t f,,  g')).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('keeps each channel once, in the order first given', () => {
    expect(slugsOf('b a kick.com/B @a b')).toEqual(['b', 'a']);
  });

  it('keeps slugs with digits, hyphens and underscores', () => {
    expect(slugsOf('x_q-c9')).toEqual(['x_q-c9']);
  });

  it('reports what is not a channel name or link', () => {
    expect(
      parseSlugInput('ok bad!name https://twitch.tv/xqc kick.com/ kick.com/categories/slots @ ' + 'a'.repeat(26))
    ).toEqual({
      slugs: ['ok'],
      invalid: ['bad!name', 'https://twitch.tv/xqc', 'kick.com/', 'kick.com/categories/slots', '@', 'a'.repeat(26)],
      skipped: [],
    });
  });

  it('accepts a 25-character slug', () => {
    expect(slugsOf('a'.repeat(25))).toEqual(['a'.repeat(25)]);
  });

  it(`keeps the first ${MAX_SLUGS_PER_SUBMIT} channels and sets the rest aside`, () => {
    const many = Array.from({ length: MAX_SLUGS_PER_SUBMIT + 3 }, (_, i) => `c${i}`);
    const { slugs, skipped } = parseSlugInput(many.join(' '));

    expect(slugs).toEqual(many.slice(0, MAX_SLUGS_PER_SUBMIT));
    expect(skipped).toEqual(many.slice(MAX_SLUGS_PER_SUBMIT));
  });

  it('does not count duplicates against the limit', () => {
    const many = Array.from({ length: MAX_SLUGS_PER_SUBMIT }, (_, i) => `c${i}`);
    expect(parseSlugInput([...many, 'c0', 'c1'].join(' ')).skipped).toEqual([]);
  });

  it('gives nothing for empty input', () => {
    expect(parseSlugInput(' \n , ')).toEqual({ slugs: [], invalid: [], skipped: [] });
  });
});

describe('slugFromKickUrl', () => {
  it('finds the channel of a kick.com channel page', () => {
    expect(slugFromKickUrl('https://kick.com/xqc')).toBe('xqc');
    expect(slugFromKickUrl('https://www.kick.com/XQC/clips?sort=top')).toBe('xqc');
  });

  it('gives null for kick.com pages that are not a channel', () => {
    for (const path of ['', 'categories/slots', 'browse', 'following', 'search?q=x', 'video/abc', 'dashboard']) {
      expect(slugFromKickUrl(`https://kick.com/${path}`)).toBeNull();
    }
  });

  it('gives null for other sites, and for no URL', () => {
    expect(slugFromKickUrl('https://twitch.tv/xqc')).toBeNull();
    expect(slugFromKickUrl('https://notkick.com/xqc')).toBeNull();
    expect(slugFromKickUrl('chrome://extensions')).toBeNull();
    expect(slugFromKickUrl(undefined)).toBeNull();
  });
});
