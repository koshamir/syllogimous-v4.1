import {
    DomainSpec,
    EntityId,
    EntitySpec,
    GraphEdgePremise,
} from "../models/semantic.models";
import { findGraphMappings, validateGraphMapping } from "./graph";

export interface StructuralMappingProblem {
    contract: "bijection" | "injectiveHomomorphism" | "homomorphism";
    domain: Extract<DomainSpec, { kind: "boundedGraph" }>;
    entities: readonly EntitySpec[];
    sourceIds: readonly EntityId[];
    targetIds: readonly EntityId[];
    edges: readonly GraphEdgePremise[];
}

export interface SurfaceAgreementDiagnostic {
    comparedPairs: number;
    sameDisplayLabelCount: number;
    sameFeatureCount: number;
    noteRu: string;
}

export function validateStructuralMappingProblem(problem: StructuralMappingProblem): string[] {
    const errors: string[] = [];
    const source = new Set(problem.sourceIds);
    const target = new Set(problem.targetIds);
    const declared = new Set(problem.entities.map(entity => entity.id));
    if (problem.sourceIds.some(id => target.has(id))) {
        errors.push("Исходная и целевая структуры должны использовать разные идентификаторы узлов.");
    }
    if ([...source, ...target].some(id => !declared.has(id))) {
        errors.push("Все узлы структур должны быть объявлены как сущности.");
    }
    if (problem.contract === "bijection" && source.size !== target.size) {
        errors.push("Для взаимно-однозначного соответствия структуры должны иметь одинаковое число ролей.");
    }
    if (problem.edges.some(edge => edge.graphId === "source"
        ? !source.has(edge.from) || !source.has(edge.to)
        : !target.has(edge.from) || !target.has(edge.to))) {
        errors.push("Ребро должно целиком находиться в указанной структуре.");
    }
    return errors;
}

export function findStructuralMappings(
    problem: StructuralMappingProblem,
    limit = 256,
): Array<Array<{ source: EntityId; target: EntityId }>> {
    const errors = validateStructuralMappingProblem(problem);
    if (errors.length) throw new Error(errors.join(" "));
    return findGraphMappings(
        problem.edges,
        problem.domain,
        problem.sourceIds,
        problem.targetIds,
        problem.contract,
        limit,
    );
}

/** Scores any structurally valid answer; no generator-specific mapping is privileged. */
export function scoreStructuralMapping(
    problem: StructuralMappingProblem,
    pairs: readonly { source: EntityId; target: EntityId }[],
): ReturnType<typeof validateGraphMapping> {
    const errors = validateStructuralMappingProblem(problem);
    if (errors.length) {
        return {
            valid: false,
            violations: [{ code: "invalidGraph", messageRu: errors.join(" ") }],
        };
    }
    return validateGraphMapping(
        problem.edges,
        problem.domain,
        problem.sourceIds,
        problem.targetIds,
        pairs,
        problem.contract,
    );
}

/** Surface similarity is diagnostic only and never participates in scoring. */
export function diagnoseSurfaceAgreement(
    problem: StructuralMappingProblem,
    pairs: readonly { source: EntityId; target: EntityId }[],
): SurfaceAgreementDiagnostic {
    const entities = new Map(problem.entities.map(entity => [entity.id, entity]));
    let sameDisplayLabelCount = 0;
    let sameFeatureCount = 0;
    for (const pair of pairs) {
        const left = entities.get(pair.source);
        const right = entities.get(pair.target);
        if (!left || !right) continue;
        if (left.label === right.label) sameDisplayLabelCount++;
        const leftFeatures = JSON.stringify(left.features ?? {});
        const rightFeatures = JSON.stringify(right.features ?? {});
        if (leftFeatures === rightFeatures) sameFeatureCount++;
    }
    return {
        comparedPairs: pairs.length,
        sameDisplayLabelCount,
        sameFeatureCount,
        noteRu: "Совпадение названий или внешних признаков не заменяет проверку направленных ролей и отношений.",
    };
}

export interface MissingRelationRepair {
    relationLabel: string;
    from: EntityId;
    to: EntityId;
    witnessMapping: Array<{ source: EntityId; target: EntityId }>;
}

/**
 * Tries every permitted labelled target edge.  This makes a missing-relation
 * answer an exact structural repair, not a comparison with generator intent.
 */
export function findMissingRelationRepairs(
    problem: StructuralMappingProblem,
    relationChoices: readonly string[],
): MissingRelationRepair[] {
    if (findStructuralMappings(problem, 1).length) return [];
    const existing = new Set(problem.edges
        .filter(edge => edge.graphId === "target")
        .map(edge => `${edge.from}\u0000${edge.relationLabel}\u0000${edge.to}`));
    const repairs: MissingRelationRepair[] = [];
    for (const relationLabel of relationChoices) {
        if (!problem.domain.relationLabels.includes(relationLabel)) continue;
        for (const from of problem.targetIds) {
            for (const to of problem.targetIds) {
                if (!problem.domain.loopsAllowed && from === to) continue;
                if (existing.has(`${from}\u0000${relationLabel}\u0000${to}`)) continue;
                const repairedEdge: GraphEdgePremise = {
                    kind: "graphEdge",
                    id: "__candidate_repair__",
                    graphId: "target",
                    from,
                    to,
                    relationLabel,
                };
                const repaired: StructuralMappingProblem = {
                    ...problem,
                    edges: [...problem.edges, repairedEdge],
                };
                const witness = findStructuralMappings(repaired, 1)[0];
                if (witness) repairs.push({ relationLabel, from, to, witnessMapping: witness });
            }
        }
    }
    return repairs;
}

export function scoreMissingRelationLabel(
    problem: StructuralMappingProblem,
    relationChoices: readonly string[],
    submittedRelation: string,
): { correct: boolean; acceptedLabels: string[]; repairs: MissingRelationRepair[] } {
    const repairs = findMissingRelationRepairs(problem, relationChoices);
    const acceptedLabels = [...new Set(repairs.map(repair => repair.relationLabel))].sort();
    return { correct: acceptedLabels.includes(submittedRelation), acceptedLabels, repairs };
}
