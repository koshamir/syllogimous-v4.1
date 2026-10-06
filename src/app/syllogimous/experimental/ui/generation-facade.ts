import { InjectionToken } from "@angular/core";
import { GenerationRequest, GenerationResult, ReasoningFamily } from "../reasoning-core/models/semantic.models";
import { CORE_REASONING_FAMILIES } from "../reasoning-core/generators/generator-registry";
import { responseFormatSupported } from "../training/response-compatibility";

export interface GenerationFacade {
    generate(request: GenerationRequest): Promise<GenerationResult>;
    cancel(requestId: string): void;
    supportedFamilies(): readonly ReasoningFamily[];
}

export const GENERATION_FACADE = new InjectionToken<GenerationFacade>("GENERATION_FACADE");

interface WorkerGenerationResponse {
    requestId: string;
    result: GenerationResult;
}

interface PendingGeneration {
    resolve: (result: GenerationResult) => void;
    startedAt: number;
    worker: Worker | null;
    timeoutId: ReturnType<typeof setTimeout>;
}

export type GenerationWorkerFactory = () => Worker | null;

function defaultWorkerFactory(): Worker | null {
    if (typeof Worker === "undefined") return null;
    try {
        return new Worker(new URL("./generation.worker", import.meta.url), { type: "module", name: "syllogimous-generation" });
    } catch {
        return null;
    }
}

/**
 * A dedicated worker per request makes cancellation effective even while a
 * synchronous solver is busy: cancel and host timeout terminate the worker.
 * Browsers without Worker receive a recoverable failure: expensive solvers
 * are never run on the UI thread.
 */
export class WorkerBackedGenerationFacade implements GenerationFacade {
    private readonly pending = new Map<string, PendingGeneration>();

    constructor(
        private readonly workerFactory: GenerationWorkerFactory = defaultWorkerFactory,
        private readonly now: () => number = () => performance.now(),
        private readonly hostTimeoutSlackMs = 100,
    ) {}

    supportedFamilies(): readonly ReasoningFamily[] { return CORE_REASONING_FAMILIES; }

    generate(request: GenerationRequest): Promise<GenerationResult> {
        this.cancel(request.requestId);
        if (!responseFormatSupported(request.family, request.target.responseFormat)) {
            return Promise.resolve({
                ok: false,
                code: "unsupportedTarget",
                messageRu: "Выбранный формат ответа не поддерживается этим направлением.",
                attempts: 0,
                elapsedMs: 0,
                recoverable: true,
            });
        }
        const startedAt = this.now();
        return new Promise(resolve => {
            const worker = this.workerFactory();
            const timeoutId = setTimeout(
                () => this.finish(request.requestId, this.timeoutResult(startedAt), true),
                request.wallTimeBudgetMs + this.hostTimeoutSlackMs,
            );
            const pending: PendingGeneration = { resolve, startedAt, worker, timeoutId };
            this.pending.set(request.requestId, pending);
            if (!worker) {
                this.finish(request.requestId, this.workerUnavailableResult(startedAt), true);
                return;
            }
            worker.onmessage = (event: MessageEvent<WorkerGenerationResponse>) => {
                if (event.data.requestId === request.requestId) this.finish(request.requestId, event.data.result, true);
            };
            worker.onerror = () => {
                const current = this.pending.get(request.requestId);
                if (!current) return;
                current.worker?.terminate();
                current.worker = null;
                this.finish(request.requestId, this.workerUnavailableResult(startedAt), true);
            };
            worker.postMessage({ requestId: request.requestId, request });
        });
    }

    cancel(requestId: string): void {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.finish(requestId, {
            ok: false,
            code: "cancelled",
            messageRu: "Подготовка задания отменена после изменения сессии или настроек.",
            attempts: 0,
            elapsedMs: Math.max(0, this.now() - pending.startedAt),
            recoverable: true,
        }, true);
    }

    dispose(): void { [...this.pending.keys()].forEach(requestId => this.cancel(requestId)); }

    private finish(requestId: string, result: GenerationResult, terminateWorker: boolean): void {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.pending.delete(requestId);
        clearTimeout(pending.timeoutId);
        if (terminateWorker) pending.worker?.terminate();
        pending.resolve(result);
    }

    private timeoutResult(startedAt: number): GenerationResult {
        return {
            ok: false,
            code: "timeout",
            messageRu: "Подготовка задания превысила допустимое время и была остановлена. Можно повторить попытку.",
            attempts: 0,
            elapsedMs: Math.max(0, this.now() - startedAt),
            recoverable: true,
        };
    }
    private workerUnavailableResult(startedAt: number): GenerationResult {
        return { ok: false, code: "unsupportedTarget", messageRu: "Рабочий поток браузера недоступен. Подготовка остановлена, чтобы не блокировать интерфейс. Разрешите рабочие потоки или попробуйте другой браузер.", attempts: 0, elapsedMs: Math.max(0, this.now() - startedAt), recoverable: true };
    }
}

export function createGenerationFacade(): GenerationFacade { return new WorkerBackedGenerationFacade(); }
