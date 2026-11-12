import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker, { type Env } from '../src/index';

const CHROME = 'chrome-extension://fofneiapfajbddbhiphbockicakhfdpn';
const FIREFOX = 'moz-extension://0b1f6d4e-1234-4f5a-9bcd-1234567890ab';
const KICK_TOKEN_URL = 'https://id.kick.com/oauth/token';

const env: Env = {
  CLIENT_ID: 'client-id',
  CLIENT_SECRET: 'client-secret',
  ALLOWED_ORIGINS: `${CHROME}, chrome-extension://otherid`,
};

function post(path: string, body: unknown, origin: string | null = CHROME): Request {
  return new Request(`https://proxy.example${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const tokenBody = { code: 'abc', code_verifier: 'verifier', redirect_uri: 'https://ext/cb' };

let kick: ReturnType<typeof vi.fn>;

beforeEach(() => {
  kick = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r' }), { status: 200 })
  );
  vi.stubGlobal('fetch', kick);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function sentToKick(): URLSearchParams {
  const [, init] = kick.mock.calls[0];
  return new URLSearchParams(init.body);
}

describe('POST /token', () => {
  it('adds the client credentials and forwards the code exchange to Kick', async () => {
    const res = await worker.fetch(post('/token', tokenBody), env);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access_token: 'a', refresh_token: 'r' });
    expect(kick.mock.calls[0][0]).toBe(KICK_TOKEN_URL);
    expect(Object.fromEntries(sentToKick())).toEqual({
      grant_type: 'authorization_code',
      code: 'abc',
      code_verifier: 'verifier',
      redirect_uri: 'https://ext/cb',
      client_id: 'client-id',
      client_secret: 'client-secret',
    });
  });

  it('lets the extension read the answer (CORS)', async () => {
    const res = await worker.fetch(post('/token', tokenBody), env);

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(CHROME);
  });

  it('passes Kick\'s refusal through with its status', async () => {
    kick.mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 400 }));

    const res = await worker.fetch(post('/token', tokenBody), env);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_grant' });
  });

  it.each([
    ['a missing code', { code_verifier: 'v', redirect_uri: 'r' }],
    ['an empty verifier', { code: 'c', code_verifier: '', redirect_uri: 'r' }],
    ['a redirect uri that is not text', { code: 'c', code_verifier: 'v', redirect_uri: 5 }],
  ])('refuses %s without contacting Kick', async (_label, body) => {
    const res = await worker.fetch(post('/token', body), env);

    expect(res.status).toBe(400);
    expect(kick).not.toHaveBeenCalled();
  });
});

describe('forwarding', () => {
  it('sends Kick only the fields the route needs, so a body cannot change the grant', async () => {
    await worker.fetch(
      post('/refresh', { refresh_token: 'r1', grant_type: 'client_credentials', scope: 'all' }),
      env
    );

    expect(Object.fromEntries(sentToKick())).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'r1',
      client_id: 'client-id',
      client_secret: 'client-secret',
    });
  });
});

describe('POST /refresh', () => {
  it('forwards the refresh to Kick with the client credentials', async () => {
    const res = await worker.fetch(post('/refresh', { refresh_token: 'r1' }), env);

    expect(res.status).toBe(200);
    expect(Object.fromEntries(sentToKick())).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'r1',
      client_id: 'client-id',
      client_secret: 'client-secret',
    });
  });

  it('refuses a missing refresh token without contacting Kick', async () => {
    const res = await worker.fetch(post('/refresh', {}), env);

    expect(res.status).toBe(400);
    expect(kick).not.toHaveBeenCalled();
  });
});

describe('who may use the proxy', () => {
  it('serves a Firefox extension, whose id differs per profile', async () => {
    const res = await worker.fetch(post('/refresh', { refresh_token: 'r' }, FIREFOX), env);

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(FIREFOX);
  });

  it.each([
    ['a web page', 'https://evil.example'],
    ['another Chrome extension', 'chrome-extension://someoneelse'],
    ['a client sending no origin', null],
  ])('turns away %s without contacting Kick', async (_label, origin) => {
    const res = await worker.fetch(post('/token', tokenBody, origin), env);

    expect(res.status).toBe(403);
    expect(kick).not.toHaveBeenCalled();
  });

  it('answers the CORS preflight for an allowed origin', async () => {
    const res = await worker.fetch(
      new Request('https://proxy.example/token', { method: 'OPTIONS', headers: { Origin: CHROME } }),
      env
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(CHROME);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('refuses the CORS preflight for anyone else', async () => {
    const res = await worker.fetch(
      new Request('https://proxy.example/token', {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example' },
      }),
      env
    );

    expect(res.status).toBe(403);
  });
});

describe('everything else', () => {
  it('refuses a body that is not JSON', async () => {
    const res = await worker.fetch(post('/token', 'not json'), env);

    expect(res.status).toBe(400);
    expect(kick).not.toHaveBeenCalled();
  });

  it.each(['null', '"text"', '[1,2]'])('refuses a JSON body that is not an object: %s', async (raw) => {
    const res = await worker.fetch(post('/refresh', raw), env);

    expect(res.status).toBe(400);
    expect(kick).not.toHaveBeenCalled();
  });

  it('answers 502 when Kick cannot be reached, and the extension can still read it', async () => {
    kick.mockRejectedValue(new TypeError('network down'));

    const res = await worker.fetch(post('/token', tokenBody), env);

    expect(res.status).toBe(502);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(CHROME);
  });

  it('answers 404 for an unknown path', async () => {
    const res = await worker.fetch(post('/elsewhere', {}), env);

    expect(res.status).toBe(404);
  });
});
