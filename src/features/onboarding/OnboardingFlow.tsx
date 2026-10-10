import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, FileImage, CalendarDays, ShieldCheck } from 'lucide-react';
import { useApp } from '../../app/context';
import { Button, ConfidenceBadge, ErrorState } from '../../components/ui';
import { createDemoScreenshot } from '../../services/extraction/demoSource';
import { readScreenshot } from '../../lib/images';
import { displayDate, displayTime } from '../../lib/dates';
import { presets } from '../../services/reminders/ReminderScheduler';
import type { ExtractedAction, Settings } from '../../types/action';
import { completedOnboardingVersion, onboardingSteps } from './onboarding.constants';
import './onboarding.css';

const titles = {
  welcome: 'Turn information into action. Privately.',
  workflow: 'From chaos to clarity.',
  preferences: 'Stay ahead without thinking about it.',
  demo: 'See TaskLens in action.',
};
export function OnboardingFlow({
  replay,
  onExit,
  onFinish,
}: {
  replay: boolean;
  onExit: () => void;
  onFinish: () => void;
}) {
  const { snapshot, saveSettings, services, announce } = useApp();
  const [steps] = useState(() =>
    onboardingSteps(snapshot.settings.onboardingCompletedVersion, replay),
  );
  const [index, setIndex] = useState(0),
    [workflow, setWorkflow] = useState(0);
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const [demo, setDemo] = useState<ExtractedAction | null>(null),
    [demoError, setDemoError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const busy = useRef(false);
  const step = steps[index];
  useEffect(() => {
    heading.current?.focus();
  }, [index]);
  useEffect(() => {
    if (!replay) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy.current) {
        event.preventDefault();
        onExit();
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [replay, onExit]);
  useEffect(() => {
    if (step !== 'demo' || demo) return;
    const controller = new AbortController();
    async function run() {
      try {
        const file = await createDemoScreenshot();
        const previewUrl = await readScreenshot(file);
        if (controller.signal.aborted) return;
        const results = await services.extraction.extract(
          { type: 'image', fileName: file.name, previewUrl },
          { signal: controller.signal, onProgress: () => {} },
        );
        if (controller.signal.aborted) return;
        if (!results.length) throw new Error('The sample returned no details. Please retry.');
        setDemo(results[0]);
      } catch (e) {
        if (!controller.signal.aborted)
          setDemoError(e instanceof Error ? e.message : 'The sample could not load. Please retry.');
      }
    }
    void run();
    return () => controller.abort();
  }, [step, demo, attempt, services]);
  async function persist(settings: Settings, finish = false) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      await saveSettings(settings);
      announce('');
      if (finish) onFinish();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save preferences. Please try again.');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function finish() {
    void persist(
      {
        ...snapshot.settings,
        onboardingCompletedVersion: completedOnboardingVersion(
          snapshot.settings.onboardingCompletedVersion,
        ),
      },
      true,
    );
  }
  return (
    <main className="onboarding" aria-label={replay ? 'Replay onboarding' : 'Welcome to TaskLens'}>
      <div className="onboarding-shell">
        <header className="onboarding-header">
          <span className="onboarding-brand">
            <img src="/TaskLens.png" alt="TaskLens" />
            TaskLens
          </span>
          {replay && (
            <Button variant="ghost" disabled={pending} onClick={onExit}>
              Exit tour
            </Button>
          )}
        </header>
        <div className="onboarding-progress" role="status" aria-live="polite">
          <span>
            Step {index + 1} of {steps.length}
          </span>
          <div aria-hidden="true">
            {steps.map((s, i) => (
              <span key={s} className={i <= index ? 'filled' : ''} />
            ))}
          </div>
        </div>
        <section className={`onboarding-step onboarding-${step}`} key={step}>
          <div className="onboarding-copy">
            <div className="eyebrow">
              {step === 'welcome' ? 'A LITTLE LESS TO REMEMBER' : 'YOUR SPACE FOR CLARITY'}
            </div>
            <h1 ref={heading} tabIndex={-1}>
              {titles[step]}
            </h1>
            {step === 'welcome' && (
              <>
                <p>
                  TaskLens helps turn screenshots and everyday information into organized tasks,
                  events, and reminders.
                </p>
                <div className="onboarding-values">
                  <span>
                    <ShieldCheck size={18} /> Local-first workspace
                  </span>
                  <span>
                    <Check size={18} /> No account required
                  </span>
                </div>
              </>
            )}
            {step === 'workflow' && <WorkflowStep selected={workflow} onSelect={setWorkflow} />}
            {step === 'preferences' && (
              <>
                <p>Choose the reminders you’d like on new items.</p>
                <p>You can change these for any task later.</p>
              </>
            )}
            {step === 'demo' && (
              <>
                <p>Explore a sample result. Try changing its location.</p>
                <span className="badge">Interactive demo</span>
                <p className="field-help">
                  Sample extraction, not AI analysis. Nothing here is saved as a task.
                </p>
                <h2>You’re ready.</h2>
                <p>Your next screenshot is a good place to start.</p>
              </>
            )}
          </div>
          <div className="onboarding-visual">
            {step === 'welcome' && (
              <div className="onboarding-welcome-art">
                <img src="/TaskLens.png" alt="" />
                <p>A clearer day starts here.</p>
              </div>
            )}
            {step === 'workflow' && (
              <div className="onboarding-preview" key={workflow}>
                <span className="badge">Sample workflow</span>
                {workflow === 0 ? (
                  <>
                    <FileImage size={32} />
                    <h2>A screenshot worth keeping</h2>
                    <p>An announcement. A date. A few details to remember.</p>
                  </>
                ) : workflow === 1 ? (
                  <>
                    <Check size={32} />
                    <h2>Details, ready for review</h2>
                    <p>Check the date, location, and requirements before saving.</p>
                  </>
                ) : (
                  <>
                    <CalendarDays size={32} />
                    <h2>A place for every plan</h2>
                    <p>Today · Upcoming · Calendar</p>
                  </>
                )}
              </div>
            )}
            {step === 'preferences' && (
              <ReminderPreferencesStep
                settings={snapshot.settings}
                pending={pending}
                onChange={(settings) => void persist(settings)}
              />
            )}
            {step === 'demo' &&
              (demo ? (
                <DemoStep action={demo} onLocation={(location) => setDemo({ ...demo, location })} />
              ) : demoError ? (
                <ErrorState message={demoError}>
                  <Button
                    onClick={() => {
                      setDemoError('');
                      setAttempt(attempt + 1);
                    }}
                  >
                    Retry sample
                  </Button>
                </ErrorState>
              ) : (
                <div className="onboarding-preview" role="status">
                  Preparing sample extraction…<p>No AI is analyzing this image.</p>
                </div>
              ))}
          </div>
        </section>
        {error && (
          <ErrorState message={error}>
            <span>Retry the action to save your choices.</span>
          </ErrorState>
        )}
        <footer className="onboarding-actions">
          <Button variant="ghost" disabled={pending} onClick={finish}>
            Skip tour
          </Button>
          <div>
            {index > 0 && (
              <Button disabled={pending} onClick={() => setIndex(index - 1)}>
                Back
              </Button>
            )}
            <Button
              variant="primary"
              disabled={pending}
              onClick={index === steps.length - 1 ? finish : () => setIndex(index + 1)}
            >
              {pending
                ? 'Saving…'
                : index === 0
                  ? 'Get Started'
                  : index === steps.length - 1
                    ? 'Start using TaskLens'
                    : 'Continue'}
              <ArrowRight size={16} />
            </Button>
          </div>
        </footer>
      </div>
    </main>
  );
}
function WorkflowStep({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="onboarding-workflow">
      {[
        ['Capture', 'Drop a screenshot, paste an image, or add information.'],
        ['Review', 'Check the details TaskLens found before saving anything.'],
        ['Remember', 'Keep it organized in Today, Upcoming, and Calendar.'],
      ].map(([title, text], i) => (
        <button type="button" key={title} aria-pressed={selected === i} onClick={() => onSelect(i)}>
          <strong>{title}</strong>
          <span>{text}</span>
        </button>
      ))}
    </div>
  );
}
function ReminderPreferencesStep({
  settings,
  pending,
  onChange,
}: {
  settings: Settings;
  pending: boolean;
  onChange: (settings: Settings) => void;
}) {
  return (
    <div className="onboarding-preview">
      <h2>Your reminder defaults</h2>
      {presets.map((preset) => (
        <label className="onboarding-preset" key={preset.id}>
          <input
            type="checkbox"
            checked={settings.defaultReminders.includes(preset.id)}
            disabled={pending}
            onChange={(event) =>
              onChange({
                ...settings,
                defaultReminders: event.target.checked
                  ? [...settings.defaultReminders, preset.id]
                  : settings.defaultReminders.filter((p) => p !== preset.id),
              })
            }
          />
          {preset.label}
        </label>
      ))}
      <p className="field-help">
        Saved on this device. OS notifications are not available yet.
        {!settings.remindersEnabled && ' Reminders are currently disabled in Settings.'}
      </p>
    </div>
  );
}
function DemoStep({
  action,
  onLocation,
}: {
  action: ExtractedAction;
  onLocation: (value: string) => void;
}) {
  return (
    <div className="onboarding-preview onboarding-demo-card">
      <ConfidenceBadge level={action.confidence.overall} />
      <h2>{action.title}</h2>
      <dl>
        <dt>Date</dt>
        <dd>
          {displayDate(action.date, { weekday: 'long', month: 'short', day: 'numeric' })}{' '}
          {action.confidence.date && <ConfidenceBadge level={action.confidence.date} />}
        </dd>
        <dt>Arrival</dt>
        <dd>
          {displayTime(action.arrivalTime)}{' '}
          {action.confidence.time && <ConfidenceBadge level={action.confidence.time} />}
        </dd>
      </dl>
      <label className="onboarding-location">
        Sample location
        <input
          value={action.location || ''}
          maxLength={500}
          onChange={(event) => onLocation(event.target.value)}
        />
      </label>
      <h3>Requirements</h3>
      <ul>
        {action.requirements.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <div className="notes-box">
        {action.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
      <details>
        <summary>View sample screenshot</summary>
        <img src={action.source.previewUrl} alt="Sample pictorial announcement" />
      </details>
    </div>
  );
}
