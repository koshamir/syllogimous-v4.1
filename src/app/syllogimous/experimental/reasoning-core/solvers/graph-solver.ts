import {
    DomainSpec,
    EntityId,
    GraphEdgePremise,
    MappingWorld,
    SemanticCertificate,
} from "../models/semantic.models";
import {
    findGraphMappings,
    graphPairHasMatchingDegreeSignature,
    validateGraphMapping,
} from "../semantics/graph";

export interface GraphHardNegativeCheck {
    degreeMatched: boolean;
    isomorphic: boolean;
    qualifies: boolean;
}

export function checkDegreeMatchedHardNegative(
    edges: readonly GraphEdgePremise[],
    domain: Extract<DomainSpec, { kind: "boundedGraph" }>,
    sourceIds: readonly EntityId[],
    targetIds: readonly EntityId[],
): GraphHardNegativeCheck {
    const degreeMatched = graphPairHasMatchingDegreeSignature(edges, sourceIds, targetIds, domain.directed);
    const isomorphic = findGraphMappings(edges, domain, sourceIds, targetIds, "bijection", 1).length > 0;
    return { degreeMatched, isomorphic, qualifies: degreeMatched && !isomorphic };
}

export function classifyGraphIsomorphism(
    edges: readonly GraphEdgePremise[],
    domain: Extract<DomainSpec, { kind: "boundedGraph" }>,
    sourceIds: readonly EntityId[],
    targetIds: readonly EntityId[],
    contract: "bijection" | "injectiveHomomorphism" | "homomorphism",
): SemanticCertificate {
    const mappings = findGraphMappings(edges, domain, sourceIds, targetIds, contract);
    const witness: MappingWorld | undefined = mappings[0]
        ? { kind: "mappingWorld", pairs: mappings[0] }
        : undefined;
    return {
        premisesSatisfiable: true,
        classification: witness ? "entailed" : "refuted",
        solverCompleteness: "boundedComplete",
        finiteDomainAssumptions: [
            `Выполнен точный конечный поиск допустимого отображения между ${sourceIds.length} и ${targetIds.length} перечисленными узлами.`,
            domain.directed ? "Рёбра ориентированы." : "Рёбра неориентированы.",
        ],
        queryWitness: witness,
        supports: [],
        necessaryPremiseIds: [],
        contrastiveRelevantPremiseIds: [],
        verification: {
            premisesChecked: true,
            witnessesChecked: witness
                ? validateGraphMapping(edges, domain, sourceIds, targetIds, witness.pairs, contract).valid
                : true,
            supportsChecked: "unavailable",
            independentOracleChecked: null,
        },
    };
}

/** Deterministic scorer for a learner-supplied mapping, including alternatives. */
export function scoreSubmittedGraphMapping(
    edges: readonly GraphEdgePremise[],
    domain: Extract<DomainSpec, { kind: "boundedGraph" }>,
    sourceIds: readonly EntityId[],
    targetIds: readonly EntityId[],
    pairs: readonly { source: EntityId; target: EntityId }[],
    contract: "bijection" | "injectiveHomomorphism" | "homomorphism",
): ReturnType<typeof validateGraphMapping> {
    return validateGraphMapping(edges, domain, sourceIds, targetIds, pairs, contract);
}
