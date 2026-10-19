import { MotionHeading } from '../../components/motion/MotionHeading';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from '../../components/icons';
import { useApp } from '../../app/context';
import { selectActions } from '../../lib/actions';
import { displayDate, localDate, monthCells, parseLocalDate } from '../../lib/dates';
import { Button } from '../../components/ui';
import { TaskList } from '../tasks/TaskList';
import type { ExtractedAction } from '../../types/action';
export function CalendarView({
  onOpen,
  initialDate,
}: {
  onOpen: (a: ExtractedAction) => void;
  initialDate?: string;
}) {
  const { snapshot } = useApp();
  const [selected, setSelected] = useState(initialDate || localDate()),
    [month, setMonth] = useState(parseLocalDate(initialDate || localDate()));
  const items = selectActions(snapshot.actions, 'calendar');
  const label = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  function move(amount: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + amount, 1));
  }
  return (
    <section>
      <div className="page-heading">
        <div className="eyebrow">THE BIGGER PICTURE</div>
        <MotionHeading>Calendar</MotionHeading>
        <p>Your plans, with a little perspective.</p>
      </div>
      <div className="calendar-card">
        <div className="calendar-toolbar">
          <h2>{label}</h2>
          <div>
            <Button
              onClick={() => {
                setMonth(new Date());
                setSelected(localDate());
              }}
            >
              Today
            </Button>
            <button className="icon-button" aria-label="Previous month" onClick={() => move(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button className="icon-button" aria-label="Next month" onClick={() => move(1)}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <div className="calendar-weekdays" aria-hidden="true">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="calendar-grid" aria-label={label}>
          {monthCells(month).map((date, i) =>
            date ? (
              <button
                key={date}
                className={`calendar-day ${date === selected ? 'day-selected' : ''} ${date === localDate() ? 'day-today' : ''}`}
                aria-label={`${displayDate(date, { month: 'long', day: 'numeric', year: 'numeric' })}, ${items.filter((a) => a.date === date).length} items`}
                aria-pressed={date === selected}
                onClick={() => setSelected(date)}
              >
                <span>{parseLocalDate(date).getDate()}</span>
                <div>
                  {items
                    .filter((a) => a.date === date)
                    .slice(0, 2)
                    .map((a) => (
                      <span
                        key={a.id}
                        className={`calendar-event ${a.status === 'completed' ? 'calendar-completed' : ''}`}
                      >
                        {a.title}
                      </span>
                    ))}
                  {items.filter((a) => a.date === date).length > 2 && (
                    <small>+{items.filter((a) => a.date === date).length - 2} more</small>
                  )}
                </div>
              </button>
            ) : (
              <div className="calendar-day calendar-blank" key={`blank-${i}`} />
            ),
          )}
        </div>
      </div>
      <div className="section-heading">
        <h2>{displayDate(selected, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
        <span>LOCAL CALENDAR</span>
      </div>
      <TaskList
        items={items.filter((a) => a.date === selected)}
        onOpen={onOpen}
        emptyTitle="A little open space."
        emptyText="No confirmed items on this day. Drafts stay in Needs Review."
      />
    </section>
  );
}
