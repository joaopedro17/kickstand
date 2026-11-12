import { describe, it, expect } from 'vitest';
import {
  parseChannels,
  parseCurrentUser,
  parseLivestreams,
  parseLivestreamPage,
  parseCategoryPage,
  parseTokenResponse,
} from '@/lib/kick/parse';
import { KickApiError } from '@/lib/kick/api';

function rawStream(overrides: Record<string, unknown> = {}) {
  return {
    id: 'abc',
    broadcaster_user: { id: 7, username: 'Streamer', profile_picture: 'https://pic' },
    channel: { slug: 'streamer' },
    title: 'Hello',
    category: { id: 1, name: 'Just Chatting', thumbnail: 'https://cat' },
    thumbnail: 'https://thumb',
    started_at: '2026-11-11T10:00:00Z',
    viewer_count: 42,
    has_mature_content: true,
    language_code: 'pt',
    tags: ['x'],
    ...overrides,
  };
}

const expectRejected = (fn: () => unknown) => {
  expect(fn).toThrow(KickApiError);
  try {
    fn();
  } catch (err) {
    expect((err as KickApiError).kind).toBe('other');
  }
};

describe('parseLivestreams', () => {
  it('keeps the fields Kickstand uses', () => {
    expect(parseLivestreams({ data: [rawStream()] })).toEqual([
      {
        id: 'abc',
        broadcaster: { id: 7, username: 'Streamer', profilePicture: 'https://pic' },
        slug: 'streamer',
        title: 'Hello',
        category: { id: 1, name: 'Just Chatting' },
        thumbnail: 'https://thumb',
        startedAt: '2026-11-11T10:00:00Z',
        viewerCount: 42,
        hasMatureContent: true,
        languageCode: 'pt',
      },
    ]);
  });

  it('fills in what is missing but not essential', () => {
    const [stream] = parseLivestreams({
      data: [
        rawStream({
          id: 99,
          title: null,
          category: null,
          thumbnail: undefined,
          started_at: null,
          has_mature_content: undefined,
          language_code: undefined,
          broadcaster_user: { id: 7 },
        }),
      ],
    });

    expect(stream).toMatchObject({
      id: '99',
      title: '',
      category: null,
      thumbnail: null,
      startedAt: null,
      hasMatureContent: false,
      languageCode: '',
      broadcaster: { id: 7, username: '', profilePicture: null },
    });
  });

  it.each([
    ['no broadcaster id', { broadcaster_user: { username: 'x' } }],
    ['no slug', { channel: {} }],
    ['a viewer count that is not a number', { viewer_count: '42' }],
  ])('skips a stream with %s, keeping the others', (_label, broken) => {
    const streams = parseLivestreams({ data: [rawStream(broken), rawStream({ id: 'ok' })] });

    expect(streams.map((s) => s.id)).toEqual(['ok']);
  });

  it.each([null, 'oops', {}, { data: 'nope' }])('rejects a response without a data list: %j', (raw) => {
    expectRejected(() => parseLivestreams(raw));
  });
});

describe('parseLivestreamPage', () => {
  it('returns the streams and the next cursor', () => {
    expect(
      parseLivestreamPage({ data: [rawStream()], pagination: { next_cursor: 'next' } })
    ).toMatchObject({ items: [{ id: 'abc' }], nextCursor: 'next' });
  });

  it('treats a missing or empty cursor as the last page', () => {
    expect(parseLivestreamPage({ data: [] }).nextCursor).toBeNull();
    expect(parseLivestreamPage({ data: [], pagination: { next_cursor: '' } }).nextCursor).toBeNull();
  });
});

describe('parseCategoryPage', () => {
  it('keeps id, name, thumbnail and tags', () => {
    expect(
      parseCategoryPage({
        data: [{ id: 3, name: 'Slots', thumbnail: 'https://t', tags: ['casino', 7] }],
        pagination: { next_cursor: null },
      })
    ).toEqual({
      items: [{ id: 3, name: 'Slots', thumbnail: 'https://t', tags: ['casino'] }],
      nextCursor: null,
    });
  });

  it('skips a category without a name', () => {
    expect(parseCategoryPage({ data: [{ id: 3 }] }).items).toEqual([]);
  });
});

describe('parseChannels', () => {
  it('keeps only the broadcaster id and slug', () => {
    expect(
      parseChannels({
        data: [{ broadcaster_user_id: 5, slug: 'xqc', stream_title: 'ignored', stream: null }],
      })
    ).toEqual([{ broadcasterUserId: 5, slug: 'xqc' }]);
  });
});

describe('parseCurrentUser', () => {
  it('keeps the id and profile picture, and never the email address', () => {
    const user = parseCurrentUser({
      data: [{ user_id: 1, name: 'me', email: 'me@example.com', profile_picture: 'https://me' }],
    });

    expect(user).toEqual({ userId: 1, profilePicture: 'https://me' });
    expect(JSON.stringify(user)).not.toContain('example.com');
  });

  it('rejects a response with no user', () => {
    expectRejected(() => parseCurrentUser({ data: [] }));
  });
});

describe('parseTokenResponse', () => {
  const valid = {
    access_token: 'a',
    token_type: 'Bearer',
    expires_in: 7200,
    refresh_token: 'r',
    refresh_expires_in: 2592000,
    scope: 'user:read channel:read',
  };

  it('keeps the tokens and their lifetimes', () => {
    expect(parseTokenResponse(valid)).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresInSeconds: 7200,
      refreshExpiresInSeconds: 2592000,
    });
  });

  it.each(['access_token', 'refresh_token', 'expires_in', 'refresh_expires_in'])(
    'rejects a response without %s',
    (field) => {
      const broken: Record<string, unknown> = { ...valid };
      delete broken[field];
      expectRejected(() => parseTokenResponse(broken));
    }
  );
});
