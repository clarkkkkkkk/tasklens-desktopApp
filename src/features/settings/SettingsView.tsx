import { NativeReminderSettings } from './NativeReminderSettings';
import { VoiceSettings } from '../voice/VoiceSettings';
import { LocalAISettings } from './LocalAISettings';
import { MotionHeading } from '../../components/motion/MotionHeading';
import { useState } from 'react';
import { Bell, Download, HardDrive, Monitor, ShieldCheck } from '../../components/icons';
import { useApp } from '../../app/context';
import { Button, ErrorState } from '../../components/ui';
import { downloadText } from '../../lib/images';
import { presets } from '../../services/reminders/ReminderScheduler';
import type { Settings } from '../../types/action';
export function SettingsView({ onReplay }: { onReplay: () => void }) {
  const { snapshot, saveSettings, services } = useApp();
  const [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const settings = snapshot.settings;
  const reminders = services.reminders.upcoming(snapshot.actions, settings).slice(0, 5);
  async function update(next: Settings) {
    setError('');
    setPending(true);
    try {
      await saveSettings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save preferences');
    } finally {
      setPending(false);
    }
  }
  async function backup() {
    try {
      downloadText(await services.repository.exportRaw(), 'tasklens-backup.json');
    } catch {
      setError('Storage is unavailable. The backup could not be read.');
    }
  }
  return (
    <section className="settings-view">
      <div className="page-heading">
        <div className="eyebrow">MAKE YOURSELF AT HOME</div>
        <MotionHeading>Settings</MotionHeading>
        <p>A few preferences. A workspace that feels like yours.</p>
      </div>
      {error && <ErrorState message={error} />}
      <VoiceSettings />
      <section className="settings-section">
        <h2>
          <Monitor size={18} />
          General
        </h2>
        <div className="setting-row">
          <div>
            <h3>Take another look</h3>
            <p>A short introduction to your workspace.</p>
          </div>
          <Button onClick={onReplay} disabled={pending}>
            Replay onboarding
          </Button>
        </div>
        <div className="setting-row">
          <div>
            <h3>Launch at startup</h3>
            <p>Native startup registration is coming in a future phase.</p>
          </div>
          <input type="checkbox" disabled aria-label="Launch at startup (not available yet)" />
        </div>
      </section>
      <section className="settings-section">
        <h2>
          <Bell size={18} />
          Notifications
        </h2>
        <div className="setting-row">
          <div>
            <h3>Enable reminders</h3>
            <p>
              Keep reminder selections active. Desktop notification delivery requires separate
              explicit activation below.
            </p>
          </div>
          <input
            aria-label="Enable reminders"
            type="checkbox"
            checked={settings.remindersEnabled}
            disabled={pending}
            onChange={(e) => void update({ ...settings, remindersEnabled: e.target.checked })}
          />
        </div>
        <NativeReminderSettings />
        <div className="setting-subsection">
          <h3>Default reminder presets</h3>
          <p className="field-help">Applied to new items and sample results.</p>
          <div className="preset-options">
            {presets.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={settings.defaultReminders.includes(p.id)}
                  disabled={pending}
                  onChange={(e) =>
                    void update({
                      ...settings,
                      defaultReminders: e.target.checked
                        ? [...settings.defaultReminders, p.id]
                        : settings.defaultReminders.filter((x) => x !== p.id),
                    })
                  }
                />
                {p.label}
              </label>
            ))}
          </div>
        </div>
        <div className="setting-subsection">
          <h3>Upcoming reminder configurations</h3>
          {reminders.length ? (
            <ul className="upcoming-reminders">
              {reminders.map(({ actionId, title, reminder }) => (
                <li key={`${actionId}-${reminder.id}`}>
                  <span>
                    {title}
                    <small>{reminder.label}</small>
                  </span>
                  <time dateTime={reminder.datetime}>
                    {new Date(reminder.datetime).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-help">
              {settings.remindersEnabled
                ? 'No upcoming reminders. Add a date and reminder to a confirmed item.'
                : 'Reminders are disabled. Your saved selections are preserved.'}
            </p>
          )}
        </div>
      </section>
      <section className="settings-section">
        <h2>
          <Monitor size={18} />
          Appearance
        </h2>
        <div className="setting-row">
          <div>
            <h3>Light theme</h3>
            <p>A calm, clear space for your plans.</p>
          </div>
          <span className="badge">Active</span>
        </div>
      </section>
      <LocalAISettings settings={settings} onUpdate={update} pending={pending} />
      <section className="settings-section">
        <h2>
          <HardDrive size={18} />
          Your data
        </h2>
        <div className="setting-row">
          <div>
            <h3>Stored on this device</h3>
            <p>
              LocalStorage · {snapshot.actions.length} saved items. Source previews are reduced in
              size. Backups contain your private data.
            </p>
          </div>
          <Button onClick={backup}>
            <Download size={16} />
            Export backup
          </Button>
        </div>
        <p className="field-help">
          Keep exports somewhere safe. Backup import and SQLite migration are future work.
        </p>
      </section>
      <p className="field-help">
        Icons: Solar by{' '}
        <a
          href="https://www.figma.com/community/file/1166831539721848736"
          target="_blank"
          rel="noreferrer"
        >
          480 Design
        </a>{' '}
        ·{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
          CC BY 4.0
        </a>
      </p>
      <div className="privacy-note">
        <ShieldCheck size={16} />
        <p>Turn information into action. Privately.</p>
      </div>
    </section>
  );
}
