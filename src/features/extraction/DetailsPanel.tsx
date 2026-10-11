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
  Trash2,
  X,
} from '../../components/icons';
import { useApp } from '../../app/context';
import { Button, ConfidenceBadge, ErrorState } from '../../components/ui';
import { confirmAction } from '../../lib/actions';
import { displayDate, displayTime } from '../../lib/dates';
import type { ExtractedAction } from '../../types/action';
import { ActionEditor } from './ActionEditor';
import './result-dialog.css';
export function DetailsPanel({
  action,
  onClose,
  onSaved,
  onCalendar,
  onDirtyChange,
  floating = false,
}: {
  action: ExtractedAction;
  onClose: () => void;
  onSaved: (a: ExtractedAction) => void;
  onCalendar: (a: ExtractedAction) => void;
  onDirtyChange: (dirty: boolean) => void;
  floating?: boolean;
}) {
  const { save, remove, complete, snapshot } = useApp();
  const [editing, setEditing] = useState(!action.title),
    [dirty, setDirty] = useState(false),
    [discard, setDiscard] = useState(false),
    [deleting, setDeleting] = useState(false),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEntrance(panel, action.id, 'panel');
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
    if (action.title) panel.current?.focus();
  }, [action.id, action.title]);
  useEffect(() => {
    if (floating) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) {
        if (dirty) {
          setDiscard(true);
        } else onClose();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [dirty, pending, floating, onClose]);
  function dismiss() {
    if (pending) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  async function persist(item: ExtractedAction) {
    await save(item);
    setDirty(false);
    setEditing(false);
    onSaved(item);
  }
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
            <dl className="detail-fields">
              <div>
                <dt>
                  <CalendarDays size={16} />
                  Date
                </dt>
                <dd>
                  {displayDate(action.date, { weekday: 'long', month: 'short', day: 'numeric' })}
                  {action.confidence.date && <ConfidenceBadge level={action.confidence.date} />}
                </dd>
              </div>
              <div>
                <dt>
                  <Clock3 size={16} />
                  {action.arrivalTime ? 'Arrival time' : 'Time'}
                </dt>
                <dd>
                  {displayTime(action.arrivalTime || action.time)}
                  {action.confidence.time && <ConfidenceBadge level={action.confidence.time} />}
                </dd>
              </div>
              {action.arrivalTime && action.time && (
                <div>
                  <dt>Event time</dt>
                  <dd>{displayTime(action.time)}</dd>
                </div>
              )}
              <div>
                <dt>
                  <MapPin size={16} />
                  Location
                </dt>
                <dd>{action.location || 'Not specified'}</dd>
              </div>
            </dl>
            <section className="detail-section">
              <h3>
                Requirements{' '}
                {action.requirements.length > 0 && (
                  <span className="count-label">{action.requirements.length}</span>
                )}
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
                Configurations saved locally. OS notifications are not active in Phase 1.
                {!snapshot.settings.remindersEnabled ? ' Reminders are disabled in Settings.' : ''}
              </p>
            </section>
            {action.source.fileName && (
              <div className="source-label">
                <FileImage size={14} />
                <span>{action.source.fileName}</span>
              </div>
            )}
            {action.source.previewUrl && (
              <details className="source-details">
                <summary>View source screenshot</summary>
                <img
                  src={action.source.previewUrl}
                  alt={`Source: ${action.source.fileName || 'screenshot'}`}
                />
              </details>
            )}
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
                  {action.date && (
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
      aria-label="Screenshot result"
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
