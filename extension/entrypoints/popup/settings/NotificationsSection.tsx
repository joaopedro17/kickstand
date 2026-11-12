import { useEffect, useState } from 'react';
import { i18n } from '#i18n';
import { allowTabFocus, canFocusTabs, disallowTabFocus, watchTabFocus } from '@/lib/tab-focus';
import { POLL_INTERVALS, updateSettings, type QuietHours, type Settings } from '@/lib/settings';
import { SectionHeader } from '../shared/layout';

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-white transition hover:text-lime"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-[#b8f34a]"
      />
      <span>{label}</span>
    </label>
  );
}

function PollInterval({ settings }: { settings: Settings }) {
  return (
    <div
      role="radiogroup"
      aria-labelledby="poll-interval-label"
      className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white"
    >
      <span id="poll-interval-label" className="text-muted">
        {i18n.t('settings.pollIntervalLabel')}
      </span>
      {POLL_INTERVALS.map((minutes) => (
        <label key={minutes} className="flex cursor-pointer items-center gap-1 transition hover:text-lime">
          <input
            type="radio"
            name="poll-interval"
            checked={settings.pollIntervalMinutes === minutes}
            onChange={() => updateSettings({ pollIntervalMinutes: minutes })}
            className="h-4 w-4 cursor-pointer accent-[#b8f34a]"
          />
          {i18n.t('settings.pollIntervalOption', { count: String(minutes) })}
        </label>
      ))}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Minutes after midnight as the HH:MM a time input shows. */
const asTime = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;

/** A time input's HH:MM as minutes after midnight; null when the field was cleared. */
function minuteOf(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function TimeField({
  id,
  label,
  minute,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  minute: number;
  disabled: boolean;
  onChange: (minute: number) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-1 text-muted">
      {label}
      <input
        id={id}
        type="time"
        value={asTime(minute)}
        disabled={disabled}
        onChange={(e) => {
          const picked = minuteOf(e.target.value);
          if (picked !== null) onChange(picked);
        }}
        className="rounded-lg border border-white/10 bg-ink px-2 py-1 text-white disabled:opacity-50"
      />
    </label>
  );
}

function QuietHoursFields({ quiet }: { quiet: QuietHours }) {
  const change = (changes: Partial<QuietHours>) =>
    updateSettings((current) => ({ quietHours: { ...current.quietHours, ...changes } }));
  return (
    <>
      <Toggle
        id="quiet-hours"
        label={i18n.t('settings.quietHoursToggle')}
        checked={quiet.enabled}
        onChange={(enabled) => change({ enabled })}
      />
      <div className="ml-6 mt-2 flex gap-3 text-xs">
        <TimeField
          id="quiet-from"
          label={i18n.t('settings.quietFrom')}
          minute={quiet.startMinute}
          disabled={!quiet.enabled}
          onChange={(startMinute) => change({ startMinute })}
        />
        <TimeField
          id="quiet-to"
          label={i18n.t('settings.quietTo')}
          minute={quiet.endMinute}
          disabled={!quiet.enabled}
          onChange={(endMinute) => change({ endMinute })}
        />
      </div>
    </>
  );
}

/** On exactly while the browser grants the optional `tabs` permission; see lib/tab-focus. */
function TabFocusToggle() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    canFocusTabs().then(setAllowed).catch(() => {});
    return watchTabFocus(setAllowed);
  }, []);

  function change(on: boolean) {
    // The request is made right in the click handler: browsers only show the
    // permission prompt in response to a user action.
    (on ? allowTabFocus() : disallowTabFocus())
      .then(canFocusTabs)
      .then(setAllowed)
      .catch(() => {});
  }

  return (
    <>
      <Toggle id="focus-tab" label={i18n.t('settings.focusTabToggle')} checked={allowed} onChange={change} />
      <p className="ml-6 mt-1 text-[11px] text-muted">{i18n.t('settings.focusTabHint')}</p>
    </>
  );
}

export function NotificationsSection({ settings }: { settings: Settings }) {
  return (
    <section
      className="mb-5 rounded-2xl border border-white/[0.06] bg-panel p-4 shadow-lg shadow-black/10"
      aria-labelledby="notifications-heading"
    >
      <SectionHeader
        icon="bell"
        title={i18n.t('settings.notificationsTitle')}
        headingId="notifications-heading"
        kicker={i18n.t('settings.notificationsKicker')}
      />
      <Toggle
        id="live-notifications"
        label={i18n.t('settings.notifyToggle')}
        checked={settings.notificationsEnabled}
        onChange={(notificationsEnabled) => updateSettings({ notificationsEnabled })}
      />
      <Toggle
        id="alert-sound"
        label={i18n.t('settings.soundToggle')}
        checked={settings.soundEnabled}
        onChange={(soundEnabled) => updateSettings({ soundEnabled })}
      />
      <Toggle
        id="category-alerts"
        label={i18n.t('settings.categoryChangeToggle')}
        checked={settings.notifyCategoryChange}
        onChange={(notifyCategoryChange) => updateSettings({ notifyCategoryChange })}
      />
      <TabFocusToggle />
      <QuietHoursFields quiet={settings.quietHours} />
      <PollInterval settings={settings} />
    </section>
  );
}
