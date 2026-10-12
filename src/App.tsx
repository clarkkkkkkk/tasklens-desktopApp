import { BundleReview } from './features/voice/BundleReview';
import { MotionToast } from './components/motion/MotionToast';
import { BrandHandoff } from './components/motion/BrandHandoff';
import { animateMotion, prepareExit, reducedMotion, useEntrance } from './components/motion/motion';
import { OnboardingFlow } from './features/onboarding/OnboardingFlow';
import { CURRENT_ONBOARDING_VERSION } from './features/onboarding/onboarding.constants';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Download, RefreshCw } from './components/icons';
import { useApp } from './app/context';
import { Sidebar } from './layouts/Sidebar';
import { TopBar } from './layouts/TopBar';
import { SearchDialog } from './features/search/SearchDialog';
import { Inbox } from './features/inbox/Inbox';
import { TaskViews } from './features/tasks/TaskViews';
import { CalendarView } from './features/calendar/CalendarView';
import { SettingsView } from './features/settings/SettingsView';
import { DetailsPanel } from './features/extraction/DetailsPanel';
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
  const [finishingTour, setFinishingTour] = useState(false);
  const [floatingResult, setFloatingResult] = useState(false);
  const [brandHandoff, setBrandHandoff] = useState<{ firstRun: boolean } | null>(null);
  const [bundle, setBundle] = useState<ExtractedAction[] | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const voiceCancel = useRef<(() => Promise<void>) | null>(null);
  const [pendingView, setPendingView] = useState<View | null>(null);
  const onVoiceGuard = useCallback((cancel: (() => Promise<void>) | null) => {
    voiceCancel.current = cancel;
    setVoiceBusy(!!cancel);
  }, []);
  const pendingBrandFocus = useRef(false);
  const pageContent = useRef<HTMLDivElement>(null);
  const replayOpener = useRef<HTMLElement | null>(null);
  const needsOnboarding =
    !loading &&
    !loadError &&
    snapshot.settings.onboardingCompletedVersion < CURRENT_ONBOARDING_VERSION;
  const touring = !loadError && (replay || needsOnboarding || finishingTour);
  useEntrance(pageContent, view, 'page', !touring && !loading && !brandHandoff);
  const finishBrandHandoff = useCallback(() => {
    pendingBrandFocus.current = true;
    setBrandHandoff(null);
    if (brandHandoff?.firstRun) setCaptureHint(true);
  }, [brandHandoff]);
  useLayoutEffect(() => {
    if (!brandHandoff && pendingBrandFocus.current) {
      pendingBrandFocus.current = false;
      document.getElementById('main-content')?.focus({ preventScroll: true });
    }
  }, [brandHandoff]);
  const exitReplay = useCallback(() => {
    prepareExit(document.querySelector('.onboarding'), 160)();
    setReplay(false);
    setFinishingTour(false);
    requestAnimationFrame(() => replayOpener.current?.focus());
  }, []);
  useEffect(() => {
    if (!captureHint) return;
    const timer = setTimeout(() => setCaptureHint(false), 6000);
    return () => clearTimeout(timer);
  }, [captureHint]);
  const opener = useRef<HTMLElement | null>(null);
  const focusVersion = useRef(0);
  const onOpen = useCallback(
    (a: ExtractedAction, floating = false) => {
      if (dirty) {
        announce('Save or close your current edits before opening another item.');
        return;
      }
      focusVersion.current++;
      document.querySelectorAll('.motion-exit-snapshot').forEach((node) => node.remove());
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSelection(a);
      setFloatingResult(floating);
    },
    [dirty, announce],
  );
  const onClose = useCallback(() => {
    const version = ++focusVersion.current;
    prepareExit(
      document.querySelector('.inbox-result-dialog[open]:not(.motion-exit-snapshot)') ||
        document.querySelector('.details-panel:not(.motion-exit-snapshot)'),
    )();
    setSelection(null);
    setDirty(false);
    requestAnimationFrame(() => {
      if (focusVersion.current !== version) return;
      const target =
        opener.current?.isConnected && opener.current !== document.body
          ? opener.current
          : document.querySelector<HTMLElement>('.inbox-view:not([hidden]) [data-open-result]');
      target?.focus({ preventScroll: true });
    });
  }, []);
  const selected = selection
    ? snapshot.actions.find((a) => a.id === selection.id) || selection
    : null;
  const showInbox = view === 'inbox';
  const resultDialogOpen = floatingResult && !!selected;
  useEffect(() => {
    if (touring || loading || loadError) return;
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (!brandHandoff && !voiceBusy && !bundle) setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [touring, brandHandoff, voiceBusy, bundle, loading, loadError]);
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
          onFinishingChange={setFinishingTour}
          onExit={exitReplay}
          onFinish={async (reason) => {
            const tour = document.querySelector<HTMLElement>('.onboarding');
            if (tour) {
              tour.inert = true;
              tour.setAttribute('aria-hidden', 'true');
              await animateMotion(tour, 'fade', 0, true);
            }
            const showBrand = reason === 'complete' && !reducedMotion();
            if (showBrand) setBrandHandoff({ firstRun: !replay });
            setFinishingTour(false);
            setView('inbox');
            setReplay(false);
            if (!showBrand) {
              if (!replay) setCaptureHint(true);
              requestAnimationFrame(() => document.getElementById('main-content')?.focus());
            }
          }}
        />
      )}
      {brandHandoff && <BrandHandoff onComplete={finishBrandHandoff} />}
      <div
        hidden={touring}
        inert={touring || !!brandHandoff}
        aria-hidden={brandHandoff ? true : undefined}
        className={`app-shell ${brandHandoff ? 'brand-handoff-active' : ''}`}
      >
        <a className="skip-link" href="#main-content">
          Skip to workspace
        </a>
        <Sidebar
          view={view}
          onNavigate={(v) => {
            if (voiceCancel.current) {
              setPendingView(v);
              return;
            }
            if (dirty) {
              announce('Save or close your current edits before changing views.');
              return;
            }
            document.querySelectorAll('.motion-exit-snapshot').forEach((node) => node.remove());
            onClose();
            setCaptureHint(false);
            setView(v);
          }}
          actions={snapshot.actions}
        />
        <div className="app-body">
          <TopBar
            onSearch={() => {
              if (!voiceBusy) setSearchOpen(true);
            }}
            searchOpen={searchOpen}
            onNew={() => {
              if (!voiceBusy) onOpen(newAction());
            }}
          />
          <main
            id="main-content"
            tabIndex={-1}
            className={`workspace ${selected && !resultDialogOpen ? 'with-details' : ''}`}
          >
            <div ref={pageContent} className="main-content">
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
                    suspendPaste={
                      resultDialogOpen || searchOpen || !!brandHandoff || voiceBusy || !!bundle
                    }
                    captureHint={captureHint}
                    onCaptureInteraction={() => setCaptureHint(false)}
                    locked={dirty || !!bundle || voiceBusy}
                    onVoiceGuard={onVoiceGuard}
                    onBundle={setBundle}
                    onOpenSettings={() => {
                      if (dirty || voiceCancel.current) return;
                      onClose();
                      setView('settings');
                    }}
                    onResult={(action) => onOpen(action, true)}
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
                        onNew={() => {
                          if (!voiceBusy) onOpen(newAction());
                        }}
                      />
                    ))}
                </>
              )}
            </div>
            {!loading && !loadError && selected && (
              <DetailsPanel
                key={selected.id}
                action={selected}
                floating={resultDialogOpen}
                onClose={onClose}
                onSaved={setSelection}
                onDirtyChange={setDirty}
                onCalendar={(a) => {
                  setCalendarDate(a.date);
                  setView('calendar');
                  onClose();
                }}
              />
            )}
          </main>
        </div>
        {searchOpen && !touring && (
          <SearchDialog
            actions={snapshot.actions}
            loading={loading}
            error={loadError}
            onClose={() => setSearchOpen(false)}
            onSelect={(action) => onOpen(action, true)}
          />
        )}
        {bundle && <BundleReview actions={bundle} onClose={() => setBundle(null)} />}
        {pendingView && (
          <div className="voice-navigation-confirm" role="alert">
            <p>Stop and discard the current capture before changing pages?</p>
            <Button
              onClick={() => {
                void (async () => {
                  await voiceCancel.current?.();
                  setView(pendingView);
                  setPendingView(null);
                })();
              }}
            >
              Stop and leave
            </Button>
            <Button onClick={() => setPendingView(null)}>Keep capturing</Button>
          </div>
        )}
        <MotionToast message={notice} />
      </div>
    </>
  );
}
