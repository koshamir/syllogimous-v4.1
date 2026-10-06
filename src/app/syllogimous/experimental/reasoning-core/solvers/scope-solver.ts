import { AtomicQuery, ContextScopeWorld, InferenceClassification, QueryNode, ScopeFrameSpec, ScopeSemanticWorld, ScopeWorld, ScopedRelationPremise, SemanticCertificate } from "../models/semantic.models";
import { enumerateContextScopeWorlds, enumerateScopeWorlds, evaluateScopedRelation } from "../semantics/scope";
import {
    enumerateMinimalSupports,
    enumerateNonredundantWorldRestrictions,
} from "../certificates/exhaustive-supports";

export function classifyScopeQuery(
    premises: readonly ScopedRelationPremise[],
    query: Extract<AtomicQuery, { kind: "scopedRelation" }>,
    people: readonly string[],
    objects: readonly string[],
    frames?: readonly ScopeFrameSpec[],
): SemanticCertificate {
    if (!frames && premises.some(premise => premise.contextId !== query.contextId || premise.relation !== query.relation)) {
        throw new Error("The bounded scope solver handles one explicitly declared context and relation at a time");
    }
    if (frames && [...premises, query].some(statement => !frames.some(frame => frame.contextId === statement.contextId
        && frame.relation === statement.relation && frame.subjectClass === statement.subjectClass && frame.objectClass === statement.objectClass))) {
        throw new Error("Формула области действия ссылается на необъявленный контекст, отношение или ролевой класс.");
    }
    const allWorlds: ScopeSemanticWorld[] = frames
        ? enumerateContextScopeWorlds(frames)
        : enumerateScopeWorlds(query.contextId, people, objects);
    const worlds = allWorlds.filter(world => premises.every(premise => evaluateScopedRelation(premise, world)));
    if (!worlds.length) {
        return scopeCertificate(false, undefined, undefined, undefined, people, objects, [], [], [], "unavailable", frames);
    }
    const queryWorld = worlds.find(world => evaluateScopedRelation(query, world));
    const negatedWorld = worlds.find(world => !evaluateScopedRelation(query, world));
    const classification: InferenceClassification = !negatedWorld
        ? "entailed"
        : !queryWorld
            ? "refuted"
            : "underdetermined";
    const classifySubset = (subset: readonly ScopedRelationPremise[]) => {
        const subsetWorlds = allWorlds.filter(world => subset.every(premise => evaluateScopedRelation(premise, world)));
        const someQuery = subsetWorlds.some(world => evaluateScopedRelation(query, world));
        const someNegated = subsetWorlds.some(world => !evaluateScopedRelation(query, world));
        return {
            satisfiable: subsetWorlds.length > 0,
            classification: !subsetWorlds.length
                ? undefined
                : !someNegated
                    ? "entailed" as const
                    : !someQuery
                        ? "refuted" as const
                        : "underdetermined" as const,
        };
    };
    const supports = enumerateMinimalSupports(premises, classification, classifySubset);
    const relevance = classification === "underdetermined"
        ? enumerateNonredundantWorldRestrictions(
            premises,
            subset => allWorlds.filter(world => subset.every(premise => evaluateScopedRelation(premise, world))),
            scopeWorldKey,
        )
        : { premiseIds: [] as string[] };
    return scopeCertificate(
        true,
        classification,
        queryWorld,
        negatedWorld,
        people,
        objects,
        supports.supports,
        supports.necessaryPremiseIds,
        relevance.premiseIds,
        supports.status,
        frames,
    );
}

export function classifyScopeFormula(
    premises: readonly ScopedRelationPremise[],
    query: Extract<AtomicQuery, { kind: "scopedRelation" }>
        | Extract<QueryNode, { kind: "logicalNot" }> & { operand: Extract<AtomicQuery, { kind: "scopedRelation" }> },
    people: readonly string[],
    objects: readonly string[],
    frames?: readonly ScopeFrameSpec[],
): SemanticCertificate {
    if (query.kind !== "logicalNot") return classifyScopeQuery(premises, query, people, objects, frames);
    const positive = classifyScopeQuery(premises, query.operand, people, objects, frames);
    const classification: InferenceClassification | undefined = positive.classification === "entailed"
        ? "refuted"
        : positive.classification === "refuted"
            ? "entailed"
            : positive.classification;
    return {
        ...positive,
        classification,
        queryWitness: positive.negatedQueryWitness,
        negatedQueryWitness: positive.queryWitness,
    };
}

