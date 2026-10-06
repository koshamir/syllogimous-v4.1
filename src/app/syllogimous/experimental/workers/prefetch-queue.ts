import {
    GenerationRequest,
    GenerationResult,
    ReasoningItem,
} from "../reasoning-core/models/semantic.models";

export interface AsyncGenerationProvider {
    generate(request: GenerationRequest): Promise<GenerationResult>;
    cancel(requestId: string): void;
}

export type QueueEvent =
    | { kind: "ready"; requestId: string; item: ReasoningItem }
    | { kind: "failure"; requestId: string; result: Exclude<GenerationResult, { ok: true }> }
    | { kind: "discarded"; requestId: string };

/** Small bounded queue that discards results from changed settings/retired sessions. */
export class BoundedPrefetchQueue {
    private epoch = 0;
    private sessionId: string | undefined;
    private readonly pending = new Map<string, { epoch: number; sessionId: string }>();
    private readonly ready: ReasoningItem[] = [];

    constructor(
        private readonly provider: AsyncGenerationProvider,
        readonly maximumReadyItems = 3,
    ) {
        if (!Number.isSafeInteger(maximumReadyItems) || maximumReadyItems < 1 || maximumReadyItems > 5) {
            throw new Error("Prefetch queue capacity must be between one and five");
        }
    }

    startSession(sessionId: string): void {
        if (!sessionId) throw new Error("A session ID is required");
        this.retireSession();
        this.sessionId = sessionId;
        this.epoch++;
    }

    async prefetch(request: GenerationRequest): Promise<QueueEvent> {
        if (!this.sessionId) throw new Error("No active generation session");
        if (this.ready.length + this.pending.size >= this.maximumReadyItems) {
            return {
                kind: "failure",
                requestId: request.requestId,
                result: {
                    ok: false,
                    code: "attemptBudgetExceeded",
                    messageRu: "Очередь подготовки уже заполнена.",
                    attempts: 0,
                    elapsedMs: 0,
                    recoverable: true,
                },
            };
        }
        const marker = { epoch: this.epoch, sessionId: this.sessionId };
        this.pending.set(request.requestId, marker);
        const result = await this.provider.generate(request);
        const stillCurrent = this.pending.get(request.requestId);
        this.pending.delete(request.requestId);
        if (!stillCurrent || marker.epoch !== this.epoch || marker.sessionId !== this.sessionId) {
            return { kind: "discarded", requestId: request.requestId };
        }
        if (!result.ok) return { kind: "failure", requestId: request.requestId, result };
        if (this.ready.length >= this.maximumReadyItems) return { kind: "discarded", requestId: request.requestId };
        this.ready.push(result.item);
        return { kind: "ready", requestId: request.requestId, item: result.item };
    }

    take(): ReasoningItem | undefined {
        return this.ready.shift();
    }

    invalidateForSettingsChange(): void {
        this.cancelPending();
        this.ready.splice(0, this.ready.length);
        this.epoch++;
    }

    retireSession(): void {
        this.cancelPending();
        this.ready.splice(0, this.ready.length);
        this.sessionId = undefined;
        this.epoch++;
    }

    get sizes(): { ready: number; pending: number } {
        return { ready: this.ready.length, pending: this.pending.size };
    }

    private cancelPending(): void {
        [...this.pending.keys()].forEach(requestId => this.provider.cancel(requestId));
        this.pending.clear();
    }
}
