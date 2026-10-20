import {
  CalendarDays,
  Check,
  Circle,
  Clock3,
  ListChecks,
  MapPin,
  RotateCcw,
} from '../../components/icons';
import { useRef, useState } from 'react';
import type { ExtractedAction } from '../../types/action';
import { useApp } from '../../app/context';
import { displayDate, displayTime } from '../../lib/dates';
import { isOverdue } from '../../lib/actions';
import { ConfidenceBadge, EmptyState, ErrorState } from '../../components/ui';
export function TaskList({
  items,
  onOpen,
  emptyTitle = 'A little space to breathe.',
  emptyText = 'Your items will appear here when you add them.',
}: {
  items: ExtractedAction[];
  onOpen: (a: ExtractedAction) => void;
  emptyTitle?: string;
  emptyText?: string;
}) {
  const { complete } = useApp();
  const [error, setError] = useState(''),
    [pending, setPending] = useState<string | null>(null);
  const busy = useRef(false);
  async function toggle(item: ExtractedAction) {
    if (busy.current) return;
    busy.current = true;
    setPending(item.id);
    setError('');
    try {
      await complete(item);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update item');
    } finally {
      busy.current = false;
      setPending(null);
    }
  }
  if (!items.length) return <EmptyState title={emptyTitle}>{emptyText}</EmptyState>;
  return (
    <>
      {error && <ErrorState message={error} />}
      <ul className="task-list">
        {items.map((item) => {
          const completed = item.status === 'completed',
            overdue = isOverdue(item);
          return (
            <li
              data-action-id={item.id}
              className={`task-row ${completed ? 'is-completed' : ''}`}
              key={item.id}
            >
              <button
                className="complete-button"
                aria-label={completed ? `Restore ${item.title}` : `Complete ${item.title}`}
                title={
                  item.status === 'needs_review' ? 'Review and confirm this item first' : undefined
                }
                disabled={pending !== null || item.status === 'needs_review'}
                onClick={() => void toggle(item)}
              >
                {completed ? <Check size={17} /> : <Circle size={20} />}
              </button>
              <button className="task-open" onClick={() => onOpen(item)}>
                <span className="task-title">{item.title}</span>
                <span className="task-meta">
                  <span>
                    <CalendarDays size={13} />
                    {displayDate(item.date)}
                  </span>
                  {(item.arrivalTime || item.time) && (
                    <span>
                      <Clock3 size={13} />
                      {displayTime(item.arrivalTime || item.time)}
                    </span>
                  )}
                  {item.location && (
                    <span>
                      <MapPin size={13} />
                      {item.location}
                    </span>
                  )}
                  {item.requirements.length > 0 && (
                    <span>
                      <ListChecks size={13} />
                      {item.requirements.length} requirements
                    </span>
                  )}
                </span>
              </button>
              <div className="task-trailing">
                <span className={`type-label type-${item.type}`}>{item.type}</span>
                {item.status === 'needs_review' ? (
                  <ConfidenceBadge level="needs_review" />
                ) : completed ? (
                  <span className="small-label">
                    <RotateCcw size={12} />
                    Completed
                  </span>
                ) : overdue ? (
                  <span className="overdue-label">Overdue</span>
                ) : (
                  <span className="small-label">Confirmed</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
