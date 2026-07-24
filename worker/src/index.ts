export interface Env {
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  ALLOWED_ORIGIN: string;
}

const KICK_TOKEN_URL = 'https://id.kick.com/oauth/token';

function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function proxyTokenRequest(
  body: Record<string, string>,
  env: Env
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
      ...corsHeaders(env.ALLOWED_ORIGIN),
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env.ALLOWED_ORIGIN) });
    }

    if (request.method === 'POST' && url.pathname === '/token') {
      const { code, code_verifier, redirect_uri } = await request.json<{
        code: string;
        code_verifier: string;
        redirect_uri: string;
      }>();
      return proxyTokenRequest(
        { grant_type: 'authorization_code', code, code_verifier, redirect_uri },
        env
      );
    }

    if (request.method === 'POST' && url.pathname === '/refresh') {
      const { refresh_token } = await request.json<{ refresh_token: string }>();
      return proxyTokenRequest(
        { grant_type: 'refresh_token', refresh_token },
        env
      );
    }

    return new Response('Not found', {
      status: 404,
      headers: corsHeaders(env.ALLOWED_ORIGIN),
    });
  },
};
