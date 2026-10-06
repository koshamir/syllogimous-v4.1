import {
    InferenceClassification,
    MetricStatus,
    VerifiedSupport,
} from "../models/semantic.models";

export interface SubsetClassification {
    satisfiable: boolean;
    classification?: InferenceClassification;
}

export interface ExhaustiveSupportAnalysis {
    supports: VerifiedSupport[];
    necessaryPremiseIds: string[];
    status: MetricStatus;
}

function isSubset(left: readonly number[], right: readonly number[]): boolean {
    const rightSet = new Set(right);
    return left.every(index => rightSet.has(index));
}

function selectedIndices(mask: number, length: number): number[] {
    const indices: number[] = [];
    for (let index = 0; index < length; index++) {
        if ((mask & (1 << index)) !== 0) indices.push(index);
    }
    return indices;
}

/**
 * Enumerates every subset for small, determinate problems.  "Minimal" means
 * inclusion-minimal in this declared semantic fragment; it is not a claim
 * about the strategy a learner must use.
 */
export function enumerateMinimalSupports<T extends { id: string }>(
    premises: readonly T[],
    target: InferenceClassification,
    classify: (subset: readonly T[]) => SubsetClassification,
    maximumPremises = 12,
): ExhaustiveSupportAnalysis {
    if (target === "underdetermined" || premises.length > maximumPremises) {
        return { supports: [], necessaryPremiseIds: [], status: "unavailable" };
    }

    const candidates: number[][] = [];
    const subsetCount = 2 ** premises.length;
    for (let mask = 0; mask < subsetCount; mask++) {
        const indices = selectedIndices(mask, premises.length);
        const subset = indices.map(index => premises[index]);
        const result = classify(subset);
        if (result.satisfiable && result.classification === target) candidates.push(indices);
    }
    candidates.sort((left, right) => left.length - right.length);
    const minimal: number[][] = [];
    for (const candidate of candidates) {
        if (!minimal.some(support => isSubset(support, candidate))) minimal.push(candidate);
    }

    const necessaryPremiseIds = premises.filter((_, removedIndex) => {
        const reduced = premises.filter((__, index) => index !== removedIndex);
        const result = classify(reduced);
        return !result.satisfiable || result.classification !== target;
    }).map(premise => premise.id);

    return {
        supports: minimal.map(indices => ({
            premiseIds: indices.map(index => premises[index].id),
            minimal: true,
            status: "exact",
        })),
        necessaryPremiseIds,
        status: "exact",
    };
}

/**
 * For an underdetermined monotonic problem, deletion cannot establish logical
 * necessity.  This separate criterion reports a premise only when deleting it
 * admits at least one additional bounded world that the premise excluded.
 */
export function enumerateNonredundantWorldRestrictions<T extends { id: string }, W>(
    premises: readonly T[],
    enumerate: (subset: readonly T[]) => readonly W[],
    worldKey: (world: W) => string,
    maximumPremises = 12,
): { premiseIds: string[]; status: MetricStatus } {
    if (premises.length > maximumPremises) return { premiseIds: [], status: "unavailable" };
    const fullKeys = new Set(enumerate(premises).map(worldKey));
    const premiseIds = premises.filter((_, removedIndex) => {
        const reduced = premises.filter((__, index) => index !== removedIndex);
        return enumerate(reduced).some(world => !fullKeys.has(worldKey(world)));
    }).map(premise => premise.id);
    return { premiseIds, status: "exact" };
}
