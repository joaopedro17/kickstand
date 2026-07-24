import { useEffect, useState } from 'react';
import { withAuthRetry } from '@/lib/auth';
import { resolveChannelsBySlug, KickApiError } from '@/lib/kick-api';
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
      if (!resolvedChannels) throw new Error('Not logged in');
      const [resolved] = resolvedChannels;
      if (!resolved) throw new Error(`No channel found for "${slug}"`);

      const current = await trackedChannelsStorage.getValue();
      if (current.some((c) => c.broadcasterUserId === resolved.broadcaster_user_id)) {
        throw new Error(`"${slug}" is already tracked`);
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
        err instanceof KickApiError
          ? `Kick API error: ${err.message}`
          : err instanceof Error
          ? err.message
          : 'Failed to add channel'
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
          placeholder="channel-slug"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button onClick={handleAdd} disabled={adding}>
          {adding ? 'Adding…' : 'Add'}
        </button>
      </div>
      <p style={{ color: '#666', fontSize: 12, marginTop: -8, marginBottom: 4 }}>
        Kickstand can't look channels up by name — Kick's API only supports finding a
        channel by its exact slug, so you'll need to type it in yourself.
      </p>
      <p style={{ color: '#666', fontSize: 12, marginTop: 0, marginBottom: 12 }}>
        The slug is the part of the channel's URL after kick.com/ — for kick.com/xqc it's{' '}
        <code>xqc</code>.
      </p>
      {addError && <p style={{ color: 'crimson', fontSize: 12 }}>{addError}</p>}

      {sorted.length === 0 && <p>No tracked channels yet. Add one by slug above.</p>}

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
                  {status.viewerCount.toLocaleString()} viewers · {status.category?.name ?? ''}
                </div>
              )}
            </div>
            <button onClick={() => handleToggleMute(channel.broadcasterUserId)}>
              {channel.muted ? 'Unmute' : 'Mute'}
            </button>
            <button onClick={() => handleRemove(channel.broadcasterUserId)}>Remove</button>
          </div>
        );
      })}
    </div>
  );
}
