import { STORAGE_KEY } from '../../repositories/LocalStorageRepository';

export const TOUR_STORAGE_KEY = 'tasklens:guided-tour:v1';
export type TourStatus = 'started' | 'completed' | 'skipped';

/** Capture before onboarding writes. Legacy profiles without its marker stay opt-in. */
export function isFirstRunWorkspace(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    const stored = JSON.parse(raw);
    return (
      stored?.settings?.onboardingCompletedVersion === 0 &&
      Array.isArray(stored.actions) &&
      stored.actions.length === 0
    );
  } catch {
    return false;
  }
}

export function hasStartedTour(): boolean {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(TOUR_STORAGE_KEY) || 'null');
    return (
      !!stored &&
      typeof stored === 'object' &&
      'status' in stored &&
      ['started', 'completed', 'skipped'].includes(String(stored.status))
    );
  } catch {
    return false;
  }
}

export function storeTourStatus(status: TourStatus): boolean {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ status }));
    return true;
  } catch {
    return false;
  }
}
