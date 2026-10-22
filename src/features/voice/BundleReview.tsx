import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/context';
import type { ExtractedAction } from '../../types/action';
import { DetailsPanel, type ReviewHandle } from '../extraction/DetailsPanel';
import { Button, ErrorState } from '../../components/ui';
export function BundleReview({
  actions: initial,
  onClose,
}: {
  actions: ExtractedAction[];
  onClose: () => void;
}) {
  const { services, snapshot } = useApp();
  const closeWindow = useRef<(() => Promise<void>) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [actions, setActions] = useState(initial),
    [index, setIndex] = useState(0),
    [discard, setDiscard] = useState(false);
  const [error, setError] = useState('');
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);
  const savedDrafts = useRef(
    new Set(
      initial.filter((a) => snapshot.actions.some((saved) => saved.id === a.id)).map((a) => a.id),
    ),
  );
  const panels = useRef(new Map<string, ReviewHandle>());
  const dirty = useRef(new Set<string>());
  const pending = useRef(new Set<string>());
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => {
      element?.close();
      window.setTimeout(() => {
        if (document.querySelector('dialog[open]')) return;
        const target =
          opener?.isConnected &&
          opener.matches('button, a[href], input, select, textarea, [role="button"]') &&
          !opener.matches(':disabled')
            ? opener
            : document.querySelector<HTMLElement>(
                '.inbox-view:not([hidden]) [data-open-result], .inbox-view:not([hidden]) [data-voice-open]',
              );
        target?.focus({ preventScroll: true });
      }, 0);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    let dispose: (() => void) | undefined;
    void services.voice
      .guardClose((finish) => {
        if (pending.current.size || finishingRef.current) return;
        if (dirty.current.size) {
          closeWindow.current = finish;
          setDiscard(true);
        } else void finish();
      })
      .then((fn) => {
        if (alive) dispose = fn;
        else fn();
      })
      .catch(() => {});
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty.current.size || pending.current.size) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => {
      alive = false;
      dispose?.();
      window.removeEventListener('beforeunload', unload);
    };
  }, [services]);
  function close() {
    if (pending.current.size || finishingRef.current) return;
    if (dirty.current.size) setDiscard(true);
    else onClose();
  }
  async function finishDrafts() {
    if (finishingRef.current || pending.current.size) return;
    finishingRef.current = true;
    setFinishing(true);
    setError('');
    try {
      const prepared = actions
        .filter(
          (a) =>
            (a.status === 'needs_review' && !savedDrafts.current.has(a.id)) ||
            dirty.current.has(a.id),
        )
        .map((a) => {
          const handle = panels.current.get(a.id);
          if (!handle) throw new Error('Review is not ready. Please retry.');
          try {
            return {
              handle,
              item: handle.prepare(a.status === 'needs_review' ? 'draft' : 'update'),
            };
          } catch (error) {
            setIndex(actions.findIndex((item) => item.id === a.id));
            throw error;
          }
        });
      for (const { handle, item } of prepared) {
        try {
          await handle.save(item, item.status === 'needs_review' ? 'draft' : 'update');
        } catch (error) {
          setIndex(actions.findIndex((a) => a.id === item.id));
          throw error;
        }
      }
      onClose();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not save remaining drafts. Your edits are retained.',
      );
    } finally {
      finishingRef.current = false;
      setFinishing(false);
    }
  }
  return (
    <dialog
      className="inbox-result-dialog bundle-review"
      aria-label="Captured actions"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="bundle-selector">
        <label htmlFor="captured-action">Review action</label>
        <select
          id="captured-action"
          disabled={finishing}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
        >
          {actions.map((action, i) => (
            <option value={i} key={action.id}>
              {i + 1} of {actions.length} · {action.title}
            </option>
          ))}
        </select>
        <Button onClick={close} disabled={finishing}>
          Close review
        </Button>
        <Button onClick={() => void finishDrafts()} disabled={finishing}>
          {finishing ? 'Saving drafts…' : 'Save drafts & finish'}
        </Button>
      </div>
      {error && <ErrorState message={error} />}
      {discard && (
        <div className="inline-confirm" role="alert">
          <p>Discard your unsaved edits?</p>
          <Button
            onClick={() => {
              if (pending.current.size || finishingRef.current) return;
              if (closeWindow.current) void closeWindow.current();
              else onClose();
            }}
          >
            Discard edits
          </Button>
          <Button
            onClick={() => {
              closeWindow.current = null;
              setDiscard(false);
            }}
          >
            Keep editing
          </Button>
        </div>
      )}
      {actions.map((action, i) => (
        <div className="bundle-panel" hidden={i !== index} key={action.id}>
          <DetailsPanel
            action={action}
            reviewRef={(handle) => {
              if (handle) panels.current.set(action.id, handle);
              else panels.current.delete(action.id);
            }}
            active={i === index}
            reviewBusy={finishing}
            onClose={close}
            onSaved={(value, intent) => {
              dirty.current.delete(value.id);
              savedDrafts.current.add(value.id);
              const next = actions.map((a) => (a.id === value.id ? value : a));
              setActions((current) => current.map((a) => (a.id === value.id ? value : a)));
              if (intent !== 'confirm' || finishingRef.current) return;
              const unconfirmed = next.findIndex((a) => a.status === 'needs_review');
              if (unconfirmed >= 0) setIndex(unconfirmed);
              else if (dirty.current.size) setIndex(next.findIndex((a) => dirty.current.has(a.id)));
              else onClose();
            }}
            onDirtyChange={(value) => {
              if (value) dirty.current.add(action.id);
              else dirty.current.delete(action.id);
            }}
            onPendingChange={(value) => {
              if (value) pending.current.add(action.id);
              else pending.current.delete(action.id);
            }}
            onCalendar={() => {}}
            hideCalendar
          />
        </div>
      ))}
    </dialog>
  );
}
