export type KickApiErrorKind = 'network' | 'unauthorized' | 'rate-limited' | 'other';

export class KickApiError extends Error {
  kind: KickApiErrorKind;
  status?: number;
  /** For 'rate-limited': how long Kick asked callers to wait, when it said. */
  retryAfterMs?: number;

  constructor(
    kind: KickApiErrorKind,
    message: string,
    status?: number,
    options: { retryAfterMs?: number } = {}
  ) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = options.retryAfterMs;
  }
}
