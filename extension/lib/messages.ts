import { browser } from 'wxt/browser';

/**
 * Every request the popup can make of the background, and what each one
 * answers with. Adding a request means adding it here; the compiler then
 * demands a handler for it in the background.
 */
export type LoginResult = { success: true } | { success: false; error: string; detail?: string };

/**
 * The background's answer to a token request. `unavailable` means a needed
 * refresh failed for a transient reason: the session is intact, but there is
 * no usable token right now.
 */
export type TokenReply =
  | { status: 'ok'; accessToken: string }
  | { status: 'logged-out' }
  | { status: 'unavailable' };

interface Protocol {
  'poll-now': { request: { type: 'poll-now' }; reply: void };
  login: { request: { type: 'login' }; reply: LoginResult };
  'get-access-token': {
    request: { type: 'get-access-token'; rejectedToken?: string };
    reply: TokenReply;
  };
  logout: { request: { type: 'logout' }; reply: void };
}

type RequestType = keyof Protocol;
export type Request = Protocol[RequestType]['request'];
type ReplyTo<T extends RequestType> = Protocol[T]['reply'];

export type RequestHandlers = {
  [T in RequestType]: (request: Protocol[T]['request']) => Promise<ReplyTo<T>>;
};

/** What actually crosses the message channel, so failures survive the trip. */
type Envelope<T> = { ok: true; value: T } | { ok: false; error: string };

const REQUEST_TYPES: ReadonlySet<string> = new Set<RequestType>([
  'poll-now',
  'login',
  'get-access-token',
  'logout',
]);

function parseRequest(raw: unknown): Request | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const type = (raw as { type?: unknown }).type;
  return typeof type === 'string' && REQUEST_TYPES.has(type) ? (raw as Request) : null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Builds the background's `runtime.onMessage` listener.
 *
 * Replies through `sendResponse` and returns `true` to keep the channel open,
 * rather than returning a promise: Chrome only honours a returned promise from
 * version 148, still rolling out, and on older versions the sender gets
 * `undefined` back. Messages that aren't a known request return `undefined`,
 * leaving them for any other listener.
 */
export function listenForRequests(handlers: RequestHandlers) {
  return (
    message: unknown,
    _sender: unknown,
    sendResponse: (reply: Envelope<unknown>) => void
  ): true | undefined => {
    const request = parseRequest(message);
    if (!request) return undefined;
    const handle = handlers[request.type] as (r: Request) => Promise<unknown>;
    handle(request).then(
      (value) => sendResponse({ ok: true, value }),
      (err: unknown) => sendResponse({ ok: false, error: errorMessage(err) })
    );
    return true;
  };
}

/** Sends a request to the background and returns its reply, or throws its error. */
export async function sendRequest<R extends Request>(request: R): Promise<ReplyTo<R['type']>> {
  const envelope = (await browser.runtime.sendMessage(request)) as
    | Envelope<ReplyTo<R['type']>>
    | undefined;
  if (!envelope) throw new Error(`No reply from the background to "${request.type}"`);
  if (!envelope.ok) throw new Error(envelope.error);
  return envelope.value;
}
