import {
    ComplexityTarget,
    EntitySpec,
    GenerationRequest,
    InferenceClassification,
    PremiseNode,
    QueryNode,
    ResponseSpec,
} from "../models/semantic.models";

export interface GenerationControl {
    now: () => number;
    isCancelled: () => boolean;
}

export const DEFAULT_GENERATION_CONTROL: GenerationControl = {
    now: () => typeof performance === "undefined" ? Date.now() : performance.now(),
    isCancelled: () => false,
};

export function generationBudgetFailure(
    request: GenerationRequest,
    startedAt: number,
    control: GenerationControl,
    attempts: number,
) {
    const elapsedMs = control.now() - startedAt;
    if (control.isCancelled()) {
        return {
            ok: false as const,
            code: "cancelled" as const,
            messageRu: "Подготовка задания отменена: настройки или сессия изменились.",
            attempts,
            elapsedMs,
            recoverable: true,
        };
    }
    if (elapsedMs >= request.wallTimeBudgetMs) {
        return {
            ok: false as const,
            code: "timeout" as const,
            messageRu: "Задание не успело подготовиться. Можно повторить попытку или выбрать другую структуру.",
            attempts,
            elapsedMs,
            recoverable: true,
        };
    }
    return undefined;
}

export function responseSpecFor(
    target: ComplexityTarget,
    entities: readonly EntitySpec[],
    premises: readonly PremiseNode[],
    classification: InferenceClassification,
    missingRelation?: { expectedRelation: string; choices: readonly string[] },
): ResponseSpec {
    switch (target.responseFormat) {
        case "threeWayInference":
            return { kind: "threeWayInference", choices: ["entailed", "refuted", "underdetermined"] };
        case "constructSatisfyingModel":
            return { kind: "constructSatisfyingModel", editableEntityIds: entities.map(entity => entity.id) };
        case "constructCounterexample":
            if (classification === "entailed") {
                throw new Error("An entailed query cannot have a counterexample");
            }
            return { kind: "constructCounterexample", editableEntityIds: entities.map(entity => entity.id) };
        case "completeMapping": {
            const sourceIds = entities.filter(entity => entity.features?.["frame"] === "source").map(entity => entity.id);
            const targetIds = entities.filter(entity => entity.features?.["frame"] === "target").map(entity => entity.id);
            return { kind: "completeMapping", sourceIds, targetIds, contract: "bijection" };
        }
        case "identifyMissingRelation":
            if (!missingRelation || !missingRelation.choices.includes(missingRelation.expectedRelation)) {
                throw new Error("A missing-relation response needs a verifier-derived expected relation among its choices");
            }
            return {
                kind: "identifyMissingRelation",
                choices: [...missingRelation.choices],
                expectedRelation: missingRelation.expectedRelation,
            };
        case "repairProof":
            return { kind: "repairProof", candidatePremiseIds: premises.map(premise => premise.id) };
        case "identifyNecessaryPremise":
            return { kind: "identifyNecessaryPremise", candidatePremiseIds: premises.map(premise => premise.id) };
        case "updateAfterPremiseChange":
            return {
                kind: "updateAfterPremiseChange",
                changePremiseId: premises[premises.length - 1]?.id ?? "",
                choices: ["entailed", "refuted", "underdetermined"],
            };
    }
}

export function targetAllowsPremiseCount(target: ComplexityTarget, count: number): boolean {
    return count >= target.displayedPremises.min && count <= target.displayedPremises.max;
}

export function queryKey(query: QueryNode): string {
    return JSON.stringify(query);
}
