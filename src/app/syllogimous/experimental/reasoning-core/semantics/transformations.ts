import {
    AtomicQuery,
    DomainSpec,
    EntityId,
    TransformationPremise,
    TransformOperator,
    TransformWorld,
} from "../models/semantic.models";

export type GridPoint = [number, number];

export interface TransformedPoint {
    point: GridPoint;
    width: number;
    height: number;
}

export type TransformationErrorCode =
    | "invalidDomain"
    | "pointOutsideDomain"
    | "invalidExpectedPoint"
    | "invalidChain";

export type TransformationApplicationResult =
    | { ok: true; value: TransformedPoint }
    | { ok: false; code: TransformationErrorCode; message: string };

export type TransformationEvaluationResult =
    | { ok: true; holds: boolean; world: TransformWorld; finalWidth: number; finalHeight: number }
    | { ok: false; code: TransformationErrorCode; message: string };

export type TransformationChainResult =
    | {
        ok: true;
        world: TransformWorld;
        states: Array<{ stateId: EntityId; point: GridPoint; width: number; height: number }>;
    }
    | { ok: false; code: TransformationErrorCode; message: string };

export function validateTransformationDomain(
    domain: Extract<DomainSpec, { kind: "boundedTransformations" }>,
): string | null {
    if (
        !Number.isSafeInteger(domain.width)
        || !Number.isSafeInteger(domain.height)
        || domain.width < 1
        || domain.height < 1
    ) {
        return "A transformation grid needs positive safe-integer dimensions";
    }
    return null;
}

function pointIsInside(point: GridPoint, width: number, height: number): boolean {
    return Number.isSafeInteger(point[0])
        && Number.isSafeInteger(point[1])
        && point[0] >= 0
        && point[0] < width
        && point[1] >= 0
        && point[1] < height;
}

/**
 * Fixed-screen convention: origin is the upper-left corner, x grows right and
 * y grows down. Rotations are clockwise and applied in listed order.
 * reflectHorizontal means reflection across the horizontal axis (top/bottom
 * exchange); reflectVertical means reflection across the vertical axis
 * (left/right exchange).
 */
export function applyTransformOperator(
    input: TransformedPoint,
    operator: TransformOperator,
): TransformedPoint {
    const [x, y] = input.point;
    switch (operator) {
        case "rotate90":
            return { point: [input.height - 1 - y, x], width: input.height, height: input.width };
        case "rotate180":
            return {
                point: [input.width - 1 - x, input.height - 1 - y],
                width: input.width,
                height: input.height,
            };
        case "rotate270":
            return { point: [y, input.width - 1 - x], width: input.height, height: input.width };
        case "reflectHorizontal":
            return { point: [x, input.height - 1 - y], width: input.width, height: input.height };
        case "reflectVertical":
            return { point: [input.width - 1 - x, y], width: input.width, height: input.height };
    }
}

export function applyTransformationSequence(
    initialPoint: GridPoint,
    operators: readonly TransformOperator[],
    domain: Extract<DomainSpec, { kind: "boundedTransformations" }>,
): TransformationApplicationResult {
    const domainError = validateTransformationDomain(domain);
    if (domainError) return { ok: false, code: "invalidDomain", message: domainError };
    if (!pointIsInside(initialPoint, domain.width, domain.height)) {
        return { ok: false, code: "pointOutsideDomain", message: "The initial point is outside the declared grid" };
    }
    let current: TransformedPoint = {
        point: [...initialPoint],
        width: domain.width,
        height: domain.height,
    };
    for (const operator of operators) current = applyTransformOperator(current, operator);
    return { ok: true, value: current };
}

