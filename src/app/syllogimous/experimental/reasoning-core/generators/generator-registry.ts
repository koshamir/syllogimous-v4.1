import {
    GenerationRequest,
    GenerationResult,
    ReasoningFamily,
} from "../models/semantic.models";
import { SUPPORTED_SEMANTICS } from "../models/versions";
import { generateAnalogyItem } from "./analogy-generator";
import { generateCategoricalItem } from "./categorical-generator";
import { generateCoupledFrameItem } from "./coupled-frame-generator";
import { GenerationControl } from "./generator-utils";
import { generateGraphItem } from "./graph-generator";
import { generateHierarchyItem } from "./hierarchy-generator";
import { generateOrderItem } from "./order-generator";
import { generateProportionalItem } from "./proportional-generator";
import { generateScopeItem } from "./scope-generator";
import { generateTemporalIntervalItem } from "./temporal-interval-generator";
import { generateTransformationItem } from "./transformation-generator";

/** Stable order used by settings, audits and protocol manifests. */
export const CORE_REASONING_FAMILIES: readonly ReasoningFamily[] = [
    "categorical",
    "order",
    "hierarchy",
    "analogy",
    "coupledFrames",
    "proportional",
    "temporalIntervals",
    "contextScope",
    "graphStructure",
    "transformations",
];

function invalidRequest(messageRu: string): GenerationResult {
    return {
        ok: false,
        code: "unsupportedTarget",
        messageRu,
        attempts: 0,
        elapsedMs: 0,
        recoverable: true,
    };
}

function validateRequest(request: GenerationRequest): GenerationResult | undefined {
    if (!Object.prototype.hasOwnProperty.call(SUPPORTED_SEMANTICS, request.semanticsVersion)) {
        return invalidRequest("Выбранная версия логической семантики не поддерживается.");
    }
    if (!Number.isInteger(request.maxAttempts) || request.maxAttempts < 1 || request.maxAttempts > 64) {
        return invalidRequest("Число попыток генерации должно быть целым от 1 до 64.");
    }
    if (!Number.isFinite(request.wallTimeBudgetMs)
        || request.wallTimeBudgetMs < 1
        || request.wallTimeBudgetMs > 10_000) {
        return invalidRequest("Допустимый бюджет подготовки задания — от 1 до 10 000 мс.");
    }
    if (!Number.isInteger(request.target.level) || request.target.level < 1 || request.target.level > 5
        || !Number.isInteger(request.target.distractorCount) || request.target.distractorCount < 0 || request.target.distractorCount > 8) {
        return invalidRequest("Уровень должен быть от 1 до 5, а число отвлекающих посылок — от 0 до 8.");
    }
    if (!Number.isInteger(request.target.displayedPremises.min) || !Number.isInteger(request.target.displayedPremises.max)
        || request.target.displayedPremises.min < 0
        || request.target.displayedPremises.max < request.target.displayedPremises.min
        || request.target.displayedPremises.max > 12) {
        return invalidRequest("Диапазон числа посылок задан неверно.");
    }
    if (Object.values(request.target.metricBounds ?? {}).some(bound => !bound
        || !Number.isFinite(bound.min) || !Number.isFinite(bound.max) || bound.min < 0 || bound.max < bound.min)) {
        return invalidRequest("Границы целевых измерений сложности заданы неверно.");
    }
    return undefined;
}

/**
 * Pure deterministic dispatch boundary. It has no Angular, DOM, storage or
 * worker dependency and is therefore also used by CLI audits and tests.
 */
export function generateReasoningItem(
    request: GenerationRequest,
    control?: GenerationControl,
): GenerationResult {
    const validationFailure = validateRequest(request);
    if (validationFailure) return validationFailure;
    const generated = dispatch(request, control);
    if (!generated.ok) return generated;
    const measured = generated.item.measuredComplexity;
    const metrics: Record<GenerationRequest["target"]["primaryDimension"], number | null> = {
        supportSize: measured.minimalSupportSize, branching: measured.branchingCount,
        scopeDepth: measured.maxScopeNesting, bindingInterference: measured.bindingInterference,
        liveFrontier: measured.estimatedLiveFrontier, transformComposition: measured.transformationComposition,
        crossFrameBridges: measured.crossFrameBridgeCount,
    };
    for (const dimension of Object.keys(request.target.metricBounds ?? {}) as Array<keyof typeof metrics>) {
        const bound = request.target.metricBounds![dimension]!;
        const value = metrics[dimension];
        if (value === null || value < bound.min || value > bound.max) return {
            ok: false, code: "targetMismatch", messageRu: "Проверенное задание не удовлетворяет заданным границам сложности. Цель не была упрощена автоматически.",
            attempts: generated.item.provenance.attempt, elapsedMs: generated.item.provenance.elapsedMs, recoverable: true,
        };
    }
    return generated;
}

function dispatch(request: GenerationRequest, control?: GenerationControl): GenerationResult {
    switch (request.family) {
        case "categorical":
            return generateCategoricalItem(request, control);
        case "order":
            return generateOrderItem(request, control);
        case "hierarchy":
            return generateHierarchyItem(request, control);
        case "analogy":
            return generateAnalogyItem(request, control);
        case "coupledFrames":
            return generateCoupledFrameItem(request, control);
        case "proportional":
            return generateProportionalItem(request, control);
        case "temporalIntervals":
            return generateTemporalIntervalItem(request, control);
        case "contextScope":
            return generateScopeItem(request, control);
        case "graphStructure":
            return generateGraphItem(request, control);
        case "transformations":
            return generateTransformationItem(request, control);
        default:
            return invalidRequest("Неизвестное семейство отношений.");
    }
}
