import { describe, expect, it } from 'vitest';
import { audioPreprocessor, transcriptSchema } from './types';
import { NativeVoiceCapture, NativeModelManager } from './NativeVoiceServices';
describe('voice boundaries', () => {
  it('validates size, extension and media type before native transfer', () => {
    expect(() =>
      audioPreprocessor.validateFile({ name: 'meeting.mp3', type: 'audio/mpeg', size: 1024 }),
    ).not.toThrow();
    for (const file of [
      { name: 'a.webm', type: 'audio/webm', size: 12 },
      { name: 'a.wav', type: 'image/png', size: 12 },
      { name: 'a.wav', type: 'audio/mpeg', size: 12 },
      { name: 'a.wav', type: 'audio/wav', size: 101 * 1024 * 1024 },
      { name: 'a.wav', type: 'audio/wav', size: 0 },
    ])
      expect(() => audioPreprocessor.validateFile(file)).toThrow();
  });
  it('rejects invalid, duplicated and out-of-range timestamped segments', () => {
    const transcript = {
      fullText: 'Bring your ID',
      segments: [{ id: 's1', startMs: 0, endMs: 1000, text: 'Bring your ID' }],
      durationMs: 1000,
      model: 'whisper-small',
    };
    expect(transcriptSchema.parse(transcript).segments).toHaveLength(1);
    expect(
      transcriptSchema.safeParse({
        ...transcript,
        segments: [...transcript.segments, ...transcript.segments],
      }).success,
    ).toBe(false);
    expect(transcriptSchema.safeParse({ ...transcript, durationMs: 100 }).success).toBe(false);
    expect(transcriptSchema.safeParse({ ...transcript, fullText: ' ' }).success).toBe(false);
  });
  it('does not fake native voice in browser mode', async () => {
    const service = new NativeVoiceCapture();
    expect(service.available).toBe(false);
    await expect(service.start(() => {})).rejects.toThrow('desktop app');
    await expect(new NativeModelManager().list()).resolves.toEqual([]);
  });
});
