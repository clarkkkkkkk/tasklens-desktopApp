import { useState } from 'react';
import { CircleCheck, Plus } from '../../components/icons';
import { useApp } from '../../app/context';
import { selectActions } from '../../lib/actions';
import { displayDate, localDate } from '../../lib/dates';
import { Button, EmptyState } from '../../components/ui';
import { TaskList } from './TaskList';
import type { ActionType, ExtractedAction, View } from '../../types/action';
const copy: Record<string, { title: string; subtitle: string; empty: string; hint: string }> = {
  today: {
    title: 'Today',
    subtitle: 'A little focus for the day ahead.',
    empty: 'Your day has room to breathe.',
    hint: 'Confirmed items scheduled for today will appear here.',
  },
  upcoming: {
    title: 'Upcoming',
    subtitle: 'A clear view of what’s coming next.',
    empty: 'Nothing on the horizon. Yet.',
    hint: 'Add a date to a confirmed item to see it in your agenda.',
  },
  all: {
    title: 'All Tasks',
    subtitle: 'Everything you’re keeping track of, in one place.',
    empty: 'Good things start with one small action.',
    hint: 'Create an item or turn a screenshot into a plan.',
  },
  completed: {
    title: 'Completed',
    subtitle: 'A little reminder of how far you’ve come.',
    empty: 'Your progress starts here.',
    hint: 'Complete an item to see it here. You can always restore it.',
  },
  review: {
    title: 'Needs Review',
    subtitle: 'A second look before your next step.',
    empty: 'Everything is clear.',
    hint: 'Saved drafts and uncertain details will appear here.',
  },
};
export function TaskViews({
  view,
  search,
  onOpen,
  onNew,
}: {
  view: View;
  search: string;
  onOpen: (a: ExtractedAction) => void;
  onNew: () => void;
}) {
  const { snapshot } = useApp();
  const [filter, setFilter] = useState<ActionType | 'all'>('all');
  const isSearch = !!search.trim(),
    details = isSearch
      ? {
          title: 'Search results',
          subtitle: `Across your workspace for “${search}”`,
          empty: 'No matches just yet.',
          hint: 'Try another title, location, note, or requirement.',
        }
      : copy[view] || copy.all;
  const items = selectActions(snapshot.actions, isSearch ? 'all' : view, search).filter(
    (a) => isSearch || view !== 'all' || filter === 'all' || a.type === filter,
  );
  const groups =
    view === 'upcoming' && !isSearch
      ? items.reduce<Record<string, ExtractedAction[]>>((acc, a) => {
          (acc[a.date || ''] ??= []).push(a);
          return acc;
        }, {})
      : null;
  return (
    <section>
      <div className="page-heading">
        <div className="eyebrow">
          {view === 'today'
            ? displayDate(localDate(), {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })
            : 'YOUR LOCAL WORKSPACE'}
        </div>
        <h1>{details.title}</h1>
        <p>{details.subtitle}</p>
      </div>
      {view === 'all' && !isSearch && (
        <div className="filter-tabs" aria-label="Filter item type">
          {(['all', 'task', 'event', 'deadline'] as const).map((f) => (
            <button
              key={f}
              className={f === filter ? 'active' : ''}
              onClick={() => setFilter(f)}
              aria-pressed={f === filter}
            >
              {f === 'all' ? 'All items' : `${f[0].toUpperCase() + f.slice(1)}s`}
            </button>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState
          title={details.empty}
          icon={<CircleCheck />}
          action={
            !isSearch && view !== 'completed' && view !== 'review' ? (
              <Button onClick={onNew}>
                <Plus size={16} />
                Create an item
              </Button>
            ) : undefined
          }
        >
          {details.hint}
        </EmptyState>
      ) : groups ? (
        Object.entries(groups).map(([date, group]) => (
          <div className="agenda-group" key={date}>
            <div className="section-heading">
              <h2>
                {date === localDate()
                  ? 'Today'
                  : displayDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}
              </h2>
              <span>{group?.length} ITEMS</span>
            </div>
            <TaskList items={group || []} onOpen={onOpen} />
          </div>
        ))
      ) : (
        <>
          <div className="section-heading">
            <h2>
              {isSearch
                ? 'Matches'
                : view === 'today'
                  ? 'Your plan'
                  : view === 'review'
                    ? 'Waiting for your review'
                    : 'Your items'}
            </h2>
            <span>
              {items.length} {items.length === 1 ? 'ITEM' : 'ITEMS'}
            </span>
          </div>
          <TaskList items={items} onOpen={onOpen} />
        </>
      )}
    </section>
  );
}
