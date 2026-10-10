import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  Search,
  X,
  CalendarDays,
  ListTodo,
  Flag,
} from '../../components/icons';
import type { ExtractedAction } from '../../types/action';
import { matchesSearch, needsReview } from '../../lib/actions';
import { displayDate, displayTime } from '../../lib/dates';
import { ErrorState, LoadingState } from '../../components/ui';
import './search.css';

interface SearchDialogProps {
  actions: ExtractedAction[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onSelect: (action: ExtractedAction) => void;
}

export function SearchDialog({ actions, loading, error, onClose, onSelect }: SearchDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closingRef = useRef(false);
  const composing = useRef(false);
  const [closing, setClosing] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const id = useId();
  const normalizedQuery = query.trim();
  const matches = useMemo(
    () =>
      normalizedQuery
        ? actions
            .filter((item) => matchesSearch(item, normalizedQuery))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        : [],
    [actions, normalizedQuery],
  );
  const results = matches.slice(0, 20);
  const selectedIndex = Math.min(activeIndex, Math.max(0, results.length - 1));
  const hasResults = results.length > 0 && !loading && !error;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    input.current?.focus({ preventScroll: true });
    return () => {
      clearTimeout(closeTimer.current);
      element?.close();
    };
  }, []);

  useEffect(() => {
    if (hasResults)
      document
        .getElementById(`${id}-result-${selectedIndex}`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [hasResults, id, selectedIndex, normalizedQuery]);

  function dismiss(action?: ExtractedAction) {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = dialog.current
      ? Number.parseFloat(
          getComputedStyle(dialog.current).getPropertyValue('--search-exit-duration'),
        )
      : 0;
    closeTimer.current = setTimeout(
      () => {
        dialog.current?.close();
        onClose();
        if (action) requestAnimationFrame(() => onSelect(action));
      },
      reducedMotion || !Number.isFinite(duration) ? 0 : duration,
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.nativeEvent.isComposing) {
      event.stopPropagation();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      return;
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && hasResults) {
      event.preventDefault();
      setActiveIndex(
        (selectedIndex + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length,
      );
      input.current?.focus({ preventScroll: true });
    }
    if (event.key === 'Enter' && hasResults && event.target === input.current) {
      event.preventDefault();
      dismiss(results[selectedIndex]);
    }
  }

  return (
    <dialog
      ref={dialog}
      className={`workspace-search ${closing ? 'is-closing' : ''}`}
      aria-labelledby={`${id}-title`}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        if (!composing.current) dismiss();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            dismiss();
        }
      }}
    >
      <h2 id={`${id}-title`} className="sr-only">
        Search your workspace
      </h2>
      <div className="workspace-search-input">
        <Search size={24} aria-hidden="true" />
        <label className="sr-only" htmlFor={`${id}-input`}>
          Search all items
        </label>
        <input
          ref={input}
          id={`${id}-input`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={hasResults}
          aria-controls={`${id}-results`}
          aria-activedescendant={hasResults ? `${id}-result-${selectedIndex}` : undefined}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search your workspace…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
        />
        {query && (
          <button
            className="icon-button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              setActiveIndex(0);
              input.current?.focus();
            }}
          >
            <X size={18} />
          </button>
        )}
        <button className="search-escape" aria-label="Close search" onClick={() => dismiss()}>
          <kbd>esc</kbd>
        </button>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {normalizedQuery && !loading && !error
          ? `${matches.length} ${matches.length === 1 ? 'result' : 'results'}${matches.length > 20 ? '. Showing the first 20.' : ''}`
          : ''}
      </div>
      <div className="workspace-search-content" hidden={!normalizedQuery && !loading && !error}>
        {loading ? (
          <LoadingState label="Loading your items…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : (
          <>
            <div className="search-results-heading">
              {matches.length
                ? `${matches.length} ${matches.length === 1 ? 'result' : 'results'}${matches.length > 20 ? ' · First 20 shown' : ''}`
                : 'SEARCH YOUR LOCAL WORKSPACE'}
            </div>
            {!matches.length && (
              <div className="search-no-results">
                <Search size={24} />
                <h3>No matches just yet.</h3>
                <p>Try another title, location, note, or requirement.</p>
              </div>
            )}
          </>
        )}
        <div
          role="listbox"
          id={`${id}-results`}
          aria-label="Search results"
          className="search-results"
          hidden={!hasResults}
        >
          {results.map((item, index) => {
            const Icon =
              item.type === 'event' ? CalendarDays : item.type === 'deadline' ? Flag : ListTodo;
            const snippet = [item.location, ...item.notes, ...item.requirements].find(
              (value) =>
                value &&
                normalizedQuery
                  .toLocaleLowerCase()
                  .split(/\s+/)
                  .some((word) => value.toLocaleLowerCase().includes(word)),
            );
            return (
              <div
                role="option"
                aria-selected={index === selectedIndex}
                id={`${id}-result-${index}`}
                key={item.id}
                className={`search-result ${index === selectedIndex ? 'is-active' : ''}`}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => dismiss(item)}
              >
                <span className="search-result-icon">
                  <Icon size={20} />
                </span>
                <div className="search-result-copy">
                  <span className="search-result-title">{item.title}</span>
                  <span className="search-result-meta">
                    {item.type} · {displayDate(item.date)}
                    {item.arrivalTime || item.time
                      ? ` · ${displayTime(item.arrivalTime || item.time)}`
                      : ''}
                    {item.status === 'completed'
                      ? ' · Completed'
                      : needsReview(item)
                        ? ' · Needs review'
                        : ''}
                  </span>
                  {snippet && <span className="search-result-snippet">{snippet}</span>}
                </div>
                <CornerDownLeft size={16} className="search-result-return" aria-hidden="true" />
              </div>
            );
          })}
        </div>
      </div>
      <footer className="workspace-search-footer" aria-label="Search keyboard shortcuts">
        <span>
          <kbd>
            <ArrowUp size={13} />
          </kbd>
          <kbd>
            <ArrowDown size={13} />
          </kbd>
          navigate
        </span>
        <span>
          <kbd>
            <CornerDownLeft size={13} />
          </kbd>
          open
        </span>
        <button onClick={() => dismiss()} aria-label="Dismiss search">
          <kbd>esc</kbd>close
        </button>
      </footer>
    </dialog>
  );
}
