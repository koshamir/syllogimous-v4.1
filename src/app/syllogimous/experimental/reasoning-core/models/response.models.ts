import {
    InferenceClassification,
    SemanticWorld,
} from "./semantic.models";

export type UserReasoningResponse =
    | { kind: "threeWayInference"; classification: InferenceClassification }
    | { kind: "constructSatisfyingModel"; world: SemanticWorld }
    | { kind: "constructCounterexample"; world: SemanticWorld }
    | { kind: "completeMapping"; pairs: Array<{ source: string; target: string }> }
    | { kind: "identifyMissingRelation"; relation: string }
    | { kind: "repairProof"; premiseIds: string[] }
    | { kind: "identifyNecessaryPremise"; premiseId: string }
    | { kind: "updateAfterPremiseChange"; classification: InferenceClassification };

export type EvidenceRole =
    | "proofOfEntailment"
    | "proofOfRefutation"
    | "counterexampleToEntailment"
    | "satisfyingWitness"
    | "structuralValidation";

export interface ResponseScore {
    correct: boolean;
    evidenceRole?: EvidenceRole;
    conciseFeedbackRu: string;
    detailRu: string[];
    violatedConstraintId?: string;
}
