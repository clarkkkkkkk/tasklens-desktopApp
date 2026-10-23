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
  PanelLeft,
} from '../components/icons';
import type { ExtractedAction, View } from '../types/action';
import { useEffect, useState } from 'react';
import { useApp } from '../app/context';
import { needsReview, selectActions } from '../lib/actions';
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
  collapsed,
  onToggle,
}: {
  view: View;
  onNavigate: (v: View) => void;
  actions: ExtractedAction[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  function count(id: View) {
    if (id === 'review') return actions.filter(needsReview).length;
    if (id === 'today') return selectActions(actions, 'today').length;
    if (id === 'all') return actions.length;
    return 0;
  }
  return (
    <aside className="sidebar" aria-label="Workspace navigation" data-collapsed={collapsed}>
      <div className="brand" data-tour="brand">
        <img src="/TaskLens.png" alt="" />
        <div className="brand-copy">
          <span className="brand-name">TaskLens</span>
          <span className="brand-subtitle">A little more clarity.</span>
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggle}
          aria-label="Toggle sidebar (Ctrl + Shift + Space)"
          aria-expanded={!collapsed}
          aria-controls="workspace-navigation"
          aria-keyshortcuts="Control+Shift+Space"
          title="Toggle sidebar (Ctrl + Shift + Space)"
        >
          <PanelLeft size={20} />
        </button>
      </div>
      <div className="sidebar-section-label" aria-hidden={collapsed}>
        WORKSPACE
      </div>
      <nav id="workspace-navigation" aria-label="Main navigation" data-tour="navigation">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            data-tour={`nav-${id}`}
            title={label}
            aria-label={collapsed ? label : undefined}
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
          title="Settings"
          aria-label={collapsed ? 'Settings' : undefined}
          className={`nav-item ${view === 'settings' ? 'selected' : ''}`}
          onClick={() => onNavigate('settings')}
          aria-current={view === 'settings' ? 'page' : undefined}
        >
          <Settings />
          <span>Settings</span>
        </button>
        <LocalStatus />
        <div className="version-label">
          TASKLENS <span>v0.1 · Phase 2</span>
        </div>
      </div>
    </aside>
  );
}

/** Always describes the explicitly selected execution location. */
function LocalStatus() {
  const { services, processing: processingMode } = useApp();
  const [processing, setProcessing] = useState(false);
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let alive = true;
    void services.localAI
      .onRuntimeStatus((status) => setProcessing(status.state === 'processing'))
      .then((fn) => (alive ? (dispose = fn) : fn()));
    return () => {
      alive = false;
      dispose?.();
    };
  }, [services]);
  return (
    <div className="local-status" role="status">
      <ShieldCheck size={16} />
      <span>
        {processingMode.effectiveMode === 'groq'
          ? 'Groq Cloud selected'
          : processing
            ? 'Processing locally'
            : 'On your device. Only.'}
      </span>
      <span className="status-dot" />
    </div>
  );
}
