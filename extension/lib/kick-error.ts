export type KickApiErrorKind = 'network' | 'unauthorized' | 'rate-limited' | 'other';

export class KickApiError extends Error {
  kind: KickApiErrorKind;
  status?: number;

  constructor(kind: KickApiErrorKind, message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}
