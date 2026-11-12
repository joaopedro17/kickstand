import { updateSettings, type Settings } from '@/lib/settings';

/** A labelled checkbox row, as used throughout Settings. */
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
