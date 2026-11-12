import { useState } from 'react';
import { i18n } from '#i18n';
import type { TrackedChannel } from '@/lib/channels/tracked';
import { GhostButton, PrimaryButton } from '../shared/controls';
import { Icon } from '../shared/Icon';
import { AddNotices, useSlugAdder } from '../shared/useSlugAdder';
import { SettingsSection } from './SettingsSection';

const FILE_NAME = 'kickstand-channels.txt';
const COPIED_FOR_MS = 2000;

/** The tracked slugs, one per line: the format import reads back. */
const asText = (channels: TrackedChannel[]) => channels.map((c) => `${c.slug}\n`).join('');

function download(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = FILE_NAME;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Copy or download the list, and import one. Import is a text box rather than
 * a file picker: opening a file picker closes the popup on Firefox.
 */
export function TransferSection({ channels }: { channels: TrackedChannel[] }) {
  const [copied, setCopied] = useState(false);
  const { text, setText, notices, adding, add } = useSlugAdder();
  const empty = channels.length === 0;

  async function copy() {
    await navigator.clipboard.writeText(asText(channels));
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_FOR_MS);
  }

  return (
    <SettingsSection
      id="transfer"
      icon="list"
      title={i18n.t('settings.transferTitle')}
      kicker={i18n.t('settings.transferKicker')}
    >
      <div className="mb-3 flex gap-2">
        <GhostButton type="button" disabled={empty} onClick={() => copy().catch(() => {})}>
          <Icon icon={copied ? 'check' : 'copy'} className="text-sm" />
          {copied ? i18n.t('settings.copied') : i18n.t('settings.copyList')}
        </GhostButton>
        <GhostButton type="button" disabled={empty} onClick={() => download(asText(channels))}>
          <Icon icon="download" className="text-sm" />
          {i18n.t('settings.downloadList')}
        </GhostButton>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label htmlFor="import-channels" className="sr-only">
          {i18n.t('settings.importLabel')}
        </label>
        <textarea
          id="import-channels"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={i18n.t('settings.importPlaceholder')}
          spellCheck={false}
          className="w-full resize-y rounded-xl border border-white/10 bg-ink px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-muted/70 hover:border-white/20 focus:border-lime focus:ring-2 focus:ring-lime/20"
        />
        <PrimaryButton type="submit" disabled={adding || !text.trim()} className="mt-2 w-full">
          <Icon icon="upload" className="text-base" />
          {i18n.t('settings.importButton')}
        </PrimaryButton>
      </form>
      <AddNotices notices={notices} />
    </SettingsSection>
  );
}
