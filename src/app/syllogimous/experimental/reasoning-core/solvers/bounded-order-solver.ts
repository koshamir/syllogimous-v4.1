import {
    AtomicQuery,
    DomainSpec,
    EntityId,
    InferenceClassification,
    OrderPremise,
    PositionWorld,
} from "../models/semantic.models";
import {
    evaluateOrderAtom,
    positionWorldSatisfiesOrderPremises,
    validateOrderAtom,
    validatePositionDomain,
} from "../semantics/order";

export interface PositionEnumerationOptions {
    /** Hard cap checked before enumeration, so a rejected search does no partial inference. */
    maxAssignments: number;
}

export type PositionEnumerationResult =
    | {
        ok: true;
        worlds: PositionWorld[];
        exploredAssignments: number;
        complete: true;
    }
    | {
        ok: false;
        code: "invalidProblem" | "searchBudgetExceeded";
        message: string;
        requiredAssignments: number;
    };

export type BoundedOrderClassificationResult =
    | {
        ok: true;
        classification: InferenceClassification;
        premisesSatisfiable: true;
        modelCount: number;
        exploredAssignments: number;
        queryWitness?: PositionWorld;
        negatedQueryWitness?: PositionWorld;
        solverCompleteness: "boundedComplete";
        finiteDomainAssumption: string;
    }
    | {
        ok: false;
        code: "invalidProblem" | "searchBudgetExceeded" | "inconsistentPremises";
        message: string;
        exploredAssignments: number;
    };

const DEFAULT_ENUMERATION_OPTIONS: PositionEnumerationOptions = { maxAssignments: 50_000 };

function assignmentCount(size: number, entities: number, allowCoincidence: boolean): number {
    if (allowCoincidence) {
        const count = size ** entities;
        return Number.isSafeInteger(count) ? count : Number.POSITIVE_INFINITY;
    }
    if (entities > size) return 0;
    let count = 1;
    for (let index = 0; index < entities; index++) {
        count *= size - index;
        if (!Number.isSafeInteger(count)) return Number.POSITIVE_INFINITY;
    }
    return count;
}

function uniqueEntityError(entityIds: readonly EntityId[]): string | null {
    if (!entityIds.length) return "At least one positioned entity is required";
    if (new Set(entityIds).size !== entityIds.length) return "Position entity IDs must be unique";
    return null;
}

/**
 * Enumerates all labelled arrangements in deterministic lexicographic order.
 * These worlds are linear extensions of the supplied constraints; unforced
 * comparisons therefore remain visible instead of being read from one hidden
 * total order.
 */
export function enumeratePositionWorlds(
    entityIds: readonly EntityId[],
    premises: readonly OrderPremise[],
    domain: Extract<DomainSpec, { kind: "boundedPositions" }>,
    options: PositionEnumerationOptions = DEFAULT_ENUMERATION_OPTIONS,
): PositionEnumerationResult {
    const domainError = validatePositionDomain(domain);
    const entityError = uniqueEntityError(entityIds);
    if (domainError || entityError || !Number.isSafeInteger(options.maxAssignments) || options.maxAssignments < 1) {
        return {
            ok: false,
            code: "invalidProblem",
            message: domainError ?? entityError ?? "The position search budget must be a positive safe integer",
            requiredAssignments: 0,
        };
    }
    for (const premise of premises) {
        const error = validateOrderAtom(premise, entityIds, domain);
        if (error) {
            return { ok: false, code: "invalidProblem", message: error.message, requiredAssignments: 0 };
        }
    }
    const requiredAssignments = assignmentCount(domain.size, entityIds.length, domain.allowCoincidence);
    if (requiredAssignments > options.maxAssignments) {
        return {
            ok: false,
            code: "searchBudgetExceeded",
            message: `Exact order enumeration needs ${requiredAssignments} assignments but the budget is ${options.maxAssignments}`,
            requiredAssignments,
        };
    }

    const worlds: PositionWorld[] = [];
    const values = new Array<number>(entityIds.length).fill(0);
    let exploredAssignments = 0;
    const enumerate = (entityIndex: number): void => {
        if (entityIndex === entityIds.length) {
            exploredAssignments++;
            const world: PositionWorld = {
                kind: "positionWorld",
                positions: entityIds.map((entityId, index) => ({ entityId, value: values[index] })),
            };
            if (positionWorldSatisfiesOrderPremises(world, premises, entityIds, domain)) {
                worlds.push(world);
            }
            return;
        }
        for (let position = 0; position < domain.size; position++) {
            if (!domain.allowCoincidence && values.slice(0, entityIndex).includes(position)) continue;
            values[entityIndex] = position;
            enumerate(entityIndex + 1);
        }
    };
    enumerate(0);
    return { ok: true, worlds, exploredAssignments, complete: true };
}

export function classifyBoundedOrder(
    entityIds: readonly EntityId[],
    premises: readonly OrderPremise[],
    query: Extract<AtomicQuery, { kind: "order" }>,
    domain: Extract<DomainSpec, { kind: "boundedPositions" }>,
    options: PositionEnumerationOptions = DEFAULT_ENUMERATION_OPTIONS,
): BoundedOrderClassificationResult {
    const queryError = validateOrderAtom(query, entityIds, domain);
    if (queryError) {
        return { ok: false, code: "invalidProblem", message: queryError.message, exploredAssignments: 0 };
    }
    const enumeration = enumeratePositionWorlds(entityIds, premises, domain, options);
    if (!enumeration.ok) {
        return {
            ok: false,
            code: enumeration.code,
            message: enumeration.message,
            exploredAssignments: 0,
        };
    }
    if (!enumeration.worlds.length) {
        return {
            ok: false,
            code: "inconsistentPremises",
            message: "No position world satisfies every premise",
            exploredAssignments: enumeration.exploredAssignments,
        };
    }
    let queryWitness: PositionWorld | undefined;
    let negatedQueryWitness: PositionWorld | undefined;
    for (const world of enumeration.worlds) {
        const evaluation = evaluateOrderAtom(query, world, entityIds, domain);
        if (!evaluation.ok) {
            return {
                ok: false,
                code: "invalidProblem",
                message: evaluation.message,
                exploredAssignments: enumeration.exploredAssignments,
            };
        }
        if (evaluation.holds && !queryWitness) queryWitness = world;
        if (!evaluation.holds && !negatedQueryWitness) negatedQueryWitness = world;
    }
    const classification: InferenceClassification = queryWitness && negatedQueryWitness
        ? "underdetermined"
        : queryWitness
            ? "entailed"
            : "refuted";
    return {
        ok: true,
        classification,
        premisesSatisfiable: true,
        modelCount: enumeration.worlds.length,
        exploredAssignments: enumeration.exploredAssignments,
        queryWitness,
        negatedQueryWitness,
        solverCompleteness: "boundedComplete",
        finiteDomainAssumption: `All entities occupy slots 0..${domain.size - 1}; closure is the declared finite position domain.`,
    };
}
