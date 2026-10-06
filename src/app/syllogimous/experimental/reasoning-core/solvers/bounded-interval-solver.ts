import {
    AtomicQuery,
    DomainSpec,
    EntityId,
    InferenceClassification,
    IntervalPremise,
    IntervalWorld,
} from "../models/semantic.models";
import {
    evaluateIntervalAtom,
    intervalWorldSatisfiesPremises,
    validateIntervalAtom,
    validateIntervalDomain,
} from "../semantics/interval";

export interface IntervalEnumerationOptions {
    /** Hard cap checked before enumeration, so no truncated set is classified. */
    maxAssignments: number;
}

export type IntervalEnumerationResult =
    | { ok: true; worlds: IntervalWorld[]; exploredAssignments: number; complete: true }
    | {
        ok: false;
        code: "invalidProblem" | "searchBudgetExceeded";
        message: string;
        requiredAssignments: number;
    };

export type BoundedIntervalClassificationResult =
    | {
        ok: true;
        classification: InferenceClassification;
        premisesSatisfiable: true;
        modelCount: number;
        exploredAssignments: number;
        queryWitness?: IntervalWorld;
        negatedQueryWitness?: IntervalWorld;
        solverCompleteness: "boundedComplete";
        finiteDomainAssumption: string;
    }
    | {
        ok: false;
        code: "invalidProblem" | "searchBudgetExceeded" | "inconsistentPremises";
        message: string;
        exploredAssignments: number;
    };

interface EndpointPair {
    start: number;
    end: number;
}

const DEFAULT_ENUMERATION_OPTIONS: IntervalEnumerationOptions = { maxAssignments: 50_000 };

function availableIntervals(
    domain: Extract<DomainSpec, { kind: "boundedIntervals" }>,
): EndpointPair[] {
    const intervals: EndpointPair[] = [];
    for (let start = domain.endpointMin; start < domain.endpointMax; start++) {
        for (let end = start + 1; end <= domain.endpointMax; end++) {
            intervals.push({ start, end });
        }
    }
    return intervals;
}

function safePower(base: number, exponent: number): number {
    const count = base ** exponent;
    return Number.isSafeInteger(count) ? count : Number.POSITIVE_INFINITY;
}

function validateEntities(entityIds: readonly EntityId[]): string | null {
    if (!entityIds.length) return "At least one interval entity is required";
    if (new Set(entityIds).size !== entityIds.length) return "Interval entity IDs must be unique";
    return null;
}

/** Enumerates every labelled assignment of valid closed-domain endpoint pairs. */
export function enumerateIntervalWorlds(
    entityIds: readonly EntityId[],
    premises: readonly IntervalPremise[],
    domain: Extract<DomainSpec, { kind: "boundedIntervals" }>,
    options: IntervalEnumerationOptions = DEFAULT_ENUMERATION_OPTIONS,
): IntervalEnumerationResult {
    const domainError = validateIntervalDomain(domain);
    const entityError = validateEntities(entityIds);
    if (domainError || entityError || !Number.isSafeInteger(options.maxAssignments) || options.maxAssignments < 1) {
        return {
            ok: false,
            code: "invalidProblem",
            message: domainError ?? entityError ?? "The interval search budget must be a positive safe integer",
            requiredAssignments: 0,
        };
    }
    for (const premise of premises) {
        const error = validateIntervalAtom(premise, entityIds, domain);
        if (error) return { ok: false, code: "invalidProblem", message: error.message, requiredAssignments: 0 };
    }
    const choices = availableIntervals(domain);
    const requiredAssignments = safePower(choices.length, entityIds.length);
    if (requiredAssignments > options.maxAssignments) {
        return {
            ok: false,
            code: "searchBudgetExceeded",
            message: `Exact interval enumeration needs ${requiredAssignments} assignments but the budget is ${options.maxAssignments}`,
            requiredAssignments,
        };
    }

    const selected = new Array<EndpointPair>(entityIds.length);
    const worlds: IntervalWorld[] = [];
    let exploredAssignments = 0;
    const enumerate = (entityIndex: number): void => {
        if (entityIndex === entityIds.length) {
            exploredAssignments++;
            const world: IntervalWorld = {
                kind: "intervalWorld",
                intervals: entityIds.map((entityId, index) => ({ entityId, ...selected[index] })),
            };
            if (intervalWorldSatisfiesPremises(world, premises, entityIds, domain)) worlds.push(world);
            return;
        }
        for (const interval of choices) {
            selected[entityIndex] = interval;
            enumerate(entityIndex + 1);
        }
    };
    enumerate(0);
    return { ok: true, worlds, exploredAssignments, complete: true };
}

export function classifyBoundedIntervals(
    entityIds: readonly EntityId[],
    premises: readonly IntervalPremise[],
    query: Extract<AtomicQuery, { kind: "interval" }>,
    domain: Extract<DomainSpec, { kind: "boundedIntervals" }>,
    options: IntervalEnumerationOptions = DEFAULT_ENUMERATION_OPTIONS,
): BoundedIntervalClassificationResult {
    const queryError = validateIntervalAtom(query, entityIds, domain);
    if (queryError) {
        return { ok: false, code: "invalidProblem", message: queryError.message, exploredAssignments: 0 };
    }
    const enumeration = enumerateIntervalWorlds(entityIds, premises, domain, options);
    if (!enumeration.ok) {
        return { ok: false, code: enumeration.code, message: enumeration.message, exploredAssignments: 0 };
    }
    if (!enumeration.worlds.length) {
        return {
            ok: false,
            code: "inconsistentPremises",
            message: "No bounded interval world satisfies every premise",
            exploredAssignments: enumeration.exploredAssignments,
        };
    }
    let queryWitness: IntervalWorld | undefined;
    let negatedQueryWitness: IntervalWorld | undefined;
    for (const world of enumeration.worlds) {
        const evaluation = evaluateIntervalAtom(query, world, entityIds, domain);
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
        finiteDomainAssumption: `Endpoints are integers from ${domain.endpointMin} through ${domain.endpointMax}, and start < end.`,
    };
}
