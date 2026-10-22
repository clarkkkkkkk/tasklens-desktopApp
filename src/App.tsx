import { ReminderHealth } from './components/ReminderHealth';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { installLifecycle, registerCloseGuard } from './services/reliability/lifecycle';
import { LocalIntelligenceStatus } from './components/LocalIntelligenceStatus';
import { BundleReview } from './features/voice/BundleReview';
import { MotionToast } from './components/motion/MotionToast';
import { BrandHandoff } from './components/motion/BrandHandoff';
import { reducedMotion } from './components/motion/motion';
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
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void installLifecycle().then((unlisten) => {
      if (disposed) unlisten();
      else cleanup = unlisten;
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);
  useEffect(() => {
    const failed = () =>
      announce('TaskLens could not close safely. Your data is preserved. Retry from Settings.');
    window.addEventListener('lifecycle-error', failed);
    return () => window.removeEventListener('lifecycle-error', failed);
  }, [announce]);
  useEffect(
    () =>
      registerCloseGuard((finish) => {
        if (dirty) {
          announce('Save or close your current edits before closing TaskLens.');
          return;
        }
        void finish();
      }),
    [dirty, announce],
  );
  const pendingBrandFocus = useRef(false);
  const requestedView = useRef(view);
  useLayoutEffect(() => {
    requestedView.current = view;
  }, [view]);
  const pageContent = useRef<HTMLDivElement>(null);
  const replayOpener = useRef<HTMLElement | null>(null);
  const needsOnboarding =
    !loading &&
    !loadError &&
    snapshot.settings.onboardingCompletedVersion < CURRENT_ONBOARDING_VERSION;
  const touring = !loadError && (replay || needsOnboarding || finishingTour);
  useLayoutEffect(() => {
    pageContent.current?.scrollTo(0, 0);
  }, [view]);
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
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSelection(a);
      setFloatingResult(floating);
    },
    [dirty, announce],
  );
  useEffect(() => {
    if (!isTauri() || loading || dirty || voiceBusy || bundle || touring) return;
    let disposed = false;
    let cleanup = () => {};
    const consume = async () => {
      const id = await invoke<string | null>('reminder_take_activation');
      if (!id || disposed) return;
      const action = snapshot.actions.find((item) => item.id === id);
      if (action) onOpen(action);
      else announce('This notification refers to an item that is no longer available.');
    };
    void listen('reminder-open', () => void consume())
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        cleanup = unlisten;
        return consume();
      })
      .catch(() => {
        if (!disposed)
          announce('Notification activation is unavailable. Open the item from your workspace.');
      });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [loading, dirty, voiceBusy, bundle, touring, snapshot.actions, onOpen, announce]);
  const onClose = useCallback(() => {
    const version = ++focusVersion.current;
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
  async function backup() {
    try {
      downloadText(await services.repository.exportRaw(), 'tasklens-recovery.json');
    } catch {
      announce('Could not access local storage to export a backup.');
    }
  }
  if (loading) return <LoadingState />;
  return (
    <>
      <LocalIntelligenceStatus />
      <ReminderHealth />
      {touring && (
        <OnboardingFlow
          replay={replay}
          onFinishingChange={setFinishingTour}
          onExit={exitReplay}
          onFinish={async (reason) => {
            const showBrand = reason === 'complete' && !reducedMotion();
            const tour = document.querySelector<HTMLElement>('.onboarding');
            if (tour) {
              tour.inert = true;
              tour.setAttribute('aria-hidden', 'true');
            }
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
            if (v === requestedView.current) return;
            if (voiceCancel.current) {
              setPendingView(v);
              return;
            }
            if (dirty) {
              announce('Save or close your current edits before changing views.');
              return;
            }
            onClose();
            setCaptureHint(false);
            requestedView.current = v;
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
                    locked={dirty || !!bundle}
                    onVoiceGuard={onVoiceGuard}
                    onBundle={setBundle}
                    onOpenSettings={() => {
                      if (dirty || voiceCancel.current) return;
                      onClose();
                      setView('settings');
                    }}
                    onResult={(action) => onOpen(action, true)}
                    onManual={(action) => onOpen(action)}
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
                })().catch(() =>
                  announce(
                    'Capture cleanup could not finish. Stay here and restart TaskLens before capturing again.',
                  ),
                );
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
