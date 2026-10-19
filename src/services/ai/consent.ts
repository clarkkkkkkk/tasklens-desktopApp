import type { RouteDecision, ScoredCandidate } from './router';

export type ConsentRequest =
  | {
      kind: 'cloud';
      decision: RouteDecision;
      candidate: ScoredCandidate;
      /** Best local option, offered instead of uploading. */
      alternative?: ScoredCandidate;
    }
  | {
      kind: 'fallback';
      decision: RouteDecision;
      failed: ScoredCandidate;
      /** User-presentable failure, without source content. */
      error: string;
      alternative: ScoredCandidate;
    };

/** `approve`: use the proposed candidate. `alternative`: use the offered local option. */
export type ConsentAnswer = 'approve' | 'alternative' | 'cancel';

export interface PendingConsent {
  id: number;
  request: ConsentRequest;
}

/**
 * Asks the user before source material is uploaded or a different provider is used. With no
 * listening UI the answer is always a decline, so nothing is ever uploaded by default.
 */
export class ConsentBroker {
  private listeners = new Set<(pending: PendingConsent | null) => void>();
  private pending: (PendingConsent & { resolve: (answer: ConsentAnswer) => void }) | null = null;
  private nextId = 1;

  request(request: ConsentRequest, signal: AbortSignal): Promise<ConsentAnswer> {
    if (signal.aborted) return Promise.resolve('cancel');
    if (!this.listeners.size)
      return Promise.resolve(
        request.kind === 'cloud' && request.alternative ? 'alternative' : 'cancel',
      );
    this.settle('cancel');
    return new Promise((resolve) => {
      const id = this.nextId++;
      const abort = () => {
        if (this.pending?.id === id) this.settle('cancel');
      };
      signal.addEventListener('abort', abort, { once: true });
      this.pending = {
        id,
        request,
        resolve: (answer) => {
          signal.removeEventListener('abort', abort);
          resolve(answer);
        },
      };
      this.emit();
    });
  }

  respond(id: number, answer: ConsentAnswer) {
    if (this.pending?.id === id) this.settle(answer);
  }

  current(): PendingConsent | null {
    return this.pending && { id: this.pending.id, request: this.pending.request };
  }

  subscribe(listener: (pending: PendingConsent | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.current());
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) this.settle('cancel');
    };
  }

  private settle(answer: ConsentAnswer) {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    pending.resolve(answer);
    this.emit();
  }

  private emit() {
    const current = this.current();
    for (const listener of this.listeners) listener(current);
  }
}
