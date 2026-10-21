import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/context';
import type { ExtractedAction } from '../../types/action';
import { DetailsPanel } from '../extraction/DetailsPanel';
import { Button } from '../../components/ui';
export function BundleReview({
  actions: initial,
  onClose,
}: {
  actions: ExtractedAction[];
  onClose: () => void;
}) {
  const { services } = useApp();
  const closeWindow = useRef<(() => Promise<void>) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [actions, setActions] = useState(initial),
    [index, setIndex] = useState(0),
    [discard, setDiscard] = useState(false);
  const dirty = useRef(new Set<string>());
  const pending = useRef(new Set<string>());
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => {
      element?.close();
      const target =
        opener?.isConnected &&
        opener.matches('button, a[href], input, select, textarea, [role="button"]') &&
        !opener.matches(':disabled')
          ? opener
          : document.querySelector<HTMLElement>('.inbox-view:not([hidden]) [data-voice-open]');
      target?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    let alive = true;
    let dispose: (() => void) | undefined;
    void services.voice
      .guardClose((finish) => {
        if (pending.current.size) return;
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
    if (pending.current.size) return;
    if (dirty.current.size) setDiscard(true);
    else onClose();
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
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
        >
          {actions.map((action, i) => (
            <option value={i} key={action.id}>
              {i + 1} of {actions.length} · {action.title}
            </option>
          ))}
        </select>
        <Button onClick={close}>Close review</Button>
      </div>
      {discard && (
        <div className="inline-confirm" role="alert">
          <p>Discard your unsaved edits?</p>
          <Button
            onClick={() => {
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
            active={i === index}
            onClose={close}
            onSaved={(value) =>
              setActions((current) => current.map((a) => (a.id === value.id ? value : a)))
            }
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
