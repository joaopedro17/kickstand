import { updateSettings, type Settings } from '@/lib/settings';

/**
 * A labelled on/off switch row, as used throughout Settings. A native
 * checkbox with role="switch" underneath, visually hidden, so keyboard use
 * (Tab, Space) and screen readers ("on"/"off") work as for any switch; the
 * track and knob are drawn from its state with Tailwind peer classes.
 */
export function Toggle({
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
      className="group mt-2 flex cursor-pointer items-center gap-2 text-xs text-white transition hover:text-lime"
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-white/10 bg-ink transition group-hover:border-lime/50 peer-checked:border-lime peer-checked:bg-lime peer-focus-visible:ring-2 peer-focus-visible:ring-lime/40 motion-reduce:transition-none peer-checked:[&>span]:translate-x-4 peer-checked:[&>span]:bg-ink"
      >
        <span className="ml-0.5 h-3.5 w-3.5 rounded-full bg-muted transition-transform duration-150 motion-reduce:transition-none" />
      </span>
      <span>{label}</span>
    </label>
  );
}

/** The settings that are a plain on/off switch. */
type OnOffSetting = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

/** A Toggle bound to one on/off setting. */
export function SettingToggle({
  settings,
  name,
  label,
}: {
  settings: Settings;
  name: OnOffSetting;
  label: string;
}) {
  return (
    <Toggle
      id={`setting-${name}`}
      label={label}
      checked={settings[name]}
      onChange={(on) => updateSettings({ [name]: on })}
    />
  );
}
