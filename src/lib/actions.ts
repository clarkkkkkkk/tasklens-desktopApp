import type { ExtractedAction, View } from '../types/action';
import { localDate } from './dates';
export function needsReview(item: ExtractedAction): boolean {
  return (
    item.status !== 'completed' &&
    (item.status === 'needs_review' || Object.values(item.confidence).includes('needs_review'))
  );
}
/** A confirmed item whose local date has passed. Completed and draft items are never overdue. */
export function isOverdue(item: ExtractedAction, today = localDate()): boolean {
  return item.status === 'confirmed' && !!item.date && item.date < today;
}
export function confirmAction(item: ExtractedAction): ExtractedAction {
  const confidence = { ...item.confidence, overall: 'confirmed' as const };
  for (const key of ['date', 'time', 'location', 'requirements'] as const)
    if (confidence[key] === 'needs_review') confidence[key] = 'confirmed';
  return { ...item, status: 'confirmed', confidence };
}
export function matchesSearch(item: ExtractedAction, query: string): boolean {
  const text = [item.title, item.location, ...item.notes, ...item.requirements]
    .join(' ')
    .toLocaleLowerCase();
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
}
export function selectActions(
  items: ExtractedAction[],
  view: View,
  query = '',
  today = localDate(),
): ExtractedAction[] {
  return items
    .filter((item) => {
      if (!matchesSearch(item, query)) return false;
      if (view === 'today')
        return item.status === 'confirmed' && (item.date === today || isOverdue(item, today));
      if (view === 'upcoming')
        return item.status === 'confirmed' && !!item.date && item.date >= today;
      if (view === 'completed') return item.status === 'completed';
      if (view === 'review') return needsReview(item);
      if (view === 'calendar') return item.status !== 'needs_review';
      return true;
    })
    .sort(
      (a, b) =>
        (a.date || '9999').localeCompare(b.date || '9999') ||
        (a.arrivalTime || a.time || '').localeCompare(b.arrivalTime || b.time || '') ||
        b.createdAt.localeCompare(a.createdAt),
    );
}
export function newAction(): ExtractedAction {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    type: 'task',
    title: '',
    requirements: [],
    notes: [],
    confidence: { overall: 'confirmed' },
    reminders: [],
    source: { type: 'text' },
    status: 'confirmed',
    createdAt: now,
    updatedAt: now,
  };
}
