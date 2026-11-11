export interface Env {
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  // Comma-separated list of exact chrome-extension:// origins to allow.
  // Firefox is handled separately below — see resolveAllowedOrigin.
  ALLOWED_ORIGINS: string;
}

const KICK_TOKEN_URL = 'https://id.kick.com/oauth/token';

/**
 * The Kickstand extension that sent the request, or null for anyone else.
 * Extensions always send an Origin on these cross-origin requests; a request
 * without one comes from something that isn't a browser extension.
 */
function resolveAllowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;

  // Firefox randomizes the moz-extension:// UUID per browser profile (to
  // prevent extension fingerprinting by websites), so it's never one fixed,
  // knowable value the way a Chrome Web Store ID is. A plain webpage can't
  // spoof an Origin header with the moz-extension:// scheme — only a real
  // Firefox extension context can produce one — so accepting any origin on
  // that scheme is safe and is the only workable check for Firefox.
  if (origin.startsWith('moz-extension://')) return origin;

  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function reply(body: string | null, status: number, origin: string): Response {
  return new Response(body, { status, headers: corsHeaders(origin) });
}

/** The named fields of a JSON body, each a non-empty string; null if the body isn't that. */
async function readFields<K extends string>(
  request: Request,
  names: readonly K[]
): Promise<Record<K, string> | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) return null;
  const fields = body as Record<string, unknown>;
  const valid = names.every((name) => typeof fields[name] === 'string' && fields[name] !== '');
  // Only the named fields: anything else in the body is never forwarded.
  return valid
    ? (Object.fromEntries(names.map((name) => [name, fields[name]])) as Record<K, string>)
    : null;
}

async function proxyTokenRequest(
  grant: Record<string, string>,
  env: Env,
  origin: string
): Promise<Response> {
  const form = new URLSearchParams({
    ...grant,
    client_id: env.CLIENT_ID,
    client_secret: env.CLIENT_SECRET,
  });

  let upstream: Response;
  try {
    upstream = await fetch(KICK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
  } catch {
    return reply('Could not reach Kick', 502, origin);
  }

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

/** What each route needs from the body, and the grant it becomes. */
const ROUTES = {
  '/token': {
    fields: ['code', 'code_verifier', 'redirect_uri'] as const,
    grantType: 'authorization_code',
  },
  '/refresh': {
    fields: ['refresh_token'] as const,
    grantType: 'refresh_token',
  },
};

async function handle(request: Request, env: Env, origin: string): Promise<Response> {
  if (request.method === 'OPTIONS') return reply(null, 204, origin);

  const path = new URL(request.url).pathname;
  const route = ROUTES[path as keyof typeof ROUTES];
  if (request.method !== 'POST' || !route) return reply('Not found', 404, origin);

  const fields = await readFields(request, route.fields);
  if (!fields) return reply('Invalid request body', 400, origin);
  return proxyTokenRequest({ grant_type: route.grantType, ...fields }, env, origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = resolveAllowedOrigin(request, env);
    // Refused before anything else, preflight included: only the extension
    // may have the client secret attached to its requests.
    if (!origin) return new Response('Forbidden', { status: 403 });
    return handle(request, env, origin);
  },
};