export function evaluateTransformationQuery(
    query: Extract<AtomicQuery, { kind: "transformationResult" }>,
    domain: Extract<DomainSpec, { kind: "boundedTransformations" }>,
): TransformationEvaluationResult {
    const applied = applyTransformationSequence(query.initialPoint, query.operators, domain);
    if (!applied.ok) return applied;
    if (!pointIsInside(query.expectedPoint, applied.value.width, applied.value.height)) {
        return {
            ok: false,
            code: "invalidExpectedPoint",
            message: "The expected point is outside the transformed grid",
        };
    }
    const holds = applied.value.point[0] === query.expectedPoint[0]
        && applied.value.point[1] === query.expectedPoint[1];
    return {
        ok: true,
        holds,
        world: {
            kind: "transformWorld",
            initialPoint: [...query.initialPoint],
            finalPoint: [...applied.value.point],
        },
        finalWidth: applied.value.width,
        finalHeight: applied.value.height,
    };
}

/**
 * Applies a connected, consecutively ordered premise chain and exposes every
 * intermediate state. Branching transformation graphs require a separate
 * graph contract and are rejected here rather than assigned an arbitrary path.
 */
export function evaluateTransformationChain(
    premises: readonly TransformationPremise[],
    initialStateId: EntityId,
    initialPoint: GridPoint,
    domain: Extract<DomainSpec, { kind: "boundedTransformations" }>,
): TransformationChainResult {
    if (!premises.length) {
        const applied = applyTransformationSequence(initialPoint, [], domain);
        if (!applied.ok) return applied;
        return {
            ok: true,
            world: { kind: "transformWorld", initialPoint: [...initialPoint], finalPoint: [...initialPoint] },
            states: [{ stateId: initialStateId, ...applied.value }],
        };
    }
    const ordered = [...premises].sort((left, right) => left.order - right.order);
    if (ordered.some((premise, index) => !Number.isSafeInteger(premise.order)
        || (index > 0 && premise.order !== ordered[index - 1].order + 1))) {
        return { ok: false, code: "invalidChain", message: "Transformation orders must be unique and consecutive" };
    }
    if (ordered[0].inputState !== initialStateId
        || ordered.some((premise, index) => index > 0 && premise.inputState !== ordered[index - 1].outputState)) {
        return { ok: false, code: "invalidChain", message: "Transformation premises must form one connected ordered chain" };
    }

    const start = applyTransformationSequence(initialPoint, [], domain);
    if (!start.ok) return start;
    let current = start.value;
    const states: Array<{ stateId: EntityId; point: GridPoint; width: number; height: number }> = [
        { stateId: initialStateId, point: [...initialPoint], width: domain.width, height: domain.height },
    ];
    const seenStateIds = new Set<EntityId>([initialStateId]);
    for (const premise of ordered) {
        if (seenStateIds.has(premise.outputState)) {
            return { ok: false, code: "invalidChain", message: "A transformation chain cannot redefine a state" };
        }
        current = applyTransformOperator(current, premise.operator);
        states.push({ stateId: premise.outputState, point: [...current.point], width: current.width, height: current.height });
        seenStateIds.add(premise.outputState);
    }
    return {
        ok: true,
        world: { kind: "transformWorld", initialPoint: [...initialPoint], finalPoint: [...current.point] },
        states,
    };
}

/** Exhaustively checks commutativity over every point in the declared grid. */
export function transformationsCommute(
    first: TransformOperator,
    second: TransformOperator,
    domain: Extract<DomainSpec, { kind: "boundedTransformations" }>,
): boolean {
    if (validateTransformationDomain(domain)) return false;
    for (let x = 0; x < domain.width; x++) {
        for (let y = 0; y < domain.height; y++) {
            const forward = applyTransformationSequence([x, y], [first, second], domain);
            const reversed = applyTransformationSequence([x, y], [second, first], domain);
            if (!forward.ok || !reversed.ok) return false;
            if (
                forward.value.width !== reversed.value.width
                || forward.value.height !== reversed.value.height
                || forward.value.point[0] !== reversed.value.point[0]
                || forward.value.point[1] !== reversed.value.point[1]
            ) {
                return false;
            }
        }
    }
    return true;
}
