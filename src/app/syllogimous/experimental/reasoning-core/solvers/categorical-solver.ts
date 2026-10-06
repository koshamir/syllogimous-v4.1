import {
    CategoricalPremise,
    DomainSpec,
    InferenceClassification,
    SemanticCertificate,
} from "../models/semantic.models";
import {
    categoricalQueryAsPremise,
    negateCategoricalQuery,
    solveCategoricalSat,
} from "../semantics/categorical";
import { AtomicQuery } from "../models/semantic.models";

export interface CategoricalClassificationResult {
    classification?: InferenceClassification;
    certificate: SemanticCertificate;
    admissibleAtomCount: number;
}

export function classifyCategorical(
    premises: readonly CategoricalPremise[],
    query: Extract<AtomicQuery, { kind: "categorical" }>,
    domain: Extract<DomainSpec, { kind: "categoricalUnary" }>,
    supportLimit = 12,
): CategoricalClassificationResult {
    const base = solveCategoricalSat(premises, domain);
    if (!base.satisfiable) {
        return {
            admissibleAtomCount: base.admissibleAtomCount,
            certificate: {
                premisesSatisfiable: false,
                solverCompleteness: "completeForDeclaredFragment",
                finiteDomainAssumptions: [],
                supports: [],
                necessaryPremiseIds: [],
                contrastiveRelevantPremiseIds: [],
                verification: {
                    premisesChecked: true,
                    witnessesChecked: true,
                    supportsChecked: "unavailable",
                    independentOracleChecked: null,
                },
            },
        };
    }

    const withQuery = solveCategoricalSat([...premises, categoricalQueryAsPremise(query)], domain);
    const negated = negateCategoricalQuery(query);
    const withNegatedQuery = solveCategoricalSat([...premises, categoricalQueryAsPremise(negated, "__negated_query__")], domain);
    const classification: InferenceClassification = !withNegatedQuery.satisfiable
        ? "entailed"
        : !withQuery.satisfiable
            ? "refuted"
            : "underdetermined";

    const supports = premises.length <= supportLimit && classification !== "underdetermined"
        ? enumerateCategoricalMinimalSupports(premises, query, domain, classification)
        : [];
    const necessaryPremiseIds = classification === "underdetermined"
        ? []
        : premises
            .filter((_, deletedIndex) => {
                const reduced = premises.filter((__, index) => index !== deletedIndex);
                return classifyCategoricalWithoutSupports(reduced, query, domain) !== classification;
            })
            .map(premise => premise.id);
    // Nonredundant world restriction: deletion admits a world falsifying the
    // deleted constraint. Syntactic changes or atom counts are not sufficient.
    const contrastiveRelevantPremiseIds = classification === "underdetermined"
        ? premises
            .filter((deleted, deletedIndex) => solveCategoricalSat([
                ...premises.filter((__, index) => index !== deletedIndex),
                { ...deleted, id: "__deleted_negation__", quantifier: negateCategoricalQuery(deleted).quantifier },
            ], domain).satisfiable)
            .map(premise => premise.id)
        : [];

    return {
        classification,
        admissibleAtomCount: base.admissibleAtomCount,
        certificate: {
            premisesSatisfiable: true,
            classification,
            solverCompleteness: "completeForDeclaredFragment",
            finiteDomainAssumptions: [],
            queryWitness: withQuery.world,
            negatedQueryWitness: withNegatedQuery.world,
            supports,
            necessaryPremiseIds,
            contrastiveRelevantPremiseIds,
            verification: {
                premisesChecked: true,
                witnessesChecked: true,
                supportsChecked: premises.length <= supportLimit && classification !== "underdetermined"
                    ? "exact"
                    : "unavailable",
                independentOracleChecked: null,
            },
        },
    };
}

function classifyCategoricalWithoutSupports(
    premises: readonly CategoricalPremise[],
    query: Extract<AtomicQuery, { kind: "categorical" }>,
    domain: Extract<DomainSpec, { kind: "categoricalUnary" }>,
): InferenceClassification | "inconsistent" {
    if (!solveCategoricalSat(premises, domain).satisfiable) {
        return "inconsistent";
    }
    if (!solveCategoricalSat([...premises, categoricalQueryAsPremise(negateCategoricalQuery(query))], domain).satisfiable) {
        return "entailed";
    }
    if (!solveCategoricalSat([...premises, categoricalQueryAsPremise(query)], domain).satisfiable) {
        return "refuted";
    }
    return "underdetermined";
}

export function enumerateCategoricalMinimalSupports(
    premises: readonly CategoricalPremise[],
    query: Extract<AtomicQuery, { kind: "categorical" }>,
    domain: Extract<DomainSpec, { kind: "categoricalUnary" }>,
    target: "entailed" | "refuted",
): Array<{ premiseIds: string[]; minimal: true; status: "exact" }> {
    if (premises.length > 20) {
        throw new Error("Exact support enumeration is limited to 20 premises");
    }
    const candidates: number[][] = [];
    const subsetCount = 1 << premises.length;
    for (let mask = 0; mask < subsetCount; mask++) {
        const indices: number[] = [];
        for (let index = 0; index < premises.length; index++) {
            if ((mask & (1 << index)) !== 0) {
                indices.push(index);
            }
        }
        if (candidates.some(candidate => candidate.every(index => indices.includes(index)))) {
            continue;
        }
        const subset = indices.map(index => premises[index]);
        if (classifyCategoricalWithoutSupports(subset, query, domain) === target) {
            candidates.push(indices);
        }
    }
    return candidates.map(indices => ({
        premiseIds: indices.map(index => premises[index].id),
        minimal: true,
        status: "exact",
    }));
}
