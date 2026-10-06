import {
    CategoricalPremise,
    ComplexityTarget,
    EntitySpec,
    GenerationRequest,
    ReasoningItem,
} from "../models/semantic.models";
import { DEFAULT_SEMANTICS_VERSION } from "../models/versions";
import { classifyCategorical } from "../solvers/categorical-solver";
import { referenceClassifyCategorical } from "../solvers/reference-categorical-oracle";
import { buildStructuralItem } from "./structural-item-builder";

export interface ControlledItemPair {
    pairVersion: "controlled-branching/1.0.0";
    changedDimension: "branching";
    control: ReasoningItem;
    elevated: ReasoningItem;
    heldConstant: {
        locale: "ru";
        responseFormat: "threeWayInference";
        displayedPremises: number;
        atomicConstraints: number;
        entityCount: number;
        quantifierMultiset: string;
        memoryVisibility: "visible";
        distractorCount: 0;
        timePressure: "none";
    };
}

const ENTITIES: EntitySpec[] = [
    { id: "a", label: "группа «Альфа»", sort: "class" },
    { id: "b", label: "группа «Бета»", sort: "class" },
    { id: "c", label: "группа «Гамма»", sort: "class" },
    { id: "d", label: "группа «Дельта»", sort: "class" },
];

function all(id: string, subject: string, predicate: string): CategoricalPremise {
    return { kind: "categorical", id, quantifier: "all", subject, predicate };
}

const CONTROL_PREMISES: CategoricalPremise[] = [
    all("p1", "a", "b"),
    all("p2", "b", "c"),
    all("p3", "c", "d"),
    all("p4", "d", "a"),
];

const ELEVATED_PREMISES: CategoricalPremise[] = [
    all("p1", "a", "b"),
    all("p2", "a", "c"),
    all("p3", "b", "d"),
    all("p4", "c", "d"),
];

const TARGET: ComplexityTarget = {
    level: 3,
    primaryDimension: "branching",
    displayedPremises: { min: 4, max: 4 },
    responseFormat: "threeWayInference",
    memoryVisibility: "visible",
    distractorCount: 0,
    timePressure: "none",
};

function build(seed: string, structure: string, premises: CategoricalPremise[], queryPredicate: string): ReasoningItem {
    const domain = {
        kind: "categoricalUnary" as const,
        closure: "unrestrictedUnaryPredicates" as const,
        existentialImport: "allNamedClassesNonempty" as const,
        namedClasses: ENTITIES.map(entity => entity.id),
    };
    const query = { kind: "categorical" as const, quantifier: "all" as const, subject: "a", predicate: queryPredicate };
    const solved = classifyCategorical(premises, query, domain);
    if (solved.classification !== "entailed"
        || referenceClassifyCategorical(premises, query, domain) !== "entailed") {
        throw new Error("Контролируемая пара не прошла независимую семантическую проверку.");
    }
    solved.certificate.verification.independentOracleChecked = true;
    const request: GenerationRequest = {
        requestId: `${seed}:${structure}`,
        seed: `${seed}:${structure}`,
        family: "categorical",
        partition: "development",
        target: TARGET,
        semanticsVersion: DEFAULT_SEMANTICS_VERSION,
        maxAttempts: 1,
        wallTimeBudgetMs: 100,
    };
    return buildStructuralItem(request, {
        family: "categorical",
        componentFamilies: ["categorical"],
        structureFamily: `development-controlled-${structure}`,
        domain,
        entities: ENTITIES,
        premises,
        query,
        responseSpec: { kind: "threeWayInference", choices: ["entailed", "refuted", "underdetermined"] },
        semanticCertificate: solved.certificate,
        attempt: 1,
        startedAt: 0,
        now: () => 0,
        scaffolds: ["workspace"],
    });
}

/**
 * Holds surface vocabulary, quantifiers, premise/entity counts, response
 * format, visibility, distractors and timing constant. Only dependency shape
 * changes from a directed cycle to a reconvergent diamond.
 */
export function generateControlledBranchingPair(seed: string): ControlledItemPair {
    const control = build(seed, "cycle", CONTROL_PREMISES, "c");
    const elevated = build(seed, "diamond", ELEVATED_PREMISES, "d");
    return {
        pairVersion: "controlled-branching/1.0.0",
        changedDimension: "branching",
        control,
        elevated,
        heldConstant: {
            locale: "ru",
            responseFormat: "threeWayInference",
            displayedPremises: 4,
            atomicConstraints: 4,
            entityCount: 4,
            quantifierMultiset: "all×4",
            memoryVisibility: "visible",
            distractorCount: 0,
            timePressure: "none",
        },
    };
}
