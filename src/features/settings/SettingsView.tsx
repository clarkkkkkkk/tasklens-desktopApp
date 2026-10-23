import { rebaseSettings } from './settingsPatch';
import { GroqDisclosure } from '../ai-setup/AISetupDialog';
import { GroqSettings } from './GroqSettings';
import { NativeReminderSettings } from './NativeReminderSettings';
import { VoiceSettings } from '../voice/VoiceSettings';
import { LocalAISettings } from './LocalAISettings';
import { AIRoutingPanel } from '../ai/AIRoutingPanel';
import { MotionHeading } from '../../components/motion/MotionHeading';
import { useEffect, useRef, useState } from 'react';
import { Bell, Download, HardDrive, Monitor, ShieldCheck } from '../../components/icons';
import { useApp } from '../../app/context';
import { Button, ErrorState } from '../../components/ui';
import { downloadText } from '../../lib/images';
import { presets } from '../../services/reminders/ReminderScheduler';
import type { Settings } from '../../types/action';
export function SettingsView({
  onReplay,
  onReplayGuidedTour,
  active = true,
  tourActive = false,
  guidedReplayDisabled = false,
}: {
  onReplay: () => void;
  onReplayGuidedTour?: () => void;
  active?: boolean;
  tourActive?: boolean;
  guidedReplayDisabled?: boolean;
}) {
  const { snapshot, saveSettings, services } = useApp();
  const [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const settings = snapshot.settings;
  const [advancedMounted, setAdvancedMounted] = useState(!tourActive);
  useEffect(() => {
    if (active && !tourActive) setAdvancedMounted(true);
  }, [active, tourActive]);
  const reminders = services.reminders.upcoming(snapshot.actions, settings).slice(0, 5);
  const updating = useRef(false);
  async function update(next: Settings) {
    if (updating.current) return;
    updating.current = true;
    setError('');
    setPending(true);
    try {
      await saveSettings((current) => rebaseSettings(settings, next, current));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save preferences');
    } finally {
      updating.current = false;
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
    <section className="settings-view" hidden={!active} data-tour-busy={pending}>
      <div className="page-heading" data-tour="settings-heading">
        <MotionHeading>Settings</MotionHeading>
      </div>
      {error && <ErrorState message={error} />}
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
        {onReplayGuidedTour && (
          <div className="setting-row">
            <div>
              <h3>Explore your workspace</h3>
              <p>
                {guidedReplayDisabled
                  ? 'Finish your current capture or close the open dialog to take the tour.'
                  : 'A guided look at the features already in your workspace.'}
              </p>
            </div>
            <Button
              data-replay-guided-tour
              onClick={onReplayGuidedTour}
              disabled={pending || guidedReplayDisabled}
            >
              Replay guided tour
            </Button>
          </div>
        )}
        <div className="setting-row">
          <div>
            <h3>Launch at startup</h3>
            <p>Not available yet.</p>
          </div>
          <input type="checkbox" disabled aria-label="Launch at startup (not available yet)" />
        </div>
      </section>
      <GroqSettings />
      <section className="settings-section">
        <h2 data-tour="reminders">
          <Bell size={18} />
          Notifications
        </h2>
        <div className="setting-row">
          <div>
            <h3>Enable reminders</h3>
            <p>Allow reminders for your saved tasks.</p>
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
      </section>
      <section className="settings-section">
        <h2>
          <Monitor size={18} />
          Appearance
        </h2>
        <div className="setting-row">
          <div>
            <h3>Light theme</h3>
            <p>Light appearance is active.</p>
          </div>
          <span className="badge">Active</span>
        </div>
      </section>
      <section className="settings-section">
        <h2>
          <HardDrive size={18} />
          Data &amp; Privacy
        </h2>
        <div className="setting-row" data-tour="data-privacy">
          <div>
            <h3>Stored on this device</h3>
            <p>
              {snapshot.actions.length} saved items on this device. Backups contain private data.
            </p>
          </div>
          <Button onClick={backup}>
            <Download size={16} />
            Export backup
          </Button>
        </div>
        <p className="field-help">Keep exported backups somewhere safe.</p>
        <details className="setting-subsection">
          <summary>Online processing privacy</summary>
          <GroqDisclosure />
          <p className="field-help">
            One active extraction, two waiting, two attempts per minute, ten per local day. Retries
            and repairs count. Groq account limits also apply.
          </p>
        </details>
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
      <details className="settings-advanced settings-section">
        <summary>Advanced Settings</summary>
        {advancedMounted && (
          <>
            <AIRoutingPanel
              settings={settings}
              onUpdate={update}
              pending={pending}
              active={active && !tourActive}
            />
            <LocalAISettings settings={settings} onUpdate={update} pending={pending} />
            <VoiceSettings />
          </>
        )}
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
      </details>
      <div className="privacy-note">
        <ShieldCheck size={16} />
        <p>Turn information into action. Privately.</p>
      </div>
    </section>
  );
}
