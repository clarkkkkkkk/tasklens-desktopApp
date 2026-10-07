import { actionSchema } from '../../types/action';
import { buildReminders } from '../reminders/ReminderScheduler';
import type { ExtractionInput, ExtractionOptions, ExtractionService } from './ExtractionService';
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Cancelled', 'AbortError'));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
/** Deterministic demo fixture. Does not read pixels, run OCR, or call any AI. */
export class MockExtractionService implements ExtractionService {
  readonly mode = 'mock' as const;
  async extract(input: ExtractionInput, { signal, onProgress }: ExtractionOptions) {
    for (let step = 0; step < 3; step++) {
      onProgress(step);
      await delay(650, signal);
    }
    const now = new Date().toISOString();
    return [
      actionSchema.parse({
        id: crypto.randomUUID(),
        type: 'event',
        title: 'Pictorial',
        date: '2026-10-08',
        arrivalTime: '13:30',
        location: 'Campus',
        requirements: ['Wear black pants', 'No jeans'],
        notes: [
          'Exact pictorial time is still unconfirmed.',
          'Further information may be announced later.',
        ],
        confidence: {
          overall: 'needs_review',
          date: 'inferred',
          time: 'needs_review',
          location: 'inferred',
          requirements: 'inferred',
        },
        reminders: buildReminders('2026-10-08', '13:30', ['night', 'hour', 'quarter']),
        source: { ...input, extractionMode: 'mock' },
        status: 'needs_review',
        createdAt: now,
        updatedAt: now,
      }),
    ];
  }
}
