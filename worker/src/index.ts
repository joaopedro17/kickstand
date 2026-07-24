export interface Env {
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  // Comma-separated list of exact chrome-extension:// origins to allow.
  // Firefox is handled separately below — see resolveAllowedOrigin.
  ALLOWED_ORIGINS: string;
}

const KICK_TOKEN_URL = 'https://id.kick.com/oauth/token';

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

function corsHeaders(origin: string | null): HeadersInit {
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function proxyTokenRequest(
  body: Record<string, string>,
  env: Env,
  allowedOrigin: string | null
): Promise<Response> {
  const form = new URLSearchParams({
    ...body,
    client_id: env.CLIENT_ID,
    client_secret: env.CLIENT_SECRET,
  });

  const upstream = await fetch(KICK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(allowedOrigin),
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const allowedOrigin = resolveAllowedOrigin(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(allowedOrigin) });
    }

    if (request.method === 'POST' && url.pathname === '/token') {
      try {
        const { code, code_verifier, redirect_uri } = await request.json<{
          code: string;
          code_verifier: string;
          redirect_uri: string;
        }>();
        return proxyTokenRequest(
          { grant_type: 'authorization_code', code, code_verifier, redirect_uri },
          env,
          allowedOrigin
        );
      } catch {
        return new Response('Invalid JSON body', {
          status: 400,
          headers: corsHeaders(allowedOrigin),
        });
      }
    }

    if (request.method === 'POST' && url.pathname === '/refresh') {
      try {
        const { refresh_token } = await request.json<{ refresh_token: string }>();
        return proxyTokenRequest(
          { grant_type: 'refresh_token', refresh_token },
          env,
          allowedOrigin
        );
      } catch {
        return new Response('Invalid JSON body', {
          status: 400,
          headers: corsHeaders(allowedOrigin),
        });
      }
    }

    return new Response('Not found', {
      status: 404,
      headers: corsHeaders(allowedOrigin),
    });
  },
};
