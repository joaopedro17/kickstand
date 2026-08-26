import { i18n } from '#i18n';

export const CODE_TO_KEY = {
  network: 'network',
  unauthorized: 'unauthorized',
  'rate-limited': 'rateLimited',
  other: 'other',
  cancelled: 'cancelled',
  oauth_rejected: 'oauth_rejected',
  no_code: 'no_code',
  state_mismatch: 'state_mismatch',
  exchange_failed: 'exchange_failed',
  not_logged_in: 'not_logged_in',
  unknown: 'unknown',
} as const;

type ErrorCode = keyof typeof CODE_TO_KEY;

function isErrorCode(value: string): value is ErrorCode {
  return value in CODE_TO_KEY;
}

export function translateErrorCode(code: string): string {
  const key = isErrorCode(code) ? CODE_TO_KEY[code] : CODE_TO_KEY.unknown;
  return i18n.t(`errors.${key}` as Parameters<typeof i18n.t>[0]);
}
