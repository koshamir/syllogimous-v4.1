import {
    AtomicQuery,
    CoupledFrameSpec,
    DomainSpec,
    EntitySpec,
    PremiseNode,
    QueryNode,
} from "../models/semantic.models";

function permutations<T>(values: readonly T[]): T[][] {
    if (values.length <= 1) return [[...values]];
    const result: T[][] = [];
    values.forEach((value, index) => {
        const rest = [...values.slice(0, index), ...values.slice(index + 1)];
        permutations(rest).forEach(suffix => result.push([value, ...suffix]));
    });
    return result;
}

function mappingCandidates(entities: readonly EntitySpec[]): Map<string, string>[] {
    const bySort = new Map<string, EntitySpec[]>();
    for (const entity of entities) {
        bySort.set(entity.sort, [...(bySort.get(entity.sort) ?? []), entity]);
    }
    const groups = [...bySort.entries()].sort(([left], [right]) => left.localeCompare(right));
    let candidates: Map<string, string>[] = [new Map()];
    for (const [sort, group] of groups) {
        const names = group.map((_, index) => `${sort[0].toUpperCase()}${index}`);
        const groupMappings = permutations(group).map(order => new Map(order.map((entity, index) => [entity.id, names[index]])));
        candidates = candidates.flatMap(base => groupMappings.map(groupMapping => new Map([...base, ...groupMapping])));
    }
    return candidates;
}

function id(value: string, mapping: ReadonlyMap<string, string>): string {
    return mapping.get(value) ?? value;
}

function serializeAtomic(query: AtomicQuery, mapping: ReadonlyMap<string, string>): string {
    switch (query.kind) {
        case "categorical": return `cat:${query.quantifier}:${id(query.subject, mapping)}:${id(query.predicate, mapping)}`;
        case "order": return `ord:${query.relation}:${query.args.map(arg => id(arg, mapping)).join(",")}:${query.displacement ?? ""}`;
        case "containment": return `con:${query.relation}:${id(query.subject, mapping)}:${id(query.classId, mapping)}:${query.contextId ?? ""}`;
        case "interval": return `int:${query.relation}:${id(query.left, mapping)}:${id(query.right, mapping)}`;
        case "rational": return `rat:${query.relation}:${query.left.numerator}/${query.left.denominator}:${query.right.numerator}/${query.right.denominator}:${query.result ? `${query.result.numerator}/${query.result.denominator}` : ""}:${query.units}`;
        case "proposition": return `prop:${query.propositionId}`;
        case "scopedRelation": return `scope:${query.contextId}:${query.subjectQuantifier}:${query.objectQuantifier}:${query.quantifierOrder.join(",")}:${id(query.subjectClass, mapping)}:${id(query.objectClass, mapping)}:${query.relation}:${query.nestingDepth}`;
        case "transformationResult": return `transform:${query.initialPoint.join(",")}:${query.operators.join(",")}:${query.expectedPoint.join(",")}`;
        case "graphIsomorphism": return `graph:${query.mappingContract}`;
        case "mappingValidity": return `mapping:${query.mappingContract}:${query.pairs.map(pair => `${id(pair.source, mapping)}>${id(pair.target, mapping)}`).sort().join(",")}`;
    }
}

function serializeQuery(query: QueryNode, mapping: ReadonlyMap<string, string>): string {
    if (query.kind === "logicalNot") return `not(${serializeAtomic(query.operand, mapping)})`;
    if (query.kind === "boolean") return `${query.operator}(${query.operands.map(operand => serializeAtomic(operand, mapping)).sort().join("|")})`;
    return serializeAtomic(query, mapping);
}

function serializePremise(premise: PremiseNode, mapping: ReadonlyMap<string, string>): string {
    switch (premise.kind) {
        case "categorical": return `cat:${premise.quantifier}:${id(premise.subject, mapping)}:${id(premise.predicate, mapping)}`;
        case "order": return `ord:${premise.relation}:${premise.args.map(arg => id(arg, mapping)).join(",")}:${premise.displacement ?? ""}`;
        case "containment": return `con:${premise.relation}:${id(premise.subject, mapping)}:${id(premise.classId, mapping)}:${premise.contextId ?? ""}`;
        case "conditional": return `if:${premise.bindingId}:${serializePremise(premise.if, mapping)}>${serializePremise(premise.then, mapping)}:except=${premise.exceptEntityIds.map(entity => id(entity, mapping)).sort().join(",")}`;
        case "interval": return `int:${premise.relation}:${id(premise.left, mapping)}:${id(premise.right, mapping)}`;
        case "rational": return `rat:${premise.relation}:${premise.left.numerator}/${premise.left.denominator}:${premise.right.numerator}/${premise.right.denominator}:${premise.result ? `${premise.result.numerator}/${premise.result.denominator}` : ""}:${premise.units}`;
        case "graphEdge": return `edge:${premise.graphId}:${id(premise.from, mapping)}:${id(premise.to, mapping)}:${premise.relationLabel}`;
        case "mappingPair": return `pair:${id(premise.source, mapping)}:${id(premise.target, mapping)}`;
        case "transformation": return `trans:${premise.operator}:${id(premise.inputState, mapping)}:${id(premise.outputState, mapping)}:${premise.order}`;
        case "scopedRelation": return `scope:${premise.contextId}:${premise.subjectQuantifier}:${premise.objectQuantifier}:${premise.quantifierOrder.join(",")}:${id(premise.subjectClass, mapping)}:${id(premise.objectClass, mapping)}:${premise.relation}:${premise.nestingDepth}`;
        case "booleanConstraint": return `bool:${premise.operator}:${[...premise.propositionIds].sort().join(",")}`;
        case "propositionValue": return `value:${premise.propositionId}:${premise.value}`;
        case "bridge": return `bridge:${premise.bridgeType}:${id(premise.fromEntity, mapping)}:${id(premise.toEntity, mapping)}:${[...premise.componentFamilies].sort().join(",")}`;
    }
}

