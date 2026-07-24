export const KICK_API_BASE = 'https://api.kick.com';
export const KICK_AUTHORIZE_URL = 'https://id.kick.com/oauth/authorize';

// TODO(setup): replace with the client_id from your registered Kick OAuth app.
export const KICK_CLIENT_ID = 'REPLACE_WITH_KICK_CLIENT_ID';

export const KICK_SCOPES = ['user:read', 'channel:read'];

// Points at `wrangler dev` locally; replace with the deployed Worker URL for production builds.
export const WORKER_BASE_URL = 'http://localhost:8787';
