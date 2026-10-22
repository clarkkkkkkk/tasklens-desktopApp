import { MotionHeading } from '../../components/motion/MotionHeading';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  Check,
  FileImage,
  CalendarDays,
  ShieldCheck,
} from '../../components/icons';
import { useApp } from '../../app/context';
import { Button, ConfidenceBadge, ErrorState } from '../../components/ui';
import { createDemoScreenshot } from '../../services/extraction/demoSource';
import { readScreenshot } from '../../lib/images';
import { displayDate, displayTime } from '../../lib/dates';
import { presets } from '../../services/reminders/ReminderScheduler';
import type { ExtractedAction, Settings } from '../../types/action';
import { completedOnboardingVersion, onboardingSteps } from './onboarding.constants';
import { useOnboardingMotion } from './useOnboardingMotion';
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
  onFinishingChange,
}: {
  onFinishingChange: (finishing: boolean) => void;
  replay: boolean;
  onExit: () => void;
  onFinish: (reason: 'complete' | 'skip') => Promise<void>;
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
  const composition = useRef<HTMLElement>(null);
  const step = steps[index];
  useLayoutEffect(() => {
    composition.current?.parentElement?.scrollTo(0, 0);
    composition.current?.querySelector('.onboarding-visual')?.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [index]);
  useOnboardingMotion(composition, step, workflow, !!demo);
  function changeStep(next: number) {
    setIndex(Math.max(0, Math.min(next, steps.length - 1)));
  }
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
        // The tour always uses the deterministic sample, so it works before a model is installed.
        const results = await services.demoExtraction.extract(
          { type: 'image', fileName: file.name, previewUrl },
          { signal: controller.signal, onProgress: () => {} },
        );
        if (controller.signal.aborted) return;
        if (!results.actions.length)
          throw new Error('The sample returned no details. Please retry.');
        setDemo(results.actions[0]);
      } catch (e) {
        if (!controller.signal.aborted)
          setDemoError(e instanceof Error ? e.message : 'The sample could not load. Please retry.');
      }
    }
    void run();
    return () => controller.abort();
  }, [step, demo, attempt, services]);
  async function persist(settings: Settings, finish: false | 'complete' | 'skip' = false) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    if (finish) onFinishingChange(true);
    try {
      await saveSettings(settings);
      announce('');
      if (finish) await onFinish(finish);
    } catch (e) {
      if (finish) onFinishingChange(false);
      setError(e instanceof Error ? e.message : 'Could not save preferences. Please try again.');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function finish(reason: 'complete' | 'skip') {
    void persist(
      {
        ...snapshot.settings,
        onboardingCompletedVersion: completedOnboardingVersion(
          snapshot.settings.onboardingCompletedVersion,
        ),
      },
      reason,
    );
  }
  return (
    <main className="onboarding" aria-label={replay ? 'Replay onboarding' : 'Welcome to TaskLens'}>
      <div className="onboarding-shell">
        <header className="onboarding-header">
          <span className="onboarding-brand">
            <span className="onboarding-logo-slot">
              <img src="/TaskLens.png" alt="" />
            </span>
            <span className="onboarding-wordmark">TaskLens</span>
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
        <div
          className="onboarding-stage"
          data-step={step}
          role="region"
          aria-label="Introduction content"
          tabIndex={step === 'demo' ? -1 : 0}
        >
          <section ref={composition} className={`onboarding-step onboarding-${step}`}>
            <div className="onboarding-copy">
              <div className="eyebrow">
                {step === 'welcome' ? 'A LITTLE LESS TO REMEMBER' : 'YOUR SPACE FOR CLARITY'}
              </div>
              <MotionHeading ref={heading} tabIndex={-1}>
                {titles[step]}
              </MotionHeading>
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
              {step === 'workflow' && (
                <WorkflowStep
                  selected={workflow}
                  onSelect={(selected) => {
                    if (selected === workflow) return;
                    setWorkflow(selected);
                  }}
                />
              )}
              {step === 'preferences' && (
                <>
                  <p>Choose the reminders you’d like on new items.</p>
                  <p>You can change these for any task later.</p>
                </>
              )}
              {step === 'demo' && (
                <>
                  <p>Explore a sample result. Try changing its location.</p>
                  <DemoContext />
                  <ReadyMessage />
                </>
              )}
            </div>
            <div
              className="onboarding-visual"
              role={step === 'demo' ? 'region' : undefined}
              aria-label={step === 'demo' ? 'Sample preview' : undefined}
              tabIndex={step === 'demo' ? 0 : undefined}
            >
              {step === 'welcome' && (
                <div className="onboarding-welcome-art" data-onboarding-reveal="2">
                  <img src="/TaskLens.png" alt="" />
                  <p>A clearer day starts here.</p>
                </div>
              )}
              {step === 'workflow' && (
                <div className="onboarding-preview onboarding-workflow-preview">
                  <span className="badge">Sample workflow</span>
                  <div className="onboarding-workflow-content" data-onboarding-reveal="1">
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
                  <div className="onboarding-workflow-track" aria-hidden="true">
                    {['Capture', 'Review', 'Remember'].map((label, i) => (
                      <span key={label} className={workflow === i ? 'active' : ''}>
                        {label}
                      </span>
                    ))}
                  </div>
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
                  <DemoStep
                    action={demo}
                    onLocation={(location) => setDemo({ ...demo, location })}
                  />
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
        </div>
        {error && (
          <ErrorState message={error}>
            <span>Retry the action to save your choices.</span>
          </ErrorState>
        )}
        <footer className="onboarding-actions">
          <Button variant="ghost" disabled={pending} onClick={() => finish('skip')}>
            Skip tour
          </Button>
          <div>
            {index > 0 && (
              <Button disabled={pending} onClick={() => void changeStep(index - 1)}>
                Back
              </Button>
            )}
            <Button
              variant="primary"
              disabled={pending}
              onClick={
                index === steps.length - 1
                  ? () => finish('complete')
                  : () => void changeStep(index + 1)
              }
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
    <div className="onboarding-workflow-options">
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
    <div className="onboarding-preview onboarding-reminders">
      <header className="onboarding-card-header" data-onboarding-reveal="0">
        <span className="onboarding-card-icon">
          <Bell size={24} />
        </span>
        <div>
          <span className="onboarding-card-label">A little peace of mind</span>
          <h2 id="onboarding-reminders-title">Your reminder defaults</h2>
        </div>
      </header>
      <div
        className="onboarding-preset-list"
        role="group"
        aria-labelledby="onboarding-reminders-title"
      >
        {presets.map((preset, index) => (
          <label className="onboarding-preset" key={preset.id} data-onboarding-reveal={index + 1}>
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
            <span>{preset.label}</span>
          </label>
        ))}
      </div>
      <p className="field-help onboarding-card-footnote" data-onboarding-reveal="4">
        <ShieldCheck size={18} />
        <span>
          Saved on this device. Desktop notifications require separate activation in Settings.
          {!settings.remindersEnabled && ' Reminders are currently disabled in Settings.'}
        </span>
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
      <DemoContext preview />
      <header className="onboarding-demo-header" data-onboarding-reveal="0">
        <div className="onboarding-demo-labels">
          <span className="onboarding-card-label">Sample result</span>
          <ConfidenceBadge level={action.confidence.overall} />
        </div>
        <h2>{action.title}</h2>
      </header>
      <dl className="onboarding-demo-metadata" data-onboarding-reveal="1">
        <div>
          <dt>Date</dt>
          <dd>
            {displayDate(action.date, { weekday: 'long', month: 'short', day: 'numeric' })}{' '}
            {action.confidence.date && <ConfidenceBadge level={action.confidence.date} />}
          </dd>
        </div>
        <div>
          <dt>Arrival</dt>
          <dd>
            {displayTime(action.arrivalTime)}{' '}
            {action.confidence.time && <ConfidenceBadge level={action.confidence.time} />}
          </dd>
        </div>
      </dl>
      <label className="onboarding-location" data-onboarding-reveal="2">
        Sample location
        <input
          value={action.location || ''}
          maxLength={500}
          onChange={(event) => onLocation(event.target.value)}
        />
      </label>
      <section
        className="onboarding-requirements"
        aria-labelledby="onboarding-requirements-title"
        data-onboarding-reveal="3"
      >
        <h3 id="onboarding-requirements-title">Requirements</h3>
        <ul>
          {action.requirements.map((r) => (
            <li key={r}>
              <span className="onboarding-requirement-mark" aria-hidden="true" />
              {r}
            </li>
          ))}
        </ul>
      </section>
      <div className="onboarding-demo-notes" data-onboarding-reveal="4">
        <span className="onboarding-card-label">Worth keeping in mind</span>
        {action.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
      <details data-onboarding-reveal="4">
        <summary>View sample screenshot</summary>
        <img src={action.source.previewUrl} alt="Sample pictorial announcement" />
      </details>
      <ReadyMessage preview />
    </div>
  );
}

function DemoContext({ preview = false }: { preview?: boolean }) {
  return (
    <div
      className={`onboarding-demo-context ${preview ? 'in-preview' : 'in-copy'}`}
      data-onboarding-reveal={preview ? '0' : undefined}
    >
      <span className="badge">Interactive demo</span>
      <p className="field-help">
        Sample extraction, not AI analysis. Nothing here is saved as a task.
      </p>
    </div>
  );
}

function ReadyMessage({ preview = false }: { preview?: boolean }) {
  return (
    <div
      className={`onboarding-ready ${preview ? 'in-preview' : 'in-copy'}`}
      data-onboarding-reveal={preview ? '4' : undefined}
    >
      <span className="onboarding-ready-icon">
        <Check size={18} />
      </span>
      <div>
        <h2>You’re ready.</h2>
        <p>Your next screenshot is a good place to start.</p>
      </div>
    </div>
  );
}
