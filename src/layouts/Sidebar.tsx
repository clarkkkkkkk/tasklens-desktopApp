import {
  Inbox,
  Sun,
  CalendarDays,
  CalendarRange,
  ListTodo,
  CircleCheck,
  CircleHelp,
  Settings,
  ShieldCheck,
} from '../components/icons';
import type { ExtractedAction, View } from '../types/action';
import { needsReview } from '../lib/actions';
import { localDate } from '../lib/dates';
const navigation = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'today', label: 'Today', icon: Sun },
  { id: 'upcoming', label: 'Upcoming', icon: CalendarRange },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'all', label: 'All Tasks', icon: ListTodo },
  { id: 'completed', label: 'Completed', icon: CircleCheck },
  { id: 'review', label: 'Needs Review', icon: CircleHelp },
] as const;
export function Sidebar({
  view,
  onNavigate,
  actions,
}: {
  view: View;
  onNavigate: (v: View) => void;
  actions: ExtractedAction[];
}) {
  function count(id: View) {
    if (id === 'review') return actions.filter(needsReview).length;
    if (id === 'today')
      return actions.filter((a) => a.status === 'confirmed' && a.date === localDate()).length;
    if (id === 'all') return actions.length;
    return 0;
  }
  return (
    <aside className="sidebar" aria-label="Workspace navigation">
      <div className="brand">
        <img src="/TaskLens.png" alt="" />
        <div>
          <span className="brand-name">TaskLens</span>
          <span className="brand-subtitle">A little more clarity.</span>
        </div>
      </div>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav aria-label="Main navigation">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`nav-item ${view === id ? 'selected' : ''}`}
            aria-current={view === id ? 'page' : undefined}
          >
            <Icon />
            <span>{label}</span>
            {count(id) > 0 && <span className="nav-count">{count(id)}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button
          className={`nav-item ${view === 'settings' ? 'selected' : ''}`}
          onClick={() => onNavigate('settings')}
          aria-current={view === 'settings' ? 'page' : undefined}
        >
          <Settings />
          <span>Settings</span>
        </button>
        <div className="local-status">
          <ShieldCheck size={16} />
          <span>On your device. Only.</span>
          <span className="status-dot" />
        </div>
        <div className="version-label">
          TASKLENS <span>v0.1 · Phase 1</span>
        </div>
      </div>
    </aside>
  );
}
