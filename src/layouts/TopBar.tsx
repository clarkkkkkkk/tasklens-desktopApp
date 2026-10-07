import { Search, Plus, X, ShieldCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '../components/ui';
export function TopBar({
  search,
  setSearch,
  onNew,
}: {
  search: string;
  setSearch: (s: string) => void;
  onNew: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return (
    <header className="topbar">
      <div className="search-bar">
        <Search size={17} />
        <input
          ref={input}
          aria-label="Search all items"
          placeholder="Search your workspace"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search ? (
          <button aria-label="Clear search" onClick={() => setSearch('')} className="icon-button">
            <X size={14} />
          </button>
        ) : (
          <kbd>Ctrl K</kbd>
        )}
      </div>
      <div className="topbar-actions">
        <span className="private-label">
          <ShieldCheck size={15} /> Local workspace
        </span>
        <Button variant="primary" onClick={onNew}>
          <Plus size={16} />
          New item
        </Button>
      </div>
    </header>
  );
}
