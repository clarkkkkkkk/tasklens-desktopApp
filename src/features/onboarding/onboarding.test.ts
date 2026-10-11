import { expect, it } from 'vitest';
import { settingsSchema, defaultSettings } from '../../types/action';
import { completedOnboardingVersion, onboardingSteps } from './onboarding.constants';
import { LocalStorageRepository, STORAGE_KEY } from '../../repositories/LocalStorageRepository';
it('migrates legacy preferences without resetting choices and persists completion', async () => {
  let raw = JSON.stringify({
    version: 1,
    actions: [],
    settings: { remindersEnabled: false, defaultReminders: ['hour'], theme: 'light' },
  });
  const repo = new LocalStorageRepository({
    getItem: () => raw,
    setItem: (key, value) => {
      expect(key).toBe(STORAGE_KEY);
      raw = value;
    },
    removeItem: () => {},
  });
  const before = await repo.load();
  expect(before.settings.onboardingCompletedVersion).toBe(0);
  await repo.saveSettings({ ...before.settings, onboardingCompletedVersion: 1 });
  expect((await repo.load()).settings).toEqual({
    ...before.settings,
    onboardingCompletedVersion: 1,
  });
});
it('selects release steps and never downgrades future completion', () => {
  expect(onboardingSteps(0)).toHaveLength(4);
  expect(onboardingSteps(1)).toEqual([]);
  expect(onboardingSteps(2, true)).toHaveLength(4);
  expect(completedOnboardingVersion(2)).toBe(2);
  expect(completedOnboardingVersion(0)).toBe(1);
  expect(
    settingsSchema.safeParse({ ...defaultSettings, onboardingCompletedVersion: -1 }).success,
  ).toBe(false);
});
