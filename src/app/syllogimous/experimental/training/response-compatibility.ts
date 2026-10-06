import { ReasoningFamily, ResponseFormat } from "../reasoning-core/models/semantic.models";

/** Reviewed generator/response pairs. Requests outside this table never reach a generator. */
export const RESPONSE_COMPATIBILITY: Readonly<Record<ReasoningFamily, readonly ResponseFormat[]>> = {
    categorical: ["threeWayInference", "constructSatisfyingModel", "constructCounterexample", "identifyMissingRelation", "repairProof", "identifyNecessaryPremise", "updateAfterPremiseChange"],
    order: ["threeWayInference", "constructSatisfyingModel", "constructCounterexample"],
    hierarchy: ["threeWayInference", "constructSatisfyingModel", "constructCounterexample"],
    analogy: ["threeWayInference", "completeMapping", "identifyMissingRelation"],
    coupledFrames: ["threeWayInference", "repairProof", "identifyNecessaryPremise", "updateAfterPremiseChange"],
    proportional: ["threeWayInference"],
    temporalIntervals: ["threeWayInference", "constructSatisfyingModel", "constructCounterexample"],
    contextScope: ["threeWayInference", "constructSatisfyingModel", "constructCounterexample"],
    graphStructure: ["threeWayInference", "completeMapping"],
    transformations: ["threeWayInference"],
};

export function responseFormatSupported(family: ReasoningFamily, format: ResponseFormat): boolean {
    return RESPONSE_COMPATIBILITY[family].includes(format);
}
