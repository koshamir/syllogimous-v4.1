import {
    ComplexityCertificate,
    EntityId,
    PremiseNode,
    ReasoningItem,
    ResponseFormat,
    SemanticCertificate,
    TransformOperator,
} from "../models/semantic.models";
import { applyTransformationSequence } from "../semantics/transformations";

export interface ComplexityInputs {
    premises: readonly PremiseNode[];
    entityCount: number;
    responseFormat: ResponseFormat;
    semanticCertificate: SemanticCertificate;
    memoryVisibility: "visible" | "sequential" | "memoryLoaded";
    distractorCount: number;
    timePressure: "none" | "measured" | "limited";
    novelty?: "new" | "review" | "transfer";
    priorExposureCount?: number;
}

export function premiseEntityRefs(premise: PremiseNode): EntityId[] {
    switch (premise.kind) {
        case "categorical": return [premise.subject, premise.predicate];
        case "order": return [...premise.args];
        case "containment": return [premise.subject, premise.classId];
        case "interval": return [premise.left, premise.right];
        case "rational": return [];
        case "graphEdge": return [premise.from, premise.to];
        case "mappingPair": return [premise.source, premise.target];
        case "transformation": return [premise.inputState, premise.outputState];
        case "scopedRelation": return [premise.subjectClass, premise.objectClass];
        case "propositionValue": return [];
        case "booleanConstraint": return [];
        case "bridge": return [premise.fromEntity, premise.toEntity];
        case "conditional": return [
            ...premiseEntityRefs(premise.if),
            ...premiseEntityRefs(premise.then),
            ...premise.exceptEntityIds,
        ];
    }
}

function relationArity(premise: PremiseNode): number {
    switch (premise.kind) {
        case "order": return premise.relation === "between" ? 3 : 2;
        case "conditional": return Math.max(relationArity(premise.if), relationArity(premise.then));
        case "booleanConstraint": return 2;
        case "propositionValue": return 1;
        case "transformation": return 1;
        default: return 2;
    }
}

function atomicConstraintCount(premise: PremiseNode): number {
    return premise.kind === "conditional" ? 2 : 1;
}

function allPermutations(values: readonly number[]): number[][] {
    if (values.length <= 1) return [[...values]];
    const result: number[][] = [];
    values.forEach((value, index) => {
        const rest = [...values.slice(0, index), ...values.slice(index + 1)];
        for (const suffix of allPermutations(rest)) result.push([value, ...suffix]);
    });
    return result;
}

function frontierForOrder(premises: readonly PremiseNode[], order: readonly number[]): number {
    const refs = premises.map(premise => new Set(premiseEntityRefs(premise)));
    const seen = new Set<string>();
    let maximum = 0;
    for (let position = 0; position < order.length; position++) {
        refs[order[position]].forEach(id => seen.add(id));
        const future = new Set<string>();
        for (let next = position + 1; next < order.length; next++) {
            refs[order[next]].forEach(id => future.add(id));
        }
        maximum = Math.max(maximum, [...seen].filter(id => future.has(id)).length);
    }
    return maximum;
}

export function estimateLiveFrontier(premises: readonly PremiseNode[]): {
    value: number;
    status: "exact" | "approximate";
    strategyLanguage: string;
} {
    const indices = premises.map((_, index) => index);
    if (premises.length <= 8) {
        const value = Math.min(...allPermutations(indices).map(order => frontierForOrder(premises, order)));
        return {
            value,
            status: "exact",
            strategyLanguage: "Минимум по всем линейным порядкам чтения атомарных посылок; это не утверждение о стратегии человека.",
        };
    }
    const natural = frontierForOrder(premises, indices);
    const reversed = frontierForOrder(premises, [...indices].reverse());
    return {
        value: Math.min(natural, reversed),
        status: "approximate",
        strategyLanguage: "Минимум для прямого и обратного порядка чтения; другие стратегии не перебраны.",
    };
}

function transformations(premises: readonly PremiseNode[]): TransformOperator[] {
    return premises
        .filter((premise): premise is Extract<PremiseNode, { kind: "transformation" }> => premise.kind === "transformation")
        .sort((left, right) => left.order - right.order)
        .map(premise => premise.operator);
}

function structuralFlow(premises: readonly PremiseNode[]): { branches: number; joins: number } {
    const outgoing = new Map<EntityId, Set<EntityId>>();
    const incoming = new Map<EntityId, Set<EntityId>>();
    for (const premise of premises) {
        const refs = premiseEntityRefs(premise);
        if (refs.length < 2) continue;
        const source = refs[0];
        // For a ternary relation the first role is bound jointly to both other
        // ordered roles. This is a structural estimate, not a proof metric.
        for (const target of refs.slice(1)) {
            if (source === target) continue;
            const targets = outgoing.get(source) ?? new Set<EntityId>();
            targets.add(target);
            outgoing.set(source, targets);
            const sources = incoming.get(target) ?? new Set<EntityId>();
            sources.add(source);
            incoming.set(target, sources);
        }
    }
    return {
        branches: [...outgoing.values()].filter(targets => targets.size > 1).length,
        joins: [...incoming.values()].filter(sources => sources.size > 1).length,
    };
}

