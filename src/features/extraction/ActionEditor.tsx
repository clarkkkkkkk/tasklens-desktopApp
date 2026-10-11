import { useState } from 'react';
import { Save, Check, Bell } from '../../components/icons';
import { actionSchema, type ExtractedAction, type Settings } from '../../types/action';
import { confirmAction } from '../../lib/actions';
import { buildReminders, rebaseReminders } from '../../services/reminders/ReminderScheduler';
import { Button, ErrorState } from '../../components/ui';
export function ActionEditor({
  action,
  defaults,
  onSave,
  onCancel,
  onDirty,
  onPendingChange,
}: {
  action: ExtractedAction;
  defaults: Settings['defaultReminders'];
  onSave: (a: ExtractedAction) => Promise<void>;
  onCancel: () => void;
  onDirty: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [draft, setDraft] = useState(action),
    [requirements, setRequirements] = useState(action.requirements.join('\n')),
    [notes, setNotes] = useState(action.notes.join('\n')),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  function update<K extends keyof ExtractedAction>(key: K, value: ExtractedAction[K]) {
    onDirty();
    setDraft((d) => {
      let next = { ...d, [key]: value };
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
  async function submit(confirm: boolean) {
    setError('');
    const lines = (text: string) =>
      text
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    const value = { ...draft, requirements: lines(requirements), notes: lines(notes) };
    const validated = actionSchema.safeParse(confirm ? confirmAction(value) : value);
    if (!validated.success) {
      setError(validated.error.issues.map((i) => `${i.path[0]}: ${i.message}`).join('. '));
      return;
    }
    setPending(true);
    onPendingChange?.(true);
    try {
      await onSave(validated.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save item');
    } finally {
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
            autoFocus
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
            type="date"
            value={draft.date || ''}
            onChange={(e) => update('date', e.target.value)}
          />
        </label>
        <div className="form-columns">
          <label>
            Time
            <input
              type="time"
              value={draft.time || ''}
              onChange={(e) => update('time', e.target.value)}
            />
          </label>
          <label>
            Arrival time
            <input
              type="time"
              value={draft.arrivalTime || ''}
              onChange={(e) => update('arrivalTime', e.target.value)}
            />
          </label>
        </div>
        <label>
          Location
          <input
            value={draft.location || ''}
            onChange={(e) => update('location', e.target.value)}
            placeholder="Add a place"
            maxLength={500}
          />
        </label>
        <label>
          Requirements
          <textarea
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
            Saved preferences only; notifications arrive in a future phase.{' '}
            {draft.date && !draft.time && !draft.arrivalTime
              ? 'Date-only reminders use 9:00 AM.'
              : ''}
          </p>
          {draft.reminders.length ? (
            draft.reminders.map((r) => (
              <label className="reminder-row" key={r.id}>
                <input
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
        <Button type="submit" variant="primary" disabled={pending}>
          <Save size={16} />
          {pending ? 'Saving…' : action.status === 'needs_review' ? 'Save draft' : 'Save item'}
        </Button>
        {action.status === 'needs_review' && (
          <Button onClick={() => void submit(true)} disabled={pending}>
            <Check size={16} />
            Confirm & save
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel editing
        </Button>
      </div>
    </form>
  );
}
