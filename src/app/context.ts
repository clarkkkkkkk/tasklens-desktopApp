import { createContext, useContext } from 'react';
import type { ExtractedAction, Settings, Snapshot } from '../types/action';
import type { Services } from './services';
export interface AppState {
  snapshot: Snapshot;
  loading: boolean;
  loadError: string;
  notice: string;
  services: Services;
  reload: () => Promise<void>;
  save: (a: ExtractedAction) => Promise<void>;
  remove: (id: string) => Promise<void>;
  complete: (a: ExtractedAction) => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  announce: (message: string) => void;
}
export const AppContext = createContext<AppState | null>(null);
export function useApp(): AppState {
  const context = useContext(AppContext);
  if (!context) throw new Error('AppProvider is required');
  return context;
}
