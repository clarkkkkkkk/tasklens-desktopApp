import type { ExtractedAction, Settings, Snapshot } from '../types/action';
export interface ActionRepository {
  load(): Promise<Snapshot>;
  saveAction(action: ExtractedAction): Promise<Snapshot>;
  deleteAction(id: string): Promise<Snapshot>;
  saveSettings(settings: Settings): Promise<Snapshot>;
  exportRaw(): string;
}
