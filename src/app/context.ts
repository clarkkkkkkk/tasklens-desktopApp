import { createContext, useContext } from 'react';
import type { ExtractedAction, Settings, Snapshot } from '../types/action';
import type { ProcessingState } from '../services/ai/ProcessingMode';
import type { Services } from './services';
export interface AppState {
  snapshot: Snapshot;
  processing: ProcessingState;
  ensureProcessing: () => Promise<boolean>;
  openAISetup: () => void;
  setupOpen: boolean;
  noticeTone: 'success' | 'warning' | 'info';
  loading: boolean;
  loadError: string;
  notice: string;
  services: Services;
  reload: () => Promise<void>;
  save: (a: ExtractedAction) => Promise<void>;
  remove: (id: string) => Promise<void>;
  complete: (a: ExtractedAction) => Promise<void>;
  saveSettings: (s: Settings | ((current: Settings) => Settings)) => Promise<void>;
  announce: (message: string) => void;
}
export const AppContext = createContext<AppState | null>(null);
export function useApp(): AppState {
  const context = useContext(AppContext);
  if (!context) throw new Error('AppProvider is required');
  return context;
}
