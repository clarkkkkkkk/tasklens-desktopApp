import { SourceTranscript } from '../voice/SourceTranscript';
import { useEntrance } from '../../components/motion/motion';
import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  CalendarDays,
  Check,
  Clock3,
  FileImage,
  MapPin,
  Pencil,
  RotateCcw,
  ScanLine,
  Trash2,
  X,
} from '../../components/icons';
import { useApp } from '../../app/context';
import { Button, ConfidenceBadge, ErrorState } from '../../components/ui';
import { confirmAction } from '../../lib/actions';
import { displayDate, displayTime } from '../../lib/dates';
import type { ConfidenceLevel, ExtractedAction, ExtractionAmbiguity } from '../../types/action';
import { buildReminders, rebaseReminders } from '../../services/reminders/ReminderScheduler';
import { findTimes } from '../../services/extraction/validation/temporal';
import { ActionEditor } from './ActionEditor';
import { OpenQuestions } from './OpenQuestions';
import { evidenceFor } from './evidence';
import { SourceTrace, type TraceTarget } from './SourceTrace';
import './result-dialog.css';
import './local-ai.css';
const toTime = (option: string) => {
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(option)) return option;
  const found = findTimes(option).find((t) => t.explicit);
  return found
    ? `${String(Math.floor(found.minutes / 60)).padStart(2, '0')}:${String(found.minutes % 60).padStart(2, '0')}`
    : null;
};
const FIELD_LABELS: Record<string, string> = {
  date: 'Date',
  time: 'Start time',
  endTime: 'End time',
  arrivalTime: 'Arrival time',
  location: 'Location',
  requirements: 'Requirements',
};
export function DetailsPanel({
  action: original,
  onClose,
  onSaved,
  onCalendar,
  onDirtyChange,
  floating = false,
  active = true,
  hideCalendar = false,
  onPendingChange,
}: {
  action: ExtractedAction;
  onClose: () => void;
  onSaved: (a: ExtractedAction) => void;
  onCalendar: (a: ExtractedAction) => void;
  onDirtyChange: (dirty: boolean) => void;
  floating?: boolean;
  active?: boolean;
  hideCalendar?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { save, remove, complete, snapshot } = useApp();
  // Answers to open questions are unsaved edits layered over the extracted action.
  const [patch, setPatch] = useState<{ id: string; changes: Partial<ExtractedAction> } | null>(
    null,
  );
  const action: ExtractedAction =
    patch?.id === original.id ? { ...original, ...patch.changes } : original;
  const [trace, setTrace] = useState<TraceTarget | null>(null);
  const traceRef = useRef<HTMLDetailsElement>(null);
  const [editing, setEditing] = useState(!action.title),
    [dirty, setDirty] = useState(false),
    [discard, setDiscard] = useState(false),
    [deleting, setDeleting] = useState(false),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEntrance(panel, action.id, 'panel', active);
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);
  useEffect(() => {
    if (!floating) return;
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [floating]);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  const saved = snapshot.actions.some((a) => a.id === action.id);
  useEffect(() => {
    if (action.title && active) panel.current?.focus();
  }, [action.id, action.title, active]);
  useEffect(() => {
    if (floating || !active) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) {
        if (dirty) {
          setDiscard(true);
        } else onClose();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [dirty, pending, floating, active, onClose]);
  function dismiss() {
    if (pending) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  async function persist(item: ExtractedAction) {
    await save(item);
    setPatch(null);
    setDirty(false);
    setEditing(false);
    onSaved(item);
  }
  function showSource(label: string, ids: string[]) {
    setTrace({ label, ids });
    if (traceRef.current) traceRef.current.open = true;
    requestAnimationFrame(() => traceRef.current?.scrollIntoView({ block: 'nearest' }));
  }
  function change(changes: Partial<ExtractedAction>) {
    setPatch({
      id: action.id,
      changes: { ...(patch?.id === action.id ? patch.changes : {}), ...changes },
    });
    setDirty(true);
  }
  function answer(question: ExtractionAmbiguity, option: string) {
    const changes: Partial<ExtractedAction> = {
      ambiguities: (action.ambiguities ?? []).filter((a) => a.id !== question.id),
    };
    const field = question.field;
    if (field === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(option)) changes.date = option;
    else if (field === 'time' || field === 'endTime' || field === 'arrivalTime') {
      const value = toTime(option);
      if (value) changes[field] = value;
    } else if (field === 'location') changes.location = option;
    if (field in changes)
      changes.confidence = { ...action.confidence, [field]: 'confirmed' as ConfidenceLevel };
    const next = { ...action, ...changes };
    changes.reminders =
      !action.date && next.date
        ? buildReminders(
            next.date,
            next.arrivalTime || next.time,
            snapshot.settings.defaultReminders,
          )
        : rebaseReminders(next).reminders;
    change(changes);
  }
  const source = (label: string, field: string) => {
    const ids = evidenceFor(action, field);
    return action.source.ocr && ids.length ? (
      <Button
        variant="ghost"
        className="trace-button"
        aria-label={`Show source for ${label.toLowerCase()}`}
        onClick={() => showSource(label, ids)}
      >
        <ScanLine size={14} />
        Source
      </Button>
    ) : null;
  };
  const badge = (level?: ConfidenceLevel) => level && <ConfidenceBadge level={level} />;
  async function run(operation: () => Promise<void>) {
    setError('');
    setPending(true);
    try {
      await operation();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update this item');
    } finally {
      setPending(false);
    }
  }
  const content = (
    <aside
      className={`details-panel ${floating ? 'result-panel' : ''}`}
      ref={panel}
      tabIndex={-1}
      aria-label="Item details"
    >
      <h1 className="sr-only narrow-heading">Item details</h1>
      <div className="detail-toolbar">
        <span>
          {action.source.type === 'image'
            ? 'EXTRACTED ' + action.type.toUpperCase()
            : action.type.toUpperCase() + ' DETAILS'}
        </span>
        <button
          className="icon-button"
          aria-label="Close details"
          disabled={pending}
          onClick={dismiss}
        >
          <X size={18} />
        </button>
      </div>
      {discard && (
        <div className="inline-confirm" role="alert">
          <p>Discard your unsaved edits?</p>
          <Button
            onClick={() => {
              setDirty(false);
              onClose();
            }}
          >
            Discard edits
          </Button>
          <Button onClick={() => setDiscard(false)}>Keep editing</Button>
        </div>
      )}
      {editing ? (
        <ActionEditor
          action={action}
          defaults={snapshot.settings.defaultReminders}
          onSave={persist}
          onDirty={() => setDirty(true)}
          onPendingChange={setPending}
          onCancel={() => {
            if (dirty) setDiscard(true);
            else if (!action.title) onClose();
            else setEditing(false);
          }}
        />
      ) : (
        <>
          <div className="detail-scroll">
            <div className="detail-title">
              <ConfidenceBadge level={action.confidence.overall} />
              <h2>{action.title}</h2>
              {source('Title', 'title')}
              <p>
                {action.source.type === 'image'
                  ? 'From your screenshot to your schedule.'
                  : 'A small plan. A clearer day.'}
              </p>
            </div>
            {action.source.extractionMode === 'mock' && (
              <div className="mock-notice">
                Sample result · not AI analysis. Check every detail before confirming.
              </div>
            )}
            {action.source.extractedBy && action.source.extractionMode !== 'mock' && (
              <p className="field-help ai-provenance">
                Drafted on this device by {action.source.extractedBy.model}. Check the details
                before confirming.
              </p>
            )}
            <OpenQuestions
              questions={action.ambiguities ?? []}
              disabled={pending}
              onAnswer={answer}
              onDismiss={(q) =>
                change({ ambiguities: (action.ambiguities ?? []).filter((a) => a.id !== q.id) })
              }
              onTrace={
                action.source.ocr
                  ? (q) => showSource(FIELD_LABELS[q.field] ?? 'This question', q.segmentIds)
                  : undefined
              }
            />
            <dl className="detail-fields">
              <div>
                <dt>
                  <CalendarDays size={16} />
                  Date
                </dt>
                <dd>
                  {displayDate(action.date, { weekday: 'long', month: 'short', day: 'numeric' })}
                  {badge(action.confidence.date)}
                  {source('Date', 'date')}
                </dd>
              </div>
              {action.arrivalTime && (
                <div>
                  <dt>
                    <Clock3 size={16} />
                    Arrival time
                  </dt>
                  <dd>
                    {displayTime(action.arrivalTime)}
                    {badge(action.confidence.arrivalTime)}
                    {source('Arrival time', 'arrivalTime')}
                  </dd>
                </div>
              )}
              <div>
                <dt>
                  {!action.arrivalTime && <Clock3 size={16} />}
                  {action.type === 'deadline' ? 'Due' : action.arrivalTime ? 'Start time' : 'Time'}
                </dt>
                <dd>
                  {action.time
                    ? displayTime(action.time)
                    : action.confidence.time === 'needs_review'
                      ? 'Not confirmed'
                      : 'All day'}
                  {badge(action.confidence.time)}
                  {source('Start time', 'time')}
                </dd>
              </div>
              {action.endTime && (
                <div>
                  <dt>Ends</dt>
                  <dd>
                    {displayTime(action.endTime)}
                    {badge(action.confidence.endTime)}
                    {source('End time', 'endTime')}
                  </dd>
                </div>
              )}
              <div>
                <dt>
                  <MapPin size={16} />
                  Location
                </dt>
                <dd>
                  {action.location || 'Not specified'}
                  {action.location && badge(action.confidence.location)}
                  {source('Location', 'location')}
                </dd>
              </div>
            </dl>
            <section className="detail-section">
              <h3>
                Requirements{' '}
                {action.requirements.length > 0 && (
                  <span className="count-label">{action.requirements.length}</span>
                )}
                {action.requirements.length > 0 && badge(action.confidence.requirements)}
                {source('Requirements', 'requirements')}
              </h3>
              {action.requirements.length ? (
                <ul className="requirements">
                  {action.requirements.map((r, i) => (
                    <li key={i}>
                      <span className="requirement-bullet" />
                      {r}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="field-help">Nothing extra to bring or prepare.</p>
              )}
            </section>
            {action.notes.length > 0 && (
              <section className="detail-section">
                <h3>Additional notes</h3>
                <div className="notes-box">
                  {action.notes.map((note, i) => (
                    <p key={i}>{note}</p>
                  ))}
                </div>
              </section>
            )}
            <section className="detail-section">
              <h3>
                <Bell size={16} />
                Suggested reminders
              </h3>
              {action.reminders.length ? (
                action.reminders.map((r) => (
                  <div
                    className={`reminder-row ${r.enabled ? '' : 'reminder-disabled'}`}
                    key={r.id}
                  >
                    <span className={`reminder-check ${r.enabled ? 'checked' : ''}`}>
                      {r.enabled && <Check size={12} />}
                    </span>
                    <span>
                      {r.label}
                      <small>
                        {new Date(r.datetime).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                        {!r.enabled ? ' · Off' : ''}
                      </small>
                    </span>
                  </div>
                ))
              ) : (
                <p className="field-help">Edit this item to add a date and reminders.</p>
              )}
              <p className="field-help">
                Configurations saved locally. OS notifications are not active yet.
                {!snapshot.settings.remindersEnabled ? ' Reminders are disabled in Settings.' : ''}
              </p>
            </section>
            <SourceTranscript action={action} />
            {action.source.fileName && (
              <div className="source-label">
                <FileImage size={14} />
                <span>{action.source.fileName}</span>
              </div>
            )}
            <SourceTrace ref={traceRef} action={action} target={trace} />
            {error && <ErrorState message={error} />}{' '}
            {deleting && (
              <div className="inline-confirm">
                <p>Delete “{action.title}” from this device?</p>
                <Button
                  variant="danger"
                  disabled={pending}
                  onClick={() =>
                    void run(async () => {
                      await remove(action.id);
                      onClose();
                    })
                  }
                >
                  Delete item
                </Button>
                <Button onClick={() => setDeleting(false)}>Keep item</Button>
              </div>
            )}
          </div>
          <div className="detail-actions">
            {action.status === 'needs_review' ? (
              <>
                <Button
                  variant="primary"
                  disabled={pending}
                  onClick={() => void run(() => persist(confirmAction(action)))}
                >
                  <Check size={16} />
                  Confirm & save {action.type}
                </Button>
                <div className="action-pair">
                  <Button onClick={() => setEditing(true)}>
                    <Pencil size={15} />
                    Edit details
                  </Button>
                  <Button disabled={pending} onClick={() => void run(() => persist(action))}>
                    Save draft
                  </Button>
                </div>
                <p>Confirming means you’ve reviewed these details.</p>
              </>
            ) : (
              <>
                <Button
                  variant="primary"
                  disabled={pending}
                  onClick={() =>
                    void run(async () => {
                      await complete(action);
                      onSaved({
                        ...action,
                        status: action.status === 'completed' ? 'confirmed' : 'completed',
                      });
                    })
                  }
                >
                  {action.status === 'completed' ? <RotateCcw size={16} /> : <Check size={16} />}{' '}
                  {action.status === 'completed' ? 'Restore item' : 'Mark completed'}
                </Button>
                <div className="action-pair">
                  <Button onClick={() => setEditing(true)}>
                    <Pencil size={15} />
                    Edit details
                  </Button>
                  {action.date && !hideCalendar && (
                    <Button onClick={() => onCalendar(action)}>
                      <CalendarDays size={15} />
                      View in calendar
                    </Button>
                  )}
                </div>
              </>
            )}
            {saved && (
              <Button variant="ghost" className="delete-action" onClick={() => setDeleting(true)}>
                <Trash2 size={14} />
                Delete item
              </Button>
            )}
          </div>
        </>
      )}
    </aside>
  );
  if (!floating) return content;
  return (
    <dialog
      ref={dialog}
      className="inbox-result-dialog"
      aria-label={action.source.type === 'image' ? 'Screenshot result' : 'Item details'}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          dismiss();
      }}
    >
      {content}
    </dialog>
  );
}
