import { i18n } from '#i18n';

const ERROR_KEYS = [
  'network',
  'unauthorized',
  'rate-limited',
  'other',
  'cancelled',
  'oauth_rejected',
  'no_code',
  'state_mismatch',
  'exchange_failed',
  'not_logged_in',
  'unknown',
] as const;

type ErrorKey = (typeof ERROR_KEYS)[number];

function isErrorKey(value: string): value is ErrorKey {
  return (ERROR_KEYS as readonly string[]).includes(value);
}

export function translateErrorCode(code: string): string {
  const key = isErrorKey(code) ? code : 'unknown';
  return i18n.t(`errors.${key}` as Parameters<typeof i18n.t>[0]);
}
