import { test, expect } from '@playwright/test';
test('browser settings honestly distinguish saved schedules from desktop delivery', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() =>
    localStorage.setItem(
      'tasklens:data:v1',
      JSON.stringify({
        version: 1,
        actions: [],
        settings: {
          onboardingCompletedVersion: 1,
          remindersEnabled: true,
          defaultReminders: ['night', 'hour', 'quarter'],
          theme: 'light',
        },
      }),
    ),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByText('OS notification delivery and background operation require the desktop app.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Activate notifications', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('checkbox', { name: 'Launch at startup (not available yet)' }),
  ).toBeDisabled();
});

test('legacy custom instants stay unapproved until the user saves the displayed reminder', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() =>
    localStorage.setItem(
      'tasklens:data:v1',
      JSON.stringify({
        version: 1,
        settings: {
          onboardingCompletedVersion: 1,
          remindersEnabled: true,
          defaultReminders: ['night'],
          theme: 'light',
        },
        actions: [
          {
            id: 'legacy-custom',
            title: 'Legacy custom schedule',
            type: 'task',
            date: '2030-10-21',
            requirements: [],
            notes: ['Preserve this note'],
            confidence: { overall: 'confirmed', date: 'confirmed' },
            reminders: [
              {
                id: 'requested-1',
                label: 'Custom reminder',
                datetime: '2030-10-20T15:45:00Z',
                enabled: true,
              },
            ],
            source: { type: 'text', text: 'Preserve this source' },
            status: 'confirmed',
            createdAt: '2026-10-20T00:00:00Z',
            updatedAt: '2026-10-20T00:00:00Z',
          },
        ],
      }),
    ),
  );
  await page.reload();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('tasklens:data:v1')!).actions[0].reminders[0]
          .customApproved,
    ),
  ).toBeUndefined();
  await page.getByRole('button', { name: /^All Tasks\b/ }).click();
  await page.getByRole('button', { name: /^Legacy custom schedule/ }).click();
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('tasklens:data:v1')!).actions[0].reminders[0]
            .customApproved,
      ),
    )
    .toBe(true);
  const item = await page.evaluate(
    () => JSON.parse(localStorage.getItem('tasklens:data:v1')!).actions[0],
  );
  expect(item.reminders[0].datetime).toBe('2030-10-20T15:45:00Z');
  expect(item.source.text).toBe('Preserve this source');
  expect(item.notes).toEqual(['Preserve this note']);
});
