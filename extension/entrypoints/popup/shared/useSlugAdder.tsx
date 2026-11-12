import { useState } from 'react';
import { i18n } from '#i18n';
import { isStorageFullError, MAX_TRACKED, TrackedListFullError } from '@/lib/channels/tracked';
import { MAX_SLUGS_PER_SUBMIT, parseSlugInput, type SlugInput } from '@/lib/channels/slug-input';
import { KickApiError } from '@/lib/kick/error';
import { translateErrorCode } from './error-messages';
import { trackSlugs, type SlugOutcome } from './track';

function describeAddError(err: unknown): string {
  if (err instanceof TrackedListFullError) {
    return i18n.t('following.limitReached', { max: String(MAX_TRACKED) });
  }
  if (isStorageFullError(err)) return translateErrorCode('storage-full');
  return translateErrorCode(err instanceof KickApiError ? err.kind : 'unknown');
}

interface Notice {
  tone: 'ok' | 'error';
  text: string;
}

const listed = (items: string[]) => items.join(', ');

/** One line per group of channels that met the same fate, the ones added first. */
function noticesFor(input: SlugInput, outcome: SlugOutcome): Notice[] {
  const notices: [boolean, Notice][] = [
    [outcome.added.length > 0, { tone: 'ok', text: i18n.t('following.added', { slugs: listed(outcome.added.map((c) => c.slug)) }) }],
    [outcome.alreadyTracked.length > 0, { tone: 'error', text: i18n.t('following.alreadyTracked', { slugs: listed(outcome.alreadyTracked.map((c) => c.slug)) }) }],
    [outcome.notFound.length > 0, { tone: 'error', text: i18n.t('following.channelNotFound', { slugs: listed(outcome.notFound) }) }],
    [input.invalid.length > 0, { tone: 'error', text: i18n.t('following.invalidInput', { items: listed(input.invalid) }) }],
    [input.skipped.length > 0, { tone: 'error', text: i18n.t('following.tooMany', { max: String(MAX_SLUGS_PER_SUBMIT), count: String(input.skipped.length) }) }],
  ];
  return notices.filter(([shown]) => shown).map(([, notice]) => notice);
}

const NOTHING_ADDED: SlugOutcome = { added: [], alreadyTracked: [], notFound: [] };

/** Adds the channels named in a piece of text, and says what became of each. */
export function useSlugAdder() {
  const [text, setText] = useState('');
  const [notices, setNotices] = useState<Notice[]>([]);
  const [adding, setAdding] = useState(false);

  async function add() {
    const input = parseSlugInput(text);
    setNotices([]);
    setAdding(true);
    try {
      const outcome = input.slugs.length > 0 ? await trackSlugs(input.slugs) : NOTHING_ADDED;
      if (!outcome) {
        setNotices([{ tone: 'error', text: translateErrorCode('not_logged_in') }]);
        return;
      }
      setNotices(noticesFor(input, outcome));
      // What still needs the user's attention stays in the box.
      setText([...input.invalid, ...outcome.notFound, ...input.skipped].join(' '));
    } catch (err) {
      setNotices([{ tone: 'error', text: describeAddError(err) }]);
    } finally {
      setAdding(false);
    }
  }

  return { text, setText, notices, adding, add };
}

export function AddNotices({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1" aria-live="polite">
      {notices.map((notice) => (
        <li
          key={notice.text}
          className={
            notice.tone === 'ok'
              ? 'rounded-xl border border-lime/30 bg-lime/10 px-3 py-2 text-xs text-lime'
              : 'rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200'
          }
        >
          {notice.text}
        </li>
      ))}
    </ul>
  );
}
