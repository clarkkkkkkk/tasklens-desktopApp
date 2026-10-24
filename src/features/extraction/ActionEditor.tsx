import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect, useState, useRef, useImperativeHandle, type Ref } from 'react';
import { Save, Check, Bell } from '../../components/icons';
import { actionSchema, type ExtractedAction, type Settings } from '../../types/action';
import { confirmAction } from '../../lib/actions';
import {
  buildReminders,
  rebaseReminders,
  approveDisplayedReminders,
} from '../../services/reminders/ReminderScheduler';
import { Button, ErrorState } from '../../components/ui';
export type SaveIntent = 'draft' | 'confirm' | 'update';
export interface EditorHandle {
  prepare: (intent: SaveIntent) => ExtractedAction;
}
export function ActionEditor({
  action,
  reviewRef,
  active = true,
  externalPending = false,
  defaults,
  onSave,
  onCancel,
  onDirty,
  onPendingChange,
}: {
  action: ExtractedAction;
  reviewRef?: Ref<EditorHandle>;
  active?: boolean;
  externalPending?: boolean;
  defaults: Settings['defaultReminders'];
  onSave: (a: ExtractedAction, intent: SaveIntent) => Promise<void>;
  onCancel: () => void;
  onDirty: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [draft, setDraft] = useState(action),
    [requirements, setRequirements] = useState(action.requirements.join('\n')),
    [notes, setNotes] = useState(action.notes.join('\n')),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const locked = pending || externalPending;
  const [timeOptions, setTimeOptions] = useState<{
    kind: string;
    timezone: string;
    instants: string[];
  }>();
  useEffect(() => {
    let disposed = false;
    setTimeOptions(undefined);
    const time = draft.arrivalTime || draft.time;
    if (isTauri() && draft.date && time)
      void invoke<{ kind: string; timezone: string; instants: string[] }>('reminder_time_options', {
        date: draft.date,
        time,
      })
        .then((value) => {
          if (!disposed) setTimeOptions(value);
        })
        .catch(() => {
          if (!disposed)
            setError('Could not verify this local time. Retry before approving reminders.');
        });
    return () => {
      disposed = true;
    };
  }, [draft.date, draft.time, draft.arrivalTime]);
  function chooseOccurrence(instant: string, index: number) {
    onDirty();
    setDraft((d) => ({
      ...d,
      reminders: d.reminders.map((r) =>
        r.id === 'hour' || r.id === 'quarter'
          ? {
              ...r,
              datetime: new Date(
                new Date(instant).getTime() - (r.id === 'hour' ? 60 : 15) * 60000,
              ).toISOString(),
              approval: {
                timezone: timeOptions!.timezone,
                anchorInstant: instant,
                occurrence: index === 0 ? 'first' : 'second',
              },
            }
          : r,
      ),
    }));
  }
  function update<K extends keyof ExtractedAction>(key: K, value: ExtractedAction[K]) {
    onDirty();
    setDraft((d) => {
      let next = { ...d, [key]: value };
      if (key === 'date' || key === 'time' || key === 'arrivalTime')
        next = { ...next, confidence: { ...next.confidence, [key]: 'confirmed' } };
      if (key === 'date' || key === 'time' || key === 'arrivalTime') {
        if (key === 'date' && !d.date && value)
          next = {
            ...next,
            reminders: buildReminders(next.date, next.arrivalTime || next.time, defaults),
          };
        else next = rebaseReminders(next);
      }
      return next;
    });
  }
  function prepare(intent: SaveIntent): ExtractedAction {
    setError('');
    if (
      timeOptions?.kind === 'gap' &&
      draft.reminders.some((r) => r.enabled && (r.id === 'hour' || r.id === 'quarter'))
    ) {
      const message =
        'This local time does not exist because of daylight saving. Correct the time.';
      setError(message);
      throw new Error(message);
    }
    if (
      timeOptions?.kind === 'fold' &&
      draft.reminders.some(
        (r) =>
          r.enabled &&
          (r.id === 'hour' || r.id === 'quarter') &&
          !timeOptions.instants.includes(r.approval?.anchorInstant || ''),
      )
    ) {
      const message =
        'Choose the first or second occurrence of this repeated local time before saving reminders.';
      setError(message);
      throw new Error(message);
    }
    const lines = (text: string) =>
      text
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    const value = {
      ...draft,
      reminders: approveDisplayedReminders(draft.reminders),
      requirements: lines(requirements),
      notes: lines(notes),
    };
    const validated = actionSchema.safeParse(intent === 'confirm' ? confirmAction(value) : value);
    if (!validated.success) {
      const message = validated.error.issues
        .map((i) => `${String(i.path[0])}: ${i.message}`)
        .join('. ');
      setError(message);
      throw new Error(message);
    }
    return validated.data;
  }
  useImperativeHandle(reviewRef, () => ({ prepare }));
  const saving = useRef(false);
  async function submit(confirm: boolean) {
    if (saving.current || externalPending) return;
    saving.current = true;
    const intent = confirm ? 'confirm' : action.status === 'needs_review' ? 'draft' : 'update';
    try {
      const value = prepare(intent);
      setPending(true);
      onPendingChange?.(true);
      await onSave(value, intent);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save item');
    } finally {
      saving.current = false;
      setPending(false);
      onPendingChange?.(false);
    }
  }
  return (
    <form
      className="action-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      <div className="detail-scroll">
        <div className="eyebrow">{action.title ? 'EDIT DETAILS' : 'MAKE A LITTLE PLAN'}</div>
        <h2>{action.title ? 'Make it yours.' : 'New item'}</h2>
        <label>
          Title
          <input
            disabled={locked}
            autoFocus={active}
            value={draft.title}
            onChange={(e) => update('title', e.target.value)}
            maxLength={180}
            placeholder="What’s on your mind?"
            required
          />
        </label>
        <label>
          Type
          <select
            disabled={locked}
            value={draft.type}
            onChange={(e) => update('type', e.target.value as ExtractedAction['type'])}
          >
            <option value="task">Task</option>
            <option value="event">Event</option>
            <option value="deadline">Deadline</option>
          </select>
        </label>
        <label>
          Date
          <input
            disabled={locked}
            type="date"
            value={draft.date || ''}
            onChange={(e) => update('date', e.target.value)}
          />
        </label>
        <div className="form-columns">
          <label>
            Time
            <input
              disabled={locked}
              type="time"
              value={draft.time || ''}
              onChange={(e) => update('time', e.target.value)}
            />
          </label>
          <label>
            Arrival time
            <input
              disabled={locked}
              type="time"
              value={draft.arrivalTime || ''}
              onChange={(e) => update('arrivalTime', e.target.value)}
            />
          </label>
        </div>
        <label>
          Location
          <input
            disabled={locked}
            value={draft.location || ''}
            onChange={(e) => update('location', e.target.value)}
            placeholder="Add a place"
            maxLength={500}
          />
        </label>
        <label>
          Requirements
          <textarea
            disabled={locked}
            rows={3}
            value={requirements}
            onChange={(e) => {
              onDirty();
              setRequirements(e.target.value);
            }}
            placeholder="One requirement per line"
          />
        </label>
        <label>
          Notes
          <textarea
            disabled={locked}
            rows={3}
            value={notes}
            onChange={(e) => {
              onDirty();
              setNotes(e.target.value);
            }}
            placeholder="Anything else to remember?"
          />
        </label>
        <div className="detail-section">
          <h3>
            <Bell size={16} />
            Reminders
          </h3>
          <p className="field-help">
            Notifications require explicit activation in desktop Settings. Saving approves the
            displayed schedules.{' '}
            {draft.date && !draft.time && !draft.arrivalTime
              ? 'Date-only items can use Night before at 8 PM. Hourly reminders need a confirmed time.'
              : ''}
          </p>
          {(draft.confidence.date === 'needs_review' ||
            ((draft.arrivalTime || draft.time) &&
              (draft.arrivalTime ? draft.confidence.arrivalTime : draft.confidence.time) !==
                'confirmed')) && (
            <Button
              onClick={() => {
                onDirty();
                setDraft((d) => ({
                  ...d,
                  confidence: {
                    ...d.confidence,
                    date: 'confirmed',
                    ...(d.arrivalTime
                      ? { arrivalTime: 'confirmed' as const }
                      : { time: 'confirmed' as const }),
                  },
                }));
              }}
            >
              Confirm displayed reminder date and time
            </Button>
          )}
          {timeOptions?.kind === 'gap' && (
            <ErrorState message="This local time does not exist because of daylight saving. Correct the time before enabling relative reminders." />
          )}
          {timeOptions?.kind === 'fold' && (
            <fieldset>
              <legend>This time occurs twice. Choose its occurrence.</legend>
              {timeOptions.instants.map((instant, index) => (
                <label key={instant}>
                  <input
                    disabled={locked}
                    type="radio"
                    name="dst-occurrence"
                    checked={draft.reminders.some((r) => r.approval?.anchorInstant === instant)}
                    onChange={() => chooseOccurrence(instant, index)}
                  />
                  {index === 0 ? 'First' : 'Second'} occurrence · {instant} · {timeOptions.timezone}
                </label>
              ))}
            </fieldset>
          )}
          {draft.reminders.length ? (
            draft.reminders.map((r) => (
              <label className="reminder-row" key={r.id}>
                <input
                  disabled={locked}
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) =>
                    update(
                      'reminders',
                      draft.reminders.map((x) =>
                        x.id === r.id ? { ...x, enabled: e.target.checked } : x,
                      ),
                    )
                  }
                />
                <span>
                  {r.label}
                  <small>
                    {new Date(r.datetime).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </small>
                </span>
              </label>
            ))
          ) : (
            <p className="field-help">Add a date to choose reminders.</p>
          )}
        </div>
        {error && <ErrorState message={error} />}
      </div>
      <div className="detail-actions">
        <Button type="submit" variant="primary" disabled={locked}>
          <Save size={16} />
          {pending ? 'Saving…' : action.status === 'needs_review' ? 'Save draft' : 'Save item'}
        </Button>
        {action.status === 'needs_review' && (
          <Button onClick={() => void submit(true)} disabled={locked}>
            <Check size={16} />
            Confirm & save
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel} disabled={locked}>
          Cancel editing
        </Button>
      </div>
    </form>
  );
}
