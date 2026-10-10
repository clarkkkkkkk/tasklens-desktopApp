import { Search, Plus, ShieldCheck } from '../components/icons';
import { Button } from '../components/ui';
export function TopBar({
  onSearch,
  onNew,
  searchOpen,
}: {
  onSearch: () => void;
  onNew: () => void;
  searchOpen: boolean;
}) {
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
  return (
    <header className="topbar">
      <button
        className="search-bar search-trigger"
        aria-label="Search your workspace"
        aria-haspopup="dialog"
        aria-expanded={searchOpen}
        onClick={onSearch}
      >
        <Search size={17} />
        <span>Search your workspace</span>
        <kbd>{shortcut}</kbd>
      </button>
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
