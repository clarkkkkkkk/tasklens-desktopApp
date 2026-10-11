import { z } from 'zod';
export const transcriptSchema = z
  .object({
    fullText: z.string().trim().min(3).max(100000),
    segments: z
      .array(
        z.object({
          id: z.string().min(1),
          startMs: z.number().nonnegative(),
          endMs: z.number().nonnegative(),
          text: z.string().min(1).max(10000),
        }),
      )
      .min(1)
      .max(3000),
    language: z.string().nullable().optional(),
    durationMs: z.number().positive().max(900000),
    model: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    let previous = 0;
    for (const [index, segment] of value.segments.entries()) {
      if (
        ids.has(segment.id) ||
        segment.startMs < previous ||
        segment.endMs < segment.startMs ||
        segment.endMs > value.durationMs
      )
        ctx.addIssue({
          code: 'custom',
          path: ['segments', index],
          message: 'Invalid transcript timestamps or IDs',
        });
      ids.add(segment.id);
      previous = segment.startMs;
    }
  });
export type TranscriptDocument = z.infer<typeof transcriptSchema>;
export type CaptureStatus =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'finalizing'
  | 'preprocessing'
  | 'transcribing'
  | 'extracting'
  | 'ready_for_review'
  | 'cancelled'
  | 'error';
export interface AudioSource {
  jobId: string;
  fileName?: string;
  capturedAt?: string;
}
export interface VoiceCaptureService {
  readonly available: boolean;
  start(onLevel: (elapsedMs: number, level: number) => void): Promise<AudioSource>;
  stop(source: AudioSource): Promise<void>;
  importFile(file: File, signal: AbortSignal): Promise<AudioSource>;
  cancel(source: AudioSource): Promise<void>;
  guardClose(onRequest: () => void): Promise<() => void>;
}
export interface AudioPreprocessor {
  validateFile(file: Pick<File, 'name' | 'type' | 'size'>): void;
}
export interface SpeechToTextService {
  transcribe(
    source: AudioSource,
    signal: AbortSignal,
    progress: (status: CaptureStatus) => void,
  ): Promise<TranscriptDocument>;
}
export interface ModelStatus {
  kind: 'whisper' | 'extraction';
  name: string;
  status: 'not_installed' | 'validating' | 'ready' | 'loading' | 'error';
  runtimeAvailable: boolean;
  source: string;
}
export interface ModelManager {
  list(): Promise<ModelStatus[]>;
  validate(kind: ModelStatus['kind'], importFile: boolean): Promise<void>;
}
export const audioPreprocessor: AudioPreprocessor = {
  validateFile(file) {
    if (!/\.(wav|mp3|m4a|ogg)$/i.test(file.name))
      throw new Error('Choose WAV, MP3, M4A or OGG/Vorbis audio.');
    if (!file.size || file.size > 100 * 1024 * 1024)
      throw new Error('Choose an audio file up to 100 MB.');
    if (
      file.type &&
      ![
        'audio/wav',
        'audio/x-wav',
        'audio/wave',
        'audio/mpeg',
        'audio/mp3',
        'audio/mp4',
        'audio/x-m4a',
        'audio/ogg',
        'application/ogg',
        'application/octet-stream',
      ].includes(file.type)
    )
      throw new Error('Audio format unsupported.');
  },
};
