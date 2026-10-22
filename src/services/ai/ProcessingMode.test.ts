import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProcessingMode } from './ProcessingMode';
import { groqConnection, disconnectedGroq, type GroqStatus } from './providers/GroqProvider';
import type { ExtractionInput, ExtractionOptions } from '../extraction/ExtractionService';
import { withProcessingMode } from '../../app/services';
import { defaultSettings } from '../../types/action';
import { migrateSnapshot } from '../../repositories/migrations';
import { rebaseSettings } from '../../features/settings/settingsPatch';

afterEach(() => vi.restoreAllMocks());
function fixture(connectivity: GroqStatus['connectivity'] = 'online') {
  let status: GroqStatus = {
    ...disconnectedGroq,
    connectivity,
    connected: true,
    verified: true,
    consent: true,
  };
  vi.spyOn(groqConnection, 'status').mockImplementation(async () => ({ ...status }));
  const configure = vi
    .spyOn(groqConnection, 'configure')
    .mockImplementation(async (enabled, _consent, resume) => {
      status = { ...status, enabled, resumeRequired: resume ? false : status.resumeRequired };
      return { ...status };
    });
  return {
    mode: new ProcessingMode(),
    configure,
    set: (patch: Partial<GroqStatus>) => {
      status = { ...status, ...patch };
    },
  };
}
describe('processing mode isolation', () => {
  it('uses Local for unknown connectivity even with an intentionally saved Groq preference', async () => {
    const { mode } = fixture('unknown');
    await mode.sync('groq');
    expect(mode.getSnapshot()).toMatchObject({ preferredMode: 'groq', effectiveMode: 'local' });
  });
  it('never clears the loss latch on restored connectivity or unrelated preference synchronization', async () => {
    const { mode, set, configure } = fixture();
    await mode.sync('groq');
    expect(mode.getSnapshot().effectiveMode).toBe('groq');
    set({ connectivity: 'offline', enabled: false, resumeRequired: true });
    await mode.refresh();
    set({ connectivity: 'online' });
    await mode.sync('groq');
    expect(mode.getSnapshot().effectiveMode).toBe('local');
    expect(configure.mock.calls.at(-1)).toEqual([false, false, false]);
    await mode.sync('groq', true);
    expect(mode.getSnapshot().effectiveMode).toBe('groq');
  });
  it('aborts a running provider without accepting late results or resubmitting locally', async () => {
    const { mode } = fixture();
    await mode.sync('groq');
    let resolve!: () => void;
    const original = vi.fn(async (_input: ExtractionInput, _options: ExtractionOptions) => {
      expect(_input.type).toBe('text');
      expect(_options.signal.aborted).toBe(false);
      await new Promise<void>((r) => {
        resolve = r;
      });
      return { actions: [], ambiguities: [] };
    });
    const extraction = withProcessingMode({ mode: 'routed', extract: original }, mode);
    const result = extraction.extract(
      { type: 'text', text: 'retained source' },
      { signal: new AbortController().signal, onProgress: () => {} },
    );
    const rejected = expect(result).rejects.toMatchObject({ code: 'CANCELLED' });
    await mode.sync('local');
    resolve();
    await rejected;
    expect(original).toHaveBeenCalledTimes(1);
    expect(original.mock.calls[0]?.[1]?.signal.aborted).toBe(true);
  });
  it('fresh profiles need a choice, legacy profiles preserve their configured mode', () => {
    expect(defaultSettings.ai.modeChoiceCompleted).toBe(false);
    const settings = JSON.parse(JSON.stringify(defaultSettings));
    delete settings.ai.modeChoiceCompleted;
    settings.ai.executionMode = 'groq';
    const legacy = migrateSnapshot({ version: 1, actions: [], settings }).snapshot;
    expect(legacy.settings.ai).toMatchObject({ executionMode: 'groq', modeChoiceCompleted: true });
    expect(
      migrateSnapshot({ version: 1, actions: [], settings: defaultSettings }).snapshot.settings.ai
        .modeChoiceCompleted,
    ).toBe(false);
  });
  it('rebases only changed preference fields so concurrent changes survive', () => {
    const next = { ...defaultSettings, ai: { ...defaultSettings.ai, priority: 'speed' as const } };
    const current = {
      ...defaultSettings,
      remindersEnabled: false,
      ai: { ...defaultSettings.ai, executionMode: 'groq' as const },
    };
    expect(rebaseSettings(defaultSettings, next, current)).toMatchObject({
      remindersEnabled: false,
      ai: { executionMode: 'groq', priority: 'speed' },
    });
  });
});

it('ignores a status query completed before a newer loss notification', async () => {
  const { mode, set } = fixture();
  await mode.sync('groq');
  const stale = { ...mode.getSnapshot().connection };
  let resolve!: (status: GroqStatus) => void;
  vi.spyOn(groqConnection, 'status').mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const old = mode.refresh();
  set({ enabled: false, resumeRequired: true, connectivity: 'offline' });
  await mode.refresh();
  resolve(stale);
  await old;
  expect(mode.getSnapshot()).toMatchObject({
    effectiveMode: 'local',
    connection: { resumeRequired: true },
  });
});
