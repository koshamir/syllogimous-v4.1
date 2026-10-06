import {
    InferenceClassification,
    PremiseNode,
    SemanticCertificate,
    SemanticWorld,
    VerifiedSupport,
} from "../models/semantic.models";

export interface BoundedClassification<W extends SemanticWorld> {
    classification: InferenceClassification;
    modelCount: number;
    queryWitness?: W;
    negatedQueryWitness?: W;
    finiteDomainAssumption: string;
}

export type BoundedReclassifier<P extends PremiseNode, W extends SemanticWorld> = (
    premises: readonly P[],
) => BoundedClassification<W> | undefined;

function indicesForMask(length: number, mask: number): number[] {
    const indices: number[] = [];
    for (let index = 0; index < length; index++) {
        if ((mask & (1 << index)) !== 0) indices.push(index);
    }
    return indices;
}

function isSuperset(candidate: readonly number[], selected: readonly number[]): boolean {
    return selected.every(index => candidate.includes(index));
}

/**
 * Derives support and relevance claims by rerunning the complete bounded
 * classifier. This deliberately does not trust the template's intended label.
 */
export function deriveBoundedSemanticCertificate<
    P extends PremiseNode,
    W extends SemanticWorld,
>(
    premises: readonly P[],
    solved: BoundedClassification<W>,
    reclassify: BoundedReclassifier<P, W>,
    supportLimit = 10,
): SemanticCertificate {
    let supports: VerifiedSupport[] = [];
    let supportStatus: "exact" | "unavailable" = "unavailable";
    if (solved.classification !== "underdetermined" && premises.length <= supportLimit) {
        const minimalMasks: number[][] = [];
        const subsetCount = 1 << premises.length;
        for (let subsetSize = 0; subsetSize <= premises.length; subsetSize++) {
            for (let mask = 0; mask < subsetCount; mask++) {
                const indices = indicesForMask(premises.length, mask);
                if (indices.length !== subsetSize) continue;
                if (minimalMasks.some(selected => isSuperset(indices, selected))) continue;
                const result = reclassify(indices.map(index => premises[index]));
                if (result?.classification === solved.classification) minimalMasks.push(indices);
            }
        }
        supports = minimalMasks.map(indices => ({
            premiseIds: indices.map(index => premises[index].id),
            minimal: true,
            status: "exact",
        }));
        supportStatus = "exact";
    }

    const necessaryPremiseIds = solved.classification === "underdetermined"
        ? []
        : premises.filter((_, removedIndex) => {
            const reduced = premises.filter((__, index) => index !== removedIndex);
            return reclassify(reduced)?.classification !== solved.classification;
        }).map(premise => premise.id);

    // For an unknown monotonic problem, deletion cannot certify necessity.
    // A premise is contrastively relevant here only when its deletion admits
    // strictly more worlds in the same complete finite domain.
    const contrastiveRelevantPremiseIds = solved.classification === "underdetermined"
        ? premises.filter((_, removedIndex) => {
            const reduced = premises.filter((__, index) => index !== removedIndex);
            const result = reclassify(reduced);
            return result !== undefined && result.modelCount > solved.modelCount;
        }).map(premise => premise.id)
        : [];

    return {
        premisesSatisfiable: true,
        classification: solved.classification,
        solverCompleteness: "boundedComplete",
        finiteDomainAssumptions: [solved.finiteDomainAssumption],
        queryWitness: solved.queryWitness,
        negatedQueryWitness: solved.negatedQueryWitness,
        supports,
        necessaryPremiseIds,
        contrastiveRelevantPremiseIds,
        verification: {
            premisesChecked: true,
            witnessesChecked: witnessPairIsComplete(solved),
            supportsChecked: supportStatus,
            independentOracleChecked: null,
        },
    };
}

function witnessPairIsComplete<W extends SemanticWorld>(solved: BoundedClassification<W>): boolean {
    switch (solved.classification) {
        case "entailed": return solved.queryWitness !== undefined && solved.negatedQueryWitness === undefined;
        case "refuted": return solved.queryWitness === undefined && solved.negatedQueryWitness !== undefined;
        case "underdetermined": return solved.queryWitness !== undefined && solved.negatedQueryWitness !== undefined;
    }
}

/** A fully interpreted ground expression has one interpretation and no premise dependency. */
export function groundExpressionCertificate(
    classification: Exclude<InferenceClassification, "underdetermined">,
    finiteDomainAssumption: string,
    witness?: SemanticWorld,
): SemanticCertificate {
    return {
        premisesSatisfiable: true,
        classification,
        solverCompleteness: "completeForDeclaredFragment",
        finiteDomainAssumptions: [finiteDomainAssumption],
        queryWitness: classification === "entailed" ? witness : undefined,
        negatedQueryWitness: classification === "refuted" ? witness : undefined,
        supports: [{ premiseIds: [], minimal: true, status: "exact" }],
        necessaryPremiseIds: [],
        contrastiveRelevantPremiseIds: [],
        verification: {
            premisesChecked: true,
            witnessesChecked: true,
            supportsChecked: "exact",
            independentOracleChecked: null,
        },
    };
}
