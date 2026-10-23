import { afterEach, describe, expect, it, vi } from 'vitest';
import { overlaps, placeCard } from './tourGeometry';
import {
  hasStartedTour,
  isFirstRunWorkspace,
  storeTourStatus,
  TOUR_STORAGE_KEY,
} from './tourStorage';
import { tourSteps } from './tourSteps';

afterEach(() => vi.unstubAllGlobals());
describe('tour placement', () => {
  it('keeps cards inside the viewport and away from real targets', () => {
    for (const viewport of [
      { width: 1440, height: 920 },
      { width: 900, height: 640 },
      { width: 600, height: 640 },
    ]) {
      for (const target of [
        { x: 12, y: 12, width: 180, height: 80 },
        { x: viewport.width - 180, y: 20, width: 160, height: 40 },
        { x: 260, y: 100, width: 300, height: 60 },
      ]) {
        const card = placeCard(target, { width: 440, height: 320 }, viewport);
        expect(card.x).toBeGreaterThanOrEqual(12);
        expect(card.y).toBeGreaterThanOrEqual(12);
        expect(card.x + card.width).toBeLessThanOrEqual(viewport.width - 12);
        expect(card.y + card.height).toBeLessThanOrEqual(viewport.height - 12);
        expect(overlaps(card, target)).toBe(false);
      }
    }
  });
  it('shrinks the card into the larger free band when no side fits (CI 600x640 review step)', () => {
    const viewport = { width: 600, height: 640 };
    const target = { x: 12, y: 338.578125, width: 561, height: 105.28125 };
    const card = placeCard(target, { width: 440, height: 344.25 }, viewport);
    expect(overlaps(card, target)).toBe(false);
    expect(card.y).toBeGreaterThanOrEqual(12);
    expect(card.y + card.height).toBeLessThanOrEqual(target.y - 16);
    expect(card.height).toBeCloseTo(target.y - 16 - 12);
  });
  it('centers safely without a target and constrains tiny windows', () => {
    expect(placeCard(null, { width: 440, height: 320 }, { width: 900, height: 640 })).toEqual({
      x: 230,
      y: 160,
      width: 440,
      height: 320,
    });
    expect(placeCard(null, { width: 440, height: 700 }, { width: 320, height: 400 })).toEqual({
      x: 12,
      y: 12,
      width: 296,
      height: 376,
    });
  });
});
describe('device-local tour status', () => {
  it('distinguishes fresh onboarding from upgraded and already used workspaces', () => {
    let raw: string | null = null;
    vi.stubGlobal('localStorage', { getItem: () => raw });
    expect(isFirstRunWorkspace()).toBe(true);
    raw = JSON.stringify({ actions: [], settings: {} });
    expect(isFirstRunWorkspace()).toBe(false);
    raw = JSON.stringify({ actions: [], settings: { onboardingCompletedVersion: 0 } });
    expect(isFirstRunWorkspace()).toBe(true);
    raw = JSON.stringify({ actions: [{}], settings: { onboardingCompletedVersion: 0 } });
    expect(isFirstRunWorkspace()).toBe(false);
    raw = JSON.stringify({ actions: [], settings: { onboardingCompletedVersion: 1 } });
    expect(isFirstRunWorkspace()).toBe(false);
  });
  it('does not opt existing users in when no status exists', () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    expect(hasStartedTour()).toBe(false);
    for (const status of ['started', 'completed', 'skipped'] as const) {
      expect(storeTourStatus(status)).toBe(true);
      expect(hasStartedTour()).toBe(true);
    }
    expect([...stored.keys()]).toEqual([TOUR_STORAGE_KEY]);
  });
  it('recovers from corrupt and unavailable storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => '{bad',
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(hasStartedTour()).toBe(false);
    expect(storeTourStatus('skipped')).toBe(false);
  });
  it('derives a complete ordered inventory with unique IDs', () => {
    vi.stubGlobal('navigator', { platform: 'Linux' });
    const steps = tourSteps();
    expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length);
    expect(steps).toHaveLength(12);
    expect(steps[0].id).toBe('welcome');
    expect(steps.at(-1)?.view).toBe('inbox');
    expect(steps.find((step) => step.id === 'search')?.tips).toContain('Open search with Ctrl K.');
  });
});
