import { useWorkspaceModalLock } from './components/useWorkspaceModalLock';
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
import { GuidedTour } from './features/guided-tour/GuidedTour';
import { useGuidedTour } from './features/guided-tour/useGuidedTour';
import { useTourReadiness } from './features/guided-tour/useTourReadiness';
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
  useWorkspaceModalLock();
  const {
    snapshot,
    loading,
    loadError,
    reload,
    notice,
    noticeTone,
    setupOpen,
    services,
    announce,
  } = useApp();
  // Device UI preference, separate from task backups and credential storage.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('tasklens:sidebar-collapsed:v1') === 'true';
    } catch {
      return false;
    }
  });
  const sidebarCollapsedRef = useRef(sidebarCollapsed);
  const toggleSidebar = useCallback(() => {
    const next = !sidebarCollapsedRef.current;
    sidebarCollapsedRef.current = next;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem('tasklens:sidebar-collapsed:v1', String(next));
    } catch {
      announce('Sidebar changed for this session. Its preference could not be saved.');
    }
  }, [announce]);
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
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [settingsMounted, setSettingsMounted] = useState(false);
  const guidedReplayScroll = useRef(0);
  const guidedReplayOpener = useRef<HTMLElement | null>(null);
  const guidedRestore = useRef<{ settings: boolean } | null>(null);
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
  const settingsBusy = useTourReadiness();
  const guidedBlocked = !!(
    loading ||
    loadError ||
    touring ||
    brandHandoff ||
    setupOpen ||
    searchOpen ||
    selection ||
    dirty ||
    voiceBusy ||
    screenshotBusy ||
    bundle ||
    pendingView ||
    settingsBusy
  );
  const guided = useGuidedTour({
    blocked: guidedBlocked,
    navigate: setView,
    announce,
    onDismiss: (origin, finished) => {
      const restoreSettings = origin === 'replay' && !finished;
      guidedRestore.current = { settings: restoreSettings };
      setView(restoreSettings ? 'settings' : 'inbox');
      if (origin === 'first-run') setCaptureHint(true);
    },
  });
  const queueGuidedTour = guided.queueFirstRun;
  useEffect(() => {
    if (view === 'settings') setSettingsMounted(true);
  }, [view]);
  useLayoutEffect(() => {
    pageContent.current?.scrollTo(0, 0);
  }, [view]);
  useLayoutEffect(() => {
    if (guided.active || !guidedRestore.current) return;
    const restore = guidedRestore.current;
    guidedRestore.current = null;
    // Restore after the destination commit and its normal view scroll reset.
    const timer = window.setTimeout(() => {
      if (document.querySelector('dialog[open]')) return;
      if (restore.settings) {
        if (pageContent.current) pageContent.current.scrollTop = guidedReplayScroll.current;
        guidedReplayOpener.current?.focus({ preventScroll: true });
      } else document.getElementById('main-content')?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [guided.active, view]);
  const finishBrandHandoff = useCallback(() => {
    const queued = brandHandoff?.firstRun ? queueGuidedTour() : false;
    pendingBrandFocus.current = !queued;
    setBrandHandoff(null);
    if (brandHandoff?.firstRun && !queued) setCaptureHint(true);
  }, [brandHandoff, queueGuidedTour]);
  useLayoutEffect(() => {
    if (!brandHandoff && pendingBrandFocus.current) {
      pendingBrandFocus.current = false;
      document.getElementById('main-content')?.focus({ preventScroll: true });
    }
  }, [brandHandoff]);
  const exitReplay = useCallback(() => {
    setReplay(false);
    setFinishingTour(false);
    window.setTimeout(() => replayOpener.current?.focus({ preventScroll: true }), 0);
  }, []);
  useEffect(() => {
    if (!captureHint) return;
    const timer = setTimeout(() => setCaptureHint(false), 6000);
    return () => clearTimeout(timer);
  }, [captureHint]);
  const opener = useRef<HTMLElement | null>(null);
  const captureReview = useRef(false);
  const focusVersion = useRef(0);
  const pendingCloseFocus = useRef<number | null>(null);
  const onOpen = useCallback(
    (a: ExtractedAction, floating = false) => {
      if (dirty) {
        announce('Save or close your current edits before opening another item.');
        return;
      }
      focusVersion.current++;
      pendingCloseFocus.current = null;
      captureReview.current = floating;
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSelection(a);
      setFloatingResult(floating);
    },
    [dirty, announce],
  );
  useEffect(() => {
    if (
      !isTauri() ||
      loading ||
      dirty ||
      voiceBusy ||
      screenshotBusy ||
      bundle ||
      touring ||
      brandHandoff ||
      guided.active ||
      guided.pending ||
      setupOpen
    )
      return;
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
  }, [
    loading,
    dirty,
    voiceBusy,
    screenshotBusy,
    bundle,
    touring,
    brandHandoff,
    guided.active,
    guided.pending,
    setupOpen,
    snapshot.actions,
    onOpen,
    announce,
  ]);
  const onClose = useCallback(() => {
    pendingCloseFocus.current = ++focusVersion.current;
    setSelection(null);
    setDirty(false);
  }, []);
  useEffect(() => {
    if (selection || pendingCloseFocus.current === null) return;
    const version = pendingCloseFocus.current;
    pendingCloseFocus.current = null;
    // Run after the close commit. Inactive WebKit windows suspend animation frames,
    // and a timer scheduled before the commit can still see an inert modal workspace.
    const timer = window.setTimeout(() => {
      if (focusVersion.current !== version || document.querySelector('dialog[open]')) return;
      const captureTarget = captureReview.current
        ? document.querySelector<HTMLElement>('.inbox-view:not([hidden]) [data-open-result]')
        : null;
      const target =
        captureTarget ??
        (opener.current?.isConnected && opener.current !== document.body
          ? opener.current
          : document.querySelector<HTMLElement>('.inbox-view:not([hidden]) [data-open-result]'));
      target?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selection]);
  const selected = selection
    ? snapshot.actions.find((a) => a.id === selection.id) || selection
    : null;
  const showInbox = view === 'inbox';
  const resultDialogOpen = floatingResult && !!selected;
  useEffect(() => {
    if (touring || guided.active || guided.pending || loading || loadError) return;
    const handler = (event: KeyboardEvent) => {
      if (
        event.ctrlKey &&
        event.shiftKey &&
        !event.altKey &&
        !event.metaKey &&
        (event.code === 'Space' || event.key === ' ')
      ) {
        if (
          event.repeat ||
          event.isComposing ||
          event.defaultPrevented ||
          document.querySelector('dialog[open]') ||
          brandHandoff ||
          setupOpen
        )
          return;
        event.preventDefault();
        toggleSidebar();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (!brandHandoff && !voiceBusy && !screenshotBusy && !bundle && !setupOpen)
          setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    touring,
    guided.active,
    guided.pending,
    brandHandoff,
    voiceBusy,
    screenshotBusy,
    bundle,
    setupOpen,
    loading,
    loadError,
    toggleSidebar,
  ]);
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
            const firstCompletion = reason === 'complete' && !replay;
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
              if (!firstCompletion || !queueGuidedTour()) {
                if (!replay) setCaptureHint(true);
                window.setTimeout(
                  () => document.getElementById('main-content')?.focus({ preventScroll: true }),
                  0,
                );
              }
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
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          view={view}
          onNavigate={(v) => {
            if (guided.active || guided.pending) return;
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
              if (!guided.active && !voiceBusy && !screenshotBusy && !setupOpen)
                setSearchOpen(true);
            }}
            searchOpen={searchOpen}
            onNew={() => {
              if (!guided.active && !voiceBusy && !screenshotBusy && !setupOpen)
                onOpen(newAction());
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
                      setupOpen ||
                      resultDialogOpen ||
                      searchOpen ||
                      guided.active ||
                      !!brandHandoff ||
                      voiceBusy ||
                      !!bundle
                    }
                    captureHint={captureHint}
                    onCaptureInteraction={() => setCaptureHint(false)}
                    locked={dirty || !!bundle}
                    onVoiceGuard={onVoiceGuard}
                    onCaptureBusyChange={setScreenshotBusy}
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
                  {(settingsMounted || view === 'settings') && (
                    <SettingsView
                      active={view === 'settings'}
                      tourActive={guided.active}
                      guidedReplayDisabled={guidedBlocked || guided.pending}
                      onReplayGuidedTour={() => {
                        if (guidedBlocked || guided.pending) return;
                        guidedReplayScroll.current = pageContent.current?.scrollTop ?? 0;
                        guidedReplayOpener.current = document.activeElement as HTMLElement;
                        setCaptureHint(false);
                        guided.replay();
                      }}
                      onReplay={() => {
                        if (dirty) {
                          announce('Save or close your current edits before replaying onboarding.');
                          return;
                        }
                        replayOpener.current = document.activeElement as HTMLElement;
                        setSelection(null);
                        setSearchOpen(false);
                        setReplay(true);
                      }}
                    />
                  )}
                  {!showInbox &&
                    view !== 'settings' &&
                    (view === 'calendar' ? (
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
                          if (!voiceBusy && !setupOpen) onOpen(newAction());
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
                onSaved={(action, intent) => {
                  setSelection(action);
                  if (floatingResult && intent === 'confirm') onClose();
                }}
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
        <MotionToast message={notice} tone={noticeTone} />
      </div>
      {guided.active && (
        <GuidedTour
          step={guided.step}
          index={guided.index}
          count={guided.count}
          onMove={guided.move}
          onDismiss={guided.dismiss}
        />
      )}
    </>
  );
}
