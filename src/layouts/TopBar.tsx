import { Search, Plus, ShieldCheck } from '../components/icons';
import { Button } from '../components/ui';
import { workspaceSearchShortcut } from '../features/guided-tour/tourSteps';
export function TopBar({
  onSearch,
  onNew,
  searchOpen,
}: {
  onSearch: () => void;
  onNew: () => void;
  searchOpen: boolean;
}) {
  const shortcut = workspaceSearchShortcut();
  return (
    <header className="topbar" data-tour="workspace-tools">
      <button
        className="search-bar search-trigger"
        data-tour="search"
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
        <Button variant="primary" onClick={onNew} data-tour="new-item">
          <Plus size={16} />
          New item
        </Button>
      </div>
    </header>
  );
}
