export const CURRENT_ONBOARDING_VERSION = 1;
export const onboardingReleases = [
  { version: 1, steps: ['welcome', 'workflow', 'preferences', 'demo'] as const },
];
export function onboardingSteps(completedVersion: number, replay = false) {
  return onboardingReleases
    .filter((release) => replay || release.version > completedVersion)
    .flatMap((release) => [...release.steps]);
}
export function completedOnboardingVersion(previous: number) {
  return Math.max(previous, CURRENT_ONBOARDING_VERSION);
}
