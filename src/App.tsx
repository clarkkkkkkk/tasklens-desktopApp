import { useCallback, useRef, useState } from 'react';
import { Check, Download, RefreshCw } from 'lucide-react';
import { useApp } from './app/context';
import { Sidebar } from './layouts/Sidebar';
import { TopBar } from './layouts/TopBar';
import { Inbox } from './features/inbox/Inbox';
import { TaskViews } from './features/tasks/TaskViews';
import { CalendarView } from './features/calendar/CalendarView';
import { SettingsView } from './features/settings/SettingsView';
import { DetailsPanel, DetailsPlaceholder } from './features/extraction/DetailsPanel';
import { Button, ErrorState, LoadingState } from './components/ui';
import { newAction } from './lib/actions';
import { downloadText } from './lib/images';
import type { ExtractedAction, View } from './types/action';
export default function App() {
  const { snapshot, loading, loadError, reload, notice, services, announce } = useApp();
  const [view, setView] = useState<View>('inbox'),
    [search, setSearch] = useState(''),
    [selection, setSelection] = useState<ExtractedAction | null>(null),
    [calendarDate, setCalendarDate] = useState<string>(),
    [dirty, setDirty] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const onOpen = useCallback(
    (a: ExtractedAction) => {
      if (dirty) {
        announce('Save or close your current edits before opening another item.');
        return;
      }
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSelection(a);
    },
    [dirty, announce],
  );
  const onClose = useCallback(() => {
    setSelection(null);
    setDirty(false);
    requestAnimationFrame(() => opener.current?.isConnected && opener.current.focus());
  }, []);
  const selected = selection
    ? snapshot.actions.find((a) => a.id === selection.id) || selection
    : null;
  const showInbox = view === 'inbox' && !search.trim();
  function backup() {
    try {
      downloadText(services.repository.exportRaw(), 'tasklens-recovery.json');
    } catch {
      announce('Could not access local storage to export a backup.');
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      <Sidebar
        view={view}
        onNavigate={(v) => {
          if (dirty) {
            announce('Save or close your current edits before changing views.');
            return;
          }
          onClose();
          setView(v);
          setSearch('');
        }}
        actions={snapshot.actions}
      />
      <div className="app-body">
        <TopBar search={search} setSearch={setSearch} onNew={() => onOpen(newAction())} />
        <main
          id="main-content"
          tabIndex={-1}
          className={`workspace ${selected ? 'with-details' : ''}`}
        >
          <div className="main-content">
            {loading ? (
              <LoadingState />
            ) : loadError ? (
              <div className="recovery-view">
                <h1>Your data needs a little attention.</h1>
                <ErrorState message={loadError} />
                <div className="action-pair">
                  <Button onClick={() => void reload()}>
                    <RefreshCw size={16} />
                    Retry
                  </Button>
                  <Button onClick={backup}>
                    <Download size={16} />
                    Export recovery backup
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Inbox
                  active={showInbox}
                  locked={dirty}
                  onResult={onOpen}
                  onRemove={() => {
                    if (selection && !snapshot.actions.some((a) => a.id === selection.id))
                      onClose();
                  }}
                />
                {!showInbox &&
                  (search.trim() ? (
                    <TaskViews
                      view="all"
                      search={search}
                      onOpen={onOpen}
                      onNew={() => onOpen(newAction())}
                    />
                  ) : view === 'settings' ? (
                    <SettingsView />
                  ) : view === 'calendar' ? (
                    <CalendarView
                      key={calendarDate || 'current'}
                      initialDate={calendarDate}
                      onOpen={onOpen}
                    />
                  ) : (
                    <TaskViews
                      view={view}
                      search=""
                      onOpen={onOpen}
                      onNew={() => onOpen(newAction())}
                    />
                  ))}
              </>
            )}
          </div>
          {!loading &&
            !loadError &&
            (selected ? (
              <DetailsPanel
                key={selected.id}
                action={selected}
                onClose={onClose}
                onSaved={setSelection}
                onDirtyChange={setDirty}
                onCalendar={(a) => {
                  setCalendarDate(a.date);
                  setView('calendar');
                  setSearch('');
                  onClose();
                }}
              />
            ) : showInbox ? (
              <DetailsPlaceholder />
            ) : null)}
        </main>
      </div>
      <div className={`toast ${notice ? 'visible' : ''}`} role="status" aria-live="polite">
        {notice && (
          <>
            <Check size={16} />
            {notice}
          </>
        )}
      </div>
    </div>
  );
}
