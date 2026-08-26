import { useEffect, useState } from 'react';
import { i18n } from '#i18n';
import { withAuthRetry } from '@/lib/auth';
import { resolveChannelsBySlug, KickApiError } from '@/lib/kick-api';
import { translateErrorCode } from '@/lib/error-messages';
import {
  trackedChannelsStorage,
  liveStatusStorage,
  type TrackedChannel,
  type LiveStatusCache,
} from '@/lib/storage';

export function FollowingTab() {
  const [channels, setChannels] = useState<TrackedChannel[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveStatusCache>({});
  const [slugInput, setSlugInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    trackedChannelsStorage.getValue().then(setChannels);
    liveStatusStorage.getValue().then(setLiveStatus);
    const unwatchChannels = trackedChannelsStorage.watch(setChannels);
    const unwatchStatus = liveStatusStorage.watch(setLiveStatus);
    return () => {
      unwatchChannels();
      unwatchStatus();
    };
  }, []);

  async function handleAdd() {
    const slug = slugInput.trim().toLowerCase();
    if (!slug) return;
    setAddError(null);
    setAdding(true);
    try {
      const resolvedChannels = await withAuthRetry((accessToken) =>
        resolveChannelsBySlug([slug], accessToken)
      );
      if (!resolvedChannels) {
        setAddError(translateErrorCode('not_logged_in'));
        return;
      }
      const [resolved] = resolvedChannels;
      if (!resolved) {
        setAddError(i18n.t('following.channelNotFound', { slug }));
        return;
      }

      const current = await trackedChannelsStorage.getValue();
      if (current.some((c) => c.broadcasterUserId === resolved.broadcaster_user_id)) {
        setAddError(i18n.t('following.alreadyTracked', { slug }));
        return;
      }

      const updated: TrackedChannel[] = [
        ...current,
        {
          broadcasterUserId: resolved.broadcaster_user_id,
          slug: resolved.slug,
          addedAt: Date.now(),
          muted: false,
        },
      ];
      await trackedChannelsStorage.setValue(updated);
      setSlugInput('');
      await browser.runtime.sendMessage({ type: 'poll-now' });
    } catch (err) {
      setAddError(
        err instanceof KickApiError ? translateErrorCode(err.kind) : translateErrorCode('unknown')
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: number) {
    const updated = channels.filter((c) => c.broadcasterUserId !== id);
    await trackedChannelsStorage.setValue(updated);
  }

  async function handleToggleMute(id: number) {
    const updated = channels.map((c) =>
      c.broadcasterUserId === id ? { ...c, muted: !c.muted } : c
    );
    await trackedChannelsStorage.setValue(updated);
  }

  function openChannel(slug: string) {
    browser.tabs.create({ url: `https://kick.com/${slug}` });
  }

  const sorted = [...channels].sort((a, b) => {
    const aLive = liveStatus[a.broadcasterUserId]?.isLive ?? false;
    const bLive = liveStatus[b.broadcasterUserId]?.isLive ?? false;
    if (aLive !== bLive) return aLive ? -1 : 1;
    const aViewers = liveStatus[a.broadcasterUserId]?.viewerCount ?? 0;
    const bViewers = liveStatus[b.broadcasterUserId]?.viewerCount ?? 0;
    return bViewers - aViewers;
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        <input
          value={slugInput}
          onChange={(e) => setSlugInput(e.target.value)}
          placeholder={i18n.t('following.slugPlaceholder')}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button onClick={handleAdd} disabled={adding}>
          {adding ? i18n.t('following.addButtonLoading') : i18n.t('following.addButton')}
        </button>
      </div>
      <p style={{ color: '#666', fontSize: 12, marginTop: -8, marginBottom: 4 }}>
        {i18n.t('following.slugHelp1')}
      </p>
      <p style={{ color: '#666', fontSize: 12, marginTop: 0, marginBottom: 12 }}>
        {i18n.t('following.slugHelp2Prefix')} <code>xqc</code>.
      </p>
      {addError && <p style={{ color: 'crimson', fontSize: 12 }}>{addError}</p>}

      {sorted.length === 0 && <p>{i18n.t('following.emptyState')}</p>}

      {sorted.map((channel) => {
        const status = liveStatus[channel.broadcasterUserId];
        return (
          <div
            key={channel.broadcasterUserId}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #eee' }}
          >
            {status?.thumbnail && (
              <img src={status.thumbnail} alt="" width={64} height={36} style={{ objectFit: 'cover' }} />
            )}
            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openChannel(channel.slug)}>
              <div style={{ fontWeight: status?.isLive ? 'bold' : 'normal' }}>
                {channel.slug} {status?.isLive && '🔴'}
              </div>
              {status?.isLive && (
                <div style={{ fontSize: 12, color: '#666' }}>
                  {status.viewerCount.toLocaleString()} {i18n.t('common.viewers')} ·{' '}
                  {status.category?.name ?? ''}
                </div>
              )}
            </div>
            <button onClick={() => handleToggleMute(channel.broadcasterUserId)}>
              {channel.muted ? i18n.t('following.unmute') : i18n.t('following.mute')}
            </button>
            <button onClick={() => handleRemove(channel.broadcasterUserId)}>
              {i18n.t('common.remove')}
            </button>
          </div>
        );
      })}
    </div>
  );
}