function serializeDomain(domain: DomainSpec, mapping: ReadonlyMap<string, string>): string {
    switch (domain.kind) {
        case "categoricalUnary": return `categorical:${domain.existentialImport}:${domain.namedClasses.map(entity => id(entity, mapping)).sort().join(",")}`;
        case "boundedMembership": return `membership:${domain.objectIds.map(entity => id(entity, mapping)).sort().join(",")}:${domain.classIds.map(entity => id(entity, mapping)).sort().join(",")}`;
        case "boundedPositions": return `positions:${domain.size}:${domain.cyclic}:${domain.allowCoincidence}`;
        case "boundedIntervals": return `intervals:${domain.endpointMin}:${domain.endpointMax}`;
        case "exactRationals": return `rationals:${domain.units}`;
        case "boundedGraph": return `graph:${domain.directed}:${domain.loopsAllowed}:${domain.nodeIds.map(entity => id(entity, mapping)).sort().join(",")}:${[...domain.relationLabels].sort().join(",")}`;
        case "boundedContexts": return `contexts:${domain.contextIds.map(value => id(value, mapping)).sort().join(",")}:${domain.maxNesting}:${domain.frames?.map(frame =>
            `${id(frame.contextId, mapping)}:${frame.relation}:${id(frame.subjectClass, mapping)}:${id(frame.objectClass, mapping)}:${frame.subjectIds.map(value => id(value, mapping)).sort().join(",")}>${frame.objectIds.map(value => id(value, mapping)).sort().join(",")}`).sort().join("|") ?? ""}`;
        case "boundedStructuralMapping": return `mapping:${domain.mappingContract}:${domain.sourceIds.map(entity => id(entity, mapping)).sort().join(",")}:${domain.targetIds.map(entity => id(entity, mapping)).sort().join(",")}`;
        case "boundedTransformations": return `transforms:${domain.width}:${domain.height}:${domain.frame}`;
        case "composite": return `composite:${domain.parts.map(part => serializeDomain(part, mapping)).sort().join("|")}`;
    }
}

function serializeCoupledSpec(spec: CoupledFrameSpec | undefined, mapping: ReadonlyMap<string, string>): string | undefined {
    if (!spec) return undefined;
    switch (spec.kind) {
        case "membershipOrder": return JSON.stringify({
            kind: spec.kind, objectIds: spec.objectIds.map(value => id(value, mapping)).sort(),
            classId: id(spec.classId, mapping), focusTargetId: id(spec.focusTargetId, mapping),
            domain: serializeDomain(spec.positionDomain, mapping),
        });
        case "temporalSpatial": return JSON.stringify({
            kind: spec.kind, intervalIds: spec.intervalIds.map(value => id(value, mapping)).sort(),
            intervalDomain: serializeDomain(spec.intervalDomain, mapping),
            transformDomain: serializeDomain(spec.transformDomain, mapping),
            initialPoint: spec.initialPoint, expectedPoint: spec.expectedPoint,
            recipeOperators: [...spec.recipeOperators].sort(),
            activationPremiseId: spec.activationPremiseId, recipePremiseId: spec.recipePremiseId,
        });
        case "mappingQuantity": return JSON.stringify({
            kind: spec.kind, sourceIds: spec.sourceIds.map(value => id(value, mapping)).sort(),
            targetIds: spec.targetIds.map(value => id(value, mapping)).sort(),
            selectedSourceRoleId: id(spec.selectedSourceRoleId, mapping), threshold: spec.threshold,
            candidates: spec.quantityCandidates,
            facts: spec.quantityFacts.map(fact => `${fact.premiseId}:${id(fact.targetId, mapping)}`).sort(),
            roles: spec.quantityEntities.map(role => `${id(role.entityId, mapping)}:${id(role.targetId, mapping)}`).sort(),
        });
    }
}

export function canonicalSemanticInput(
    entities: readonly EntitySpec[],
    premises: readonly PremiseNode[],
    query: QueryNode,
    domain: DomainSpec,
    coupledSpec?: CoupledFrameSpec,
): string {
    if (entities.length > 8) {
        throw new Error("Exact structural canonicalization is limited to eight entities");
    }
    const candidates = mappingCandidates(entities).map(mapping => JSON.stringify({
        domain: serializeDomain(domain, mapping),
        premises: premises.map(premise => serializePremise(premise, mapping)).sort(),
        query: serializeQuery(query, mapping),
        sorts: entities.map(entity => entity.sort).sort(),
        coupledSpec: serializeCoupledSpec(coupledSpec, mapping),
    }));
    return candidates.sort()[0] ?? JSON.stringify({ domain: serializeDomain(domain, new Map()), premises: [], query: serializeQuery(query, new Map()) });
}

export function stableHash(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

export function structuralFingerprint(
    entities: readonly EntitySpec[],
    premises: readonly PremiseNode[],
    query: QueryNode,
    domain: DomainSpec,
    coupledSpec?: CoupledFrameSpec,
): string {
    return `fnv1a32:${stableHash(canonicalSemanticInput(entities, premises, query, domain, coupledSpec))}`;
}

export function semanticCacheKey(
    semanticsVersion: string,
    solverVersion: string,
    entities: readonly EntitySpec[],
    premises: readonly PremiseNode[],
    query: QueryNode,
    domain: DomainSpec,
    coupledSpec?: CoupledFrameSpec,
): string {
    return `${semanticsVersion}\u0000${solverVersion}\u0000${canonicalSemanticInput(entities, premises, query, domain, coupledSpec)}`;
}
