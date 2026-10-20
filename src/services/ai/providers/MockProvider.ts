import type { AIModel, AIProvider, AIRequest, AIResponse, ProviderStatus } from '../types';

export const MOCK_PROVIDER_ID = 'mock';

const UNIT_LINE = /^\[([a-z]\d{1,4})\](?: \(low OCR confidence\))? (.+)$/;

/**
 * Demo / Mock AI. Deterministic output for previews, demos and tests; it never analyzes the
 * source. With scripted outputs it returns them in order (useful for malformed-response tests);
 * otherwise it turns the first source unit into one draft that clearly says it is a sample.
 */
export class MockProvider implements AIProvider {
  readonly id = MOCK_PROVIDER_ID;
  readonly name = 'Demo / Mock AI';
  readonly kind = 'mock' as const;
  readonly runtime = 'Built-in sample generator';
  readonly requests: AIRequest[] = [];

  constructor(
    private readonly options: { outputs?: string[]; available?: boolean; failWith?: Error } = {},
  ) {}

  async isAvailable(): Promise<ProviderStatus> {
    return this.options.available === false
      ? { available: false, reason: 'Disabled' }
      : { available: true };
  }

  async getModels(): Promise<AIModel[]> {
    return [
      {
        id: 'sample',
        providerId: this.id,
        name: 'Demo / Mock AI',
        capabilities: ['text-generation', 'structured-extraction', 'json-output'],
        estimatedPerformance: { speedClass: 'fast', qualityClass: 'basic' },
        specSource: 'declared',
        accelerators: ['cpu'],
        ready: true,
      },
    ];
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    request.signal.throwIfAborted();
    this.requests.push(request);
    if (this.options.failWith) throw this.options.failWith;
    if (this.options.outputs) {
      const content = this.options.outputs.shift() ?? '{}';
      return { content, truncated: false, elapsedMs: 1 };
    }
    const first = request.user
      .split('\n')
      .map((line) => UNIT_LINE.exec(line))
      .find(Boolean);
    const content = JSON.stringify({
      items: first
        ? [
            {
              type: 'task',
              title: {
                evidence: [first[1]],
                value: first[2].slice(0, 80),
                confidence: 'needs_review',
              },
              date: null,
              time: null,
              end_time: null,
              arrival_time: null,
              location: null,
              requirements: [],
              notes: ['Demo / Mock AI sample, not an AI analysis.'],
              reminders: [],
            },
          ]
        : [],
      ambiguities: [],
    });
    return { content, truncated: false, elapsedMs: 1 };
  }
}
