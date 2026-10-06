import { GenerationRequest, GenerationResult } from "../reasoning-core/models/semantic.models";
import { DEFAULT_SEMANTICS_VERSION } from "../reasoning-core/models/versions";
import { AsyncGenerationProvider, BoundedPrefetchQueue } from "./prefetch-queue";

class DeferredProvider implements AsyncGenerationProvider {
    cancelled: string[] = [];
    resolvers = new Map<string, (result: GenerationResult) => void>();

    generate(request: GenerationRequest): Promise<GenerationResult> {
        return new Promise(resolve => this.resolvers.set(request.requestId, resolve));
    }

    cancel(requestId: string): void {
        this.cancelled.push(requestId);
    }
}

function request(id: string): GenerationRequest {
    return {
        requestId: id,
        seed: id,
        family: "categorical",
        partition: "training",
        semanticsVersion: DEFAULT_SEMANTICS_VERSION,
        maxAttempts: 4,
        wallTimeBudgetMs: 100,
        target: {
            level: 1,
            primaryDimension: "supportSize",
            displayedPremises: { min: 2, max: 4 },
            responseFormat: "threeWayInference",
            memoryVisibility: "visible",
            distractorCount: 0,
            timePressure: "none",
        },
    };
}

describe("BoundedPrefetchQueue", () => {
    it("cancels and discards stale generation after settings change", async () => {
        const provider = new DeferredProvider();
        const queue = new BoundedPrefetchQueue(provider, 2);
        queue.startSession("session-1");
        const pending = queue.prefetch(request("old"));
        queue.invalidateForSettingsChange();
        expect(provider.cancelled).toEqual(["old"]);
        provider.resolvers.get("old")!({
            ok: false,
            code: "cancelled",
            messageRu: "Отменено.",
            attempts: 0,
            elapsedMs: 1,
            recoverable: true,
        });
        expect((await pending).kind).toBe("discarded");
        expect(queue.sizes).toEqual({ ready: 0, pending: 0 });
    });

    it("never exceeds the configured queue capacity", async () => {
        const provider = new DeferredProvider();
        const queue = new BoundedPrefetchQueue(provider, 1);
        queue.startSession("session-1");
        const first = queue.prefetch(request("one"));
        const second = await queue.prefetch(request("two"));
        expect(second.kind).toBe("failure");
        provider.resolvers.get("one")!({
            ok: false,
            code: "timeout",
            messageRu: "Время вышло.",
            attempts: 1,
            elapsedMs: 100,
            recoverable: true,
        });
        expect((await first).kind).toBe("failure");
    });
});