export function validateScopeWorld(
    world: ScopeWorld,
    premises: readonly ScopedRelationPremise[],
): { valid: boolean; messageRu?: string } {
    const people = new Set(world.people);
    const objects = new Set(world.objects);
    const pairs = world.relationPairs.map(([person, object]) => `${person}\u0000${object}`);
    if (pairs.some((key, index) => pairs.indexOf(key) !== index)) {
        return { valid: false, messageRu: "Одна и та же связь указана в модели более одного раза." };
    }
    if (world.relationPairs.some(([person, object]) => !people.has(person) || !objects.has(object))) {
        return { valid: false, messageRu: "Связь модели ссылается на объект вне объявленного контекста." };
    }
    const failed = premises.find(premise => !evaluateScopedRelation(premise, world));
    return failed
        ? { valid: false, messageRu: `Модель нарушает формулу «${failed.id}».` }
        : { valid: true };
}

export function validateContextScopeWorld(
    world: ContextScopeWorld,
    premises: readonly ScopedRelationPremise[],
    frames: readonly ScopeFrameSpec[],
): { valid: boolean; messageRu?: string } {
    const sameIds = (actual: readonly string[], expected: readonly string[]) => actual.length === expected.length
        && new Set(actual).size === actual.length && actual.every(entityId => expected.includes(entityId));
    if (world.frames.length !== frames.length
        || new Set(world.frames.map(frame => `${frame.contextId}\u0000${frame.relation}`)).size !== world.frames.length) {
        return { valid: false, messageRu: "Модель должна содержать ровно все объявленные контексты отношений, без повторений." };
    }
    for (const frame of world.frames) {
        const spec = frames.find(candidate => candidate.contextId === frame.contextId && candidate.relation === frame.relation);
        if (!spec || spec.subjectClass !== frame.subjectClass || spec.objectClass !== frame.objectClass
            || !sameIds(frame.subjectIds, spec.subjectIds) || !sameIds(frame.objectIds, spec.objectIds)
            || new Set(frame.relationPairs.map(([subject, object]) => `${subject}\u0000${object}`)).size !== frame.relationPairs.length
            || frame.relationPairs.some(([subject, object]) => !frame.subjectIds.includes(subject) || !frame.objectIds.includes(object))) {
            return { valid: false, messageRu: "Связь или роль модели не соответствует объявленному контексту и отношению." };
        }
    }
    const failed = premises.find(premise => !evaluateScopedRelation(premise, world));
    return failed ? { valid: false, messageRu: `Нарушена формула «${failed.id}» в её собственном контексте.` } : { valid: true };
}

function scopeWorldKey(world: ScopeSemanticWorld): string {
    if (world.kind === "contextScopeWorld") return world.frames.map(frame => `${frame.contextId}:${frame.relation}:${frame.relationPairs
        .map(([left, right]) => `${left}\u0000${right}`).sort().join("|")}`).sort().join(";");
    return world.relationPairs.map(([left, right]) => `${left}\u0000${right}`).sort().join("|");
}

function scopeCertificate(
    satisfiable: boolean,
    classification: InferenceClassification | undefined,
    queryWorld: ScopeSemanticWorld | undefined,
    negatedWorld: ScopeSemanticWorld | undefined,
    people: readonly string[],
    objects: readonly string[],
    supports: SemanticCertificate["supports"] = [],
    necessaryPremiseIds: string[] = [],
    contrastiveRelevantPremiseIds: string[] = [],
    supportStatus: SemanticCertificate["verification"]["supportsChecked"] = "unavailable",
    frames?: readonly ScopeFrameSpec[],
): SemanticCertificate {
    return {
        premisesSatisfiable: satisfiable,
        classification,
        solverCompleteness: "boundedComplete",
        finiteDomainAssumptions: frames
            ? [`Полностью перебрано произведение ${frames.length} отдельных таблиц контекстов и отношений; роли перечислены в домене. Связи разных таблиц независимы, если нет явного правила.`]
            : [`Мир содержит ровно ${people.length} чел. и ${objects.length} объекта; перебраны все отношения между ними.`],
        queryWitness: queryWorld,
        negatedQueryWitness: negatedWorld,
        supports,
        necessaryPremiseIds,
        contrastiveRelevantPremiseIds,
        verification: {
            premisesChecked: true,
            witnessesChecked: true,
            supportsChecked: supportStatus,
            independentOracleChecked: null,
        },
    };
}
