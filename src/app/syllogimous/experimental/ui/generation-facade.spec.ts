import { DEFAULT_SEMANTICS_VERSION } from "../reasoning-core/models/versions";
import { GenerationRequest, GenerationResult } from "../reasoning-core/models/semantic.models";
import { WorkerBackedGenerationFacade } from "./generation-facade";

class FakeWorker {
    onmessage: ((event: MessageEvent<{ requestId: string; result: GenerationResult }>) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    terminated = false;
    postMessage(_message: { requestId: string; request: GenerationRequest }): void {}
    terminate(): void { this.terminated = true; }
}

function request(): GenerationRequest {
    return {
        requestId: "request-1", seed: "seed-1", family: "categorical", partition: "training",
        semanticsVersion: DEFAULT_SEMANTICS_VERSION, maxAttempts: 8, wallTimeBudgetMs: 20,
        target: { level: 1, primaryDimension: "supportSize", displayedPremises: { min: 2, max: 4 }, responseFormat: "threeWayInference", memoryVisibility: "visible", distractorCount: 0, timePressure: "none" },
    };
}

describe("WorkerBackedGenerationFacade", () => {
    it("terminates an active worker and resolves typed cancellation", async () => {
        const worker = new FakeWorker();
        let now = 10;
        const facade = new WorkerBackedGenerationFacade(() => worker as unknown as Worker, () => now, 100);
        const promise = facade.generate(request());
        now = 15;
        facade.cancel("request-1");
        const result = await promise;
        expect(result.ok).toBeFalse();
        if (!result.ok) expect(result.code).toBe("cancelled");
        expect(worker.terminated).toBeTrue();
    });

    it("accepts a matching response and terminates its worker", async () => {
        const worker = new FakeWorker();
        const facade = new WorkerBackedGenerationFacade(() => worker as unknown as Worker, () => 10, 100);
        const promise = facade.generate(request());
        const failure: GenerationResult = { ok: false, code: "targetMismatch", messageRu: "Проверяемая ошибка.", attempts: 1, elapsedMs: 1, recoverable: true };
        worker.onmessage?.({ data: { requestId: "request-1", result: failure } } as MessageEvent<{ requestId: string; result: GenerationResult }>);
        expect(await promise).toEqual(failure);
        expect(worker.terminated).toBeTrue();
    });

    it("fails recoverably instead of running an expensive solver on the UI thread", async () => {
        const facade = new WorkerBackedGenerationFacade(() => null, () => performance.now(), 100);
        const result = await facade.generate(request());
        expect(result.ok).toBeFalse();
        if (!result.ok) { expect(result.recoverable).toBeTrue(); expect(result.messageRu).toContain("Рабочий поток"); }
    });
    it("terminates an overdue worker and resolves a typed timeout", async () => {
        const worker = new FakeWorker();
        const facade = new WorkerBackedGenerationFacade(() => worker as unknown as Worker, () => 100, 0);
        const result = await facade.generate({ ...request(), wallTimeBudgetMs: 1 });
        expect(result.ok).toBeFalse();
        if (!result.ok) expect(result.code).toBe("timeout");
        expect(worker.terminated).toBeTrue();
    });
});
