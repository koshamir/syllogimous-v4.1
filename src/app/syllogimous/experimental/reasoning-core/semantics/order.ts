import {
    AtomicQuery,
    DomainSpec,
    EntityId,
    OrderPremise,
    PositionWorld,
} from "../models/semantic.models";

export type OrderAtom = OrderPremise | Extract<AtomicQuery, { kind: "order" }>;

export type OrderSemanticErrorCode =
    | "invalidDomain"
    | "invalidArity"
    | "unknownEntity"
    | "missingDisplacement"
    | "invalidDisplacement"
    | "cyclicRelationInLinearDomain"
    | "invalidWorld";

export type OrderEvaluationResult =
    | { ok: true; holds: boolean }
    | { ok: false; code: OrderSemanticErrorCode; message: string };

export interface CyclicSymmetry {
    /** Number of clockwise slot rotations. Negative values rotate anticlockwise. */
    rotation: number;
    /** Reflection reverses clockwise orientation and must be explicitly allowed. */
    reflect: boolean;
    reflectionAllowed: boolean;
}

export type CyclicWorldTransformResult =
    | { ok: true; world: PositionWorld }
    | { ok: false; code: "invalidDomain" | "reflectionNotAllowed" | "invalidWorld"; message: string };

function expectedArity(atom: OrderAtom): number {
    return atom.relation === "between" ? 3 : 2;
}

export function validatePositionDomain(
    domain: Extract<DomainSpec, { kind: "boundedPositions" }>,
): string | null {
    if (!Number.isSafeInteger(domain.size) || domain.size < 1) {
        return "A bounded position domain needs a positive safe-integer size";
    }
    if (domain.cyclic && domain.size < 2) {
        return "A cyclic position domain needs at least two slots";
    }
    return null;
}

export function validateOrderAtom(
    atom: OrderAtom,
    entityIds: readonly EntityId[],
    domain: Extract<DomainSpec, { kind: "boundedPositions" }>,
): Exclude<OrderEvaluationResult, { ok: true }> | null {
    const domainError = validatePositionDomain(domain);
    if (domainError) {
        return { ok: false, code: "invalidDomain", message: domainError };
    }
    if (atom.args.length !== expectedArity(atom)) {
        return {
            ok: false,
            code: "invalidArity",
            message: `${atom.relation} expects ${expectedArity(atom)} ordered roles`,
        };
    }
    const knownIds = new Set(entityIds);
    if (atom.args.some(id => !knownIds.has(id))) {
        return { ok: false, code: "unknownEntity", message: "The relation refers to an undeclared entity" };
    }
    if (atom.relation === "exactDisplacement") {
        if (atom.displacement === undefined) {
            return { ok: false, code: "missingDisplacement", message: "Exact displacement needs a displacement" };
        }
        if (!Number.isSafeInteger(atom.displacement)) {
            return { ok: false, code: "invalidDisplacement", message: "Displacement must be a safe integer" };
        }
    }
    if (atom.relation === "cyclicClockwise") {
        if (!domain.cyclic) {
            return {
                ok: false,
                code: "cyclicRelationInLinearDomain",
                message: "Clockwise order is defined only for a cyclic domain",
            };
        }
        const displacement = atom.displacement ?? 1;
        if (!Number.isSafeInteger(displacement) || displacement < 1 || displacement >= domain.size) {
            return {
                ok: false,
                code: "invalidDisplacement",
                message: "Clockwise displacement must be between one and size minus one",
            };
        }
    }
    return null;
}

function positionsById(
    world: PositionWorld,
    entityIds: readonly EntityId[],
    domain: Extract<DomainSpec, { kind: "boundedPositions" }>,
): Map<EntityId, number> | null {
    if (validatePositionDomain(domain)) return null;
    const required = new Set(entityIds);
    if (world.positions.length !== required.size) return null;
    const positions = new Map<EntityId, number>();
    for (const entry of world.positions) {
        if (
            !required.has(entry.entityId)
            || positions.has(entry.entityId)
            || !Number.isSafeInteger(entry.value)
            || entry.value < 0
            || entry.value >= domain.size
        ) {
            return null;
        }
        positions.set(entry.entityId, entry.value);
    }
    if (!domain.allowCoincidence && new Set(positions.values()).size !== positions.size) {
        return null;
    }
    return positions;
}

