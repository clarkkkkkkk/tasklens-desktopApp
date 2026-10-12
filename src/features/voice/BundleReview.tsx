import { useEffect, useRef, useState } from 'react';
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
      opener?.focus();
    };
  }, []);
  function close() {
    if (pending.current.size) return;
    if (dirty.current.size) setDiscard(true);
    else onClose();
  }
  return (
    <dialog
      className="inbox-result-dialog"
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
          <Button onClick={onClose}>Discard edits</Button>
          <Button onClick={() => setDiscard(false)}>Keep editing</Button>
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