export function computeComplexity(inputs: ComplexityInputs): ComplexityCertificate {
    const refs = inputs.premises.flatMap(premiseEntityRefs);
    const frequencies = new Map<string, number>();
    refs.forEach(id => frequencies.set(id, (frequencies.get(id) ?? 0) + 1));
    const degrees = [...frequencies.values()];
    const flow = structuralFlow(inputs.premises);
    const supportSizes = inputs.semanticCertificate.supports.map(support => support.premiseIds.length);
    const frontier = estimateLiveFrontier(inputs.premises);
    const bridges = inputs.premises.filter(premise => premise.kind === "bridge");
    const exactSupports = inputs.semanticCertificate.supports.length > 0
        && inputs.semanticCertificate.supports.every(support => support.status === "exact" && support.minimal);
    const everySupportHasBridge = bridges.length && exactSupports
        ? inputs.semanticCertificate.supports.every(support => bridges.some(bridge => support.premiseIds.includes(bridge.id)))
        : null;
    const transformOps = transformations(inputs.premises);
    // D4 operators are checked on a 3x3 square, comparing this entire sequence
    // with its reversal. Presence of a rotation/reflection is not enough.
    const noncommutative = Array.from({ length: 9 }, (_, index) => [index % 3, Math.floor(index / 3)] as [number, number])
        .some(point => {
            const domain = { kind: "boundedTransformations" as const, closure: "listedStatesOnly" as const, width: 3, height: 3, frame: "fixedAxes" as const };
            const forward = applyTransformationSequence(point, transformOps, domain);
            const reverse = applyTransformationSequence(point, [...transformOps].reverse(), domain);
            return forward.ok && reverse.ok && forward.value.point.join(",") !== reverse.value.point.join(",");
        });
    return {
        displayedPremises: inputs.premises.length,
        atomicConstraints: inputs.premises.reduce((count, premise) => count + atomicConstraintCount(premise), 0),
        embeddedClauses: inputs.premises.filter(premise => premise.kind === "conditional").length * 2,
        entityCount: inputs.entityCount,
        maxRelationArity: inputs.premises.length ? Math.max(...inputs.premises.map(relationArity)) : 0,
        relationalOrder: Math.max(1, ...inputs.premises.map(premise => premise.kind === "mappingPair" || premise.kind === "bridge" ? 2 : 1)),
        minimalSupportSize: supportSizes.length ? Math.min(...supportSizes) : null,
        distinctMinimalSupports: exactSupports ? supportSizes.length : null,
        supportStatus: exactSupports ? "exact" : "unavailable",
        // Support cardinality is not proof depth. No proof strategy language
        // has been searched by the model-set verifier.
        shortestProofDepth: null,
        proofDepthStatus: "unavailable",
        branchingCount: flow.branches,
        reconvergentJoinCount: flow.joins,
        maxScopeNesting: Math.max(0, ...inputs.premises.map(premise => premise.kind === "scopedRelation" ? premise.nestingDepth : 0)),
        bindingInterference: degrees.filter(degree => degree > 1).reduce((sum, degree) => sum + degree - 1, 0),
        roleOverlap: refs.length - new Set(refs).size,
        estimatedLiveFrontier: frontier.value,
        liveFrontierStatus: frontier.status,
        strategyLanguage: frontier.strategyLanguage,
        admissibleModelCount: null,
        modelCountStatus: "unavailable",
        modelCountDomainNote: "Число моделей сообщается только солвером, который полностью перечисляет объявленный ограниченный домен.",
        transformationComposition: transformOps.length,
        noncommutative,
        crossFrameBridgeCount: bridges.length,
        everyMinimalSupportRequiresBridge: everySupportHasBridge,
        bridgeNecessityStatus: everySupportHasBridge === null ? "unavailable" : "exact",
        format: inputs.responseFormat,
        memoryVisibility: inputs.memoryVisibility,
        distractorCount: inputs.distractorCount,
        timePressure: inputs.timePressure,
        novelty: inputs.novelty ?? "new",
        priorExposureCount: inputs.priorExposureCount ?? 0,
    };
}

export function withMeasuredComplexity(item: Omit<ReasoningItem, "measuredComplexity">): ReasoningItem {
    return {
        ...item,
        measuredComplexity: computeComplexity({
            premises: item.premises,
            entityCount: item.entities.length,
            responseFormat: item.responseSpec.kind,
            semanticCertificate: item.semanticCertificate,
            memoryVisibility: item.targetComplexity.memoryVisibility,
            distractorCount: item.targetComplexity.distractorCount,
            timePressure: item.targetComplexity.timePressure,
        }),
    };
}
