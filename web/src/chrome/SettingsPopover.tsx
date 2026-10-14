// The gear's popover: shortcuts, notifications (asked for only here, never on load), chime, motion and Toby mode.
// Saved per browser.
import { useEffect, useId, useRef } from 'react';
import type { Prefs } from '../prefs/prefs';
import type { NotifyPermission } from '../notify/permission';

type Props = {
  prefs: Prefs;
  paletteKey: string;
  permission: NotifyPermission;
  onPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  onNotifications: (on: boolean) => void;
  onChime: (on: boolean) => void;
  onClose: () => void;
  anchor: React.RefObject<HTMLElement | null>;
  tobyUrl?: boolean; // ?toby=1 in the address: Toby mode is on for this page whatever the switch says
};

const PERMISSION_TEXT: Record<NotifyPermission, string> = {
  default: 'Your browser will ask once when you switch this on.',
  granted: 'Allowed. Only errors and “needs you”, and only while you’re away from this tab.',
  denied: 'Blocked by the browser. Allow notifications for this site in the browser’s settings, then try again.',
  unsupported: 'This browser has no notifications.',
};

function Switch({ label, hint, checked, disabled, onChange }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <div className="switch">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id}><span className="switch-track" aria-hidden="true" />{label}</label>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}

export function SettingsPopover({ prefs, paletteKey, permission, onPref, onNotifications, onChime, onClose, anchor, tobyUrl = false }: Props) {
  const toby = prefs.tobyMode || tobyUrl;
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    panel.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) close.current();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [anchor]);

  return (
    <div ref={panel} id="settings-panel" className="settings-panel" role="dialog" aria-label="Settings">
      <h2>Settings</h2>
      <fieldset>
        <legend>Shortcuts</legend>
        <Switch label={`${paletteKey} opens Ask Pam`} checked={prefs.paletteHotkey} onChange={(on) => onPref('paletteHotkey', on)} />
        <Switch label="Single-key shortcuts" hint="/ opens Ask Pam, ? shows all shortcuts" checked={prefs.singleKeys} onChange={(on) => onPref('singleKeys', on)} />
      </fieldset>
      <fieldset>
        <legend>Notifications</legend>
        <Switch
          label="Browser notifications"
          hint={PERMISSION_TEXT[permission]}
          checked={prefs.notifications && permission === 'granted'}
          disabled={permission === 'unsupported'}
          onChange={onNotifications}
        />
        <Switch label="Chime" hint={toby ? 'Silent in Toby mode' : 'A soft desk bell when a bot errors or needs you (and the Dundies’ fanfare)'} checked={prefs.chime} onChange={onChime} />
      </fieldset>
      <fieldset>
        <legend>Motion</legend>
        <Switch label="Reduce motion" hint="No camera glides, walk-ins or animated jokes (your system setting counts too)" checked={prefs.reduceMotion} onChange={(on) => onPref('reduceMotion', on)} />
      </fieldset>
      <fieldset>
        <legend>Fun</legend>
        <Switch
          label="Toby mode"
          hint={tobyUrl ? 'On for this page (?toby=1 in the address).' : 'No jokes, ambient life, sounds or easter eggs: a plain dashboard with the same information.'}
          checked={toby}
          disabled={tobyUrl}
          onChange={(on) => onPref('tobyMode', on)}
        />
      </fieldset>
    </div>
  );
}
