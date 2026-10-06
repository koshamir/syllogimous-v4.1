import {
    AtomicQuery,
    DomainSpec,
    EntityId,
    IntervalPremise,
    IntervalWorld,
} from "../models/semantic.models";

export type IntervalAtom = IntervalPremise | Extract<AtomicQuery, { kind: "interval" }>;

export type IntervalSemanticErrorCode =
    | "invalidDomain"
    | "unknownEntity"
    | "invalidWorld";

export type IntervalEvaluationResult =
    | { ok: true; holds: boolean }
    | { ok: false; code: IntervalSemanticErrorCode; message: string };

export function validateIntervalDomain(
    domain: Extract<DomainSpec, { kind: "boundedIntervals" }>,
): string | null {
    if (!Number.isSafeInteger(domain.endpointMin) || !Number.isSafeInteger(domain.endpointMax)) {
        return "Interval bounds must be safe integers";
    }
    if (domain.endpointMax <= domain.endpointMin) {
        return "An interval domain needs at least two ordered endpoint values";
    }
    return null;
}

export function validateIntervalAtom(
    atom: IntervalAtom,
    entityIds: readonly EntityId[],
    domain: Extract<DomainSpec, { kind: "boundedIntervals" }>,
): Exclude<IntervalEvaluationResult, { ok: true }> | null {
    const domainError = validateIntervalDomain(domain);
    if (domainError) return { ok: false, code: "invalidDomain", message: domainError };
    const knownIds = new Set(entityIds);
    if (!knownIds.has(atom.left) || !knownIds.has(atom.right)) {
        return { ok: false, code: "unknownEntity", message: "The interval relation refers to an undeclared interval" };
    }
    return null;
}

interface Endpoints {
    start: number;
    end: number;
}

function endpointsById(
    world: IntervalWorld,
    entityIds: readonly EntityId[],
    domain: Extract<DomainSpec, { kind: "boundedIntervals" }>,
): Map<EntityId, Endpoints> | null {
    if (validateIntervalDomain(domain)) return null;
    const required = new Set(entityIds);
    if (world.intervals.length !== required.size) return null;
    const intervals = new Map<EntityId, Endpoints>();
    for (const interval of world.intervals) {
        if (
            !required.has(interval.entityId)
            || intervals.has(interval.entityId)
            || !Number.isSafeInteger(interval.start)
            || !Number.isSafeInteger(interval.end)
            || interval.start < domain.endpointMin
            || interval.end > domain.endpointMax
            || interval.start >= interval.end
        ) {
            return null;
        }
        intervals.set(interval.entityId, { start: interval.start, end: interval.end });
    }
    return intervals;
}

/**
 * Implements a declared directional subset of Allen interval algebra.
 * `overlaps(left,right)` is directional: left.start < right.start <
 * left.end < right.end. `during`, `starts`, and `finishes` are proper
 * relations; equality has its own operator. Touching endpoints are therefore
 * not silently treated as `before` or as directional `overlaps`.
 */
export function evaluateIntervalAtom(
    atom: IntervalAtom,
    world: IntervalWorld,
    entityIds: readonly EntityId[],
    domain: Extract<DomainSpec, { kind: "boundedIntervals" }>,
): IntervalEvaluationResult {
    const atomError = validateIntervalAtom(atom, entityIds, domain);
    if (atomError) return atomError;
    const intervals = endpointsById(world, entityIds, domain);
    if (!intervals) {
        return { ok: false, code: "invalidWorld", message: "The interval world is incomplete or has invalid endpoints" };
    }
    const left = intervals.get(atom.left)!;
    const right = intervals.get(atom.right)!;
    switch (atom.relation) {
        case "before":
            return { ok: true, holds: left.end < right.start };
        case "after":
            return { ok: true, holds: left.start > right.end };
        case "overlaps":
            return {
                ok: true,
                holds: left.start < right.start && right.start < left.end && left.end < right.end,
            };
        case "during":
            return { ok: true, holds: right.start < left.start && left.end < right.end };
        case "starts":
            return { ok: true, holds: left.start === right.start && left.end < right.end };
        case "finishes":
            return { ok: true, holds: right.start < left.start && left.end === right.end };
        case "equals":
            return { ok: true, holds: left.start === right.start && left.end === right.end };
    }
}

export function intervalWorldSatisfiesPremises(
    world: IntervalWorld,
    premises: readonly IntervalPremise[],
    entityIds: readonly EntityId[],
    domain: Extract<DomainSpec, { kind: "boundedIntervals" }>,
): boolean {
    return premises.every(premise => {
        const evaluation = evaluateIntervalAtom(premise, world, entityIds, domain);
        return evaluation.ok && evaluation.holds;
    });
}
