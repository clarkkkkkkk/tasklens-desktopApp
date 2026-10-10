import { OnboardingFlow } from './features/onboarding/OnboardingFlow';
import { CURRENT_ONBOARDING_VERSION } from './features/onboarding/onboarding.constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Download, RefreshCw } from 'lucide-react';
import { useApp } from './app/context';
import { Sidebar } from './layouts/Sidebar';
import { TopBar } from './layouts/TopBar';
import { SearchDialog } from './features/search/SearchDialog';
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
    [searchOpen, setSearchOpen] = useState(false),
    [selection, setSelection] = useState<ExtractedAction | null>(null),
    [calendarDate, setCalendarDate] = useState<string>(),
    [dirty, setDirty] = useState(false);
  const [replay, setReplay] = useState(false),
    [captureHint, setCaptureHint] = useState(false);
  const replayOpener = useRef<HTMLElement | null>(null);
  const needsOnboarding =
    !loading &&
    !loadError &&
    snapshot.settings.onboardingCompletedVersion < CURRENT_ONBOARDING_VERSION;
  const touring = replay || needsOnboarding;
  const exitReplay = useCallback(() => {
    setReplay(false);
    requestAnimationFrame(() => replayOpener.current?.focus());
  }, []);
  useEffect(() => {
    if (!captureHint) return;
    const timer = setTimeout(() => setCaptureHint(false), 6000);
    return () => clearTimeout(timer);
  }, [captureHint]);
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
  const showInbox = view === 'inbox';
  useEffect(() => {
    if (touring || loading || loadError) return;
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [touring, loading, loadError]);
  function backup() {
    try {
      downloadText(services.repository.exportRaw(), 'tasklens-recovery.json');
    } catch {
      announce('Could not access local storage to export a backup.');
    }
  }
  if (loading) return <LoadingState />;
  return (
    <>
      {touring && (
        <OnboardingFlow
          replay={replay}
          onExit={exitReplay}
          onFinish={() => {
            setView('inbox');
            setReplay(false);
            if (!replay) setCaptureHint(true);
            requestAnimationFrame(() => document.getElementById('main-content')?.focus());
          }}
        />
      )}
      <div hidden={touring} inert={touring} className="app-shell">
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
            setCaptureHint(false);
            setView(v);
          }}
          actions={snapshot.actions}
        />
        <div className="app-body">
          <TopBar
            onSearch={() => setSearchOpen(true)}
            searchOpen={searchOpen}
            onNew={() => onOpen(newAction())}
          />
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
                    active={showInbox && !touring}
                    captureHint={captureHint}
                    onCaptureInteraction={() => setCaptureHint(false)}
                    locked={dirty}
                    onResult={onOpen}
                    onRemove={() => {
                      if (selection && !snapshot.actions.some((a) => a.id === selection.id))
                        onClose();
                    }}
                  />
                  {!showInbox &&
                    (view === 'settings' ? (
                      <SettingsView
                        onReplay={() => {
                          if (dirty) {
                            announce(
                              'Save or close your current edits before replaying onboarding.',
                            );
                            return;
                          }
                          replayOpener.current = document.activeElement as HTMLElement;
                          setSelection(null);
                          setSearchOpen(false);
                          setReplay(true);
                        }}
                      />
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
                    onClose();
                  }}
                />
              ) : showInbox ? (
                <DetailsPlaceholder />
              ) : null)}
          </main>
        </div>
        {searchOpen && !touring && (
          <SearchDialog
            actions={snapshot.actions}
            loading={loading}
            error={loadError}
            onClose={() => setSearchOpen(false)}
            onSelect={onOpen}
          />
        )}
        <div className={`toast ${notice ? 'visible' : ''}`} role="status" aria-live="polite">
          {notice && (
            <>
              <Check size={16} />
              {notice}
            </>
          )}
        </div>
      </div>
    </>
  );
}
