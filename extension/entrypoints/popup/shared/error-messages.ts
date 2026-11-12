import { i18n } from '#i18n';

/** Error codes from Kick requests, logins and storage, and the message each one shows. */
const MESSAGE_FOR = {
  network: () => i18n.t('errors.network'),
  unauthorized: () => i18n.t('errors.unauthorized'),
  'rate-limited': () => i18n.t('errors.rateLimited'),
  other: () => i18n.t('errors.other'),
  'storage-full': () => i18n.t('errors.storageFull'),
  cancelled: () => i18n.t('errors.cancelled'),
  oauth_rejected: () => i18n.t('errors.oauth_rejected'),
  no_code: () => i18n.t('errors.no_code'),
  state_mismatch: () => i18n.t('errors.state_mismatch'),
  exchange_failed: () => i18n.t('errors.exchange_failed'),
  not_logged_in: () => i18n.t('errors.not_logged_in'),
  unknown: () => i18n.t('errors.unknown'),
} satisfies Record<string, () => string>;

type ErrorCode = keyof typeof MESSAGE_FOR;

export const ERROR_CODES = Object.keys(MESSAGE_FOR) as ErrorCode[];

function isErrorCode(value: string): value is ErrorCode {
  return Object.hasOwn(MESSAGE_FOR, value);
}

export function translateErrorCode(code: string): string {
  return MESSAGE_FOR[isErrorCode(code) ? code : 'unknown']();
}