/**
 * Evaluates the declared ordered roles in one finite world.
 *
 * `between` means leftBoundary < middle < rightBoundary for
 * [middle, leftBoundary, rightBoundary]. `exactDisplacement` means
 * position(to) - position(from) = displacement. `cyclicClockwise` means an
 * exact clockwise step count (one when omitted), not an unspecified arc.
 */
export function evaluateOrderAtom(
    atom: OrderAtom,
    world: PositionWorld,
    entityIds: readonly EntityId[],
    domain: Extract<DomainSpec, { kind: "boundedPositions" }>,
): OrderEvaluationResult {
    const atomError = validateOrderAtom(atom, entityIds, domain);
    if (atomError) return atomError;
    const positions = positionsById(world, entityIds, domain);
    if (!positions) {
        return { ok: false, code: "invalidWorld", message: "The position world is incomplete or outside its domain" };
    }
    const value = (index: number): number => positions.get(atom.args[index])!;
    switch (atom.relation) {
        case "strictLess":
        case "leftOf":
            return { ok: true, holds: value(0) < value(1) };
        case "lessOrEqual":
            return { ok: true, holds: value(0) <= value(1) };
        case "equal":
            return { ok: true, holds: value(0) === value(1) };
        case "between":
            return { ok: true, holds: value(1) < value(0) && value(0) < value(2) };
        case "rightOf":
            return { ok: true, holds: value(0) > value(1) };
        case "adjacent": {
            const difference = Math.abs(value(0) - value(1));
            const holds = domain.cyclic
                ? difference === 1 || difference === domain.size - 1
                : difference === 1;
            return { ok: true, holds };
        }
        case "exactDisplacement":
            return { ok: true, holds: value(1) - value(0) === atom.displacement! };
        case "cyclicClockwise": {
            const clockwiseDistance = (value(1) - value(0) + domain.size) % domain.size;
            return { ok: true, holds: clockwiseDistance === (atom.displacement ?? 1) };
        }
    }
}

export function positionWorldSatisfiesOrderPremises(
    world: PositionWorld,
    premises: readonly OrderPremise[],
    entityIds: readonly EntityId[],
    domain: Extract<DomainSpec, { kind: "boundedPositions" }>,
): boolean {
    return premises.every(premise => {
        const result = evaluateOrderAtom(premise, world, entityIds, domain);
        return result.ok && result.holds;
    });
}

/** Applies a declared symmetry without silently treating a reflection as a rotation. */
export function transformCyclicPositionWorld(
    world: PositionWorld,
    entityIds: readonly EntityId[],
    domain: Extract<DomainSpec, { kind: "boundedPositions" }>,
    symmetry: CyclicSymmetry,
): CyclicWorldTransformResult {
    if (!domain.cyclic || validatePositionDomain(domain)) {
        return { ok: false, code: "invalidDomain", message: "Cyclic symmetry requires a valid cyclic domain" };
    }
    if (symmetry.reflect && !symmetry.reflectionAllowed) {
        return {
            ok: false,
            code: "reflectionNotAllowed",
            message: "This relation contract preserves rotations but not reflections",
        };
    }
    if (!positionsById(world, entityIds, domain)) {
        return { ok: false, code: "invalidWorld", message: "Cannot transform an invalid position world" };
    }
    const normalizedRotation = ((symmetry.rotation % domain.size) + domain.size) % domain.size;
    return {
        ok: true,
        world: {
            kind: "positionWorld",
            positions: world.positions.map(entry => {
                const oriented = symmetry.reflect ? -entry.value : entry.value;
                return {
                    entityId: entry.entityId,
                    value: ((oriented + normalizedRotation) % domain.size + domain.size) % domain.size,
                };
            }),
        },
    };
}
