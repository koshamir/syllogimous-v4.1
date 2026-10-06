import { GenerationRequest, GenerationResult } from "../reasoning-core/models/semantic.models";
import { generateReasoningItem } from "../reasoning-core/generators/generator-registry";

interface WorkerGenerationRequest {
    requestId: string;
    request: GenerationRequest;
}

interface WorkerGenerationResponse {
    requestId: string;
    result: GenerationResult;
}

interface WorkerScope {
    onmessage: ((event: MessageEvent<WorkerGenerationRequest>) => void) | null;
    postMessage(message: WorkerGenerationResponse): void;
}

const workerScope = globalThis as unknown as WorkerScope;

workerScope.onmessage = (event: MessageEvent<WorkerGenerationRequest>) => {
    const { requestId, request } = event.data;
    workerScope.postMessage({ requestId, result: generateReasoningItem(request) });
};
