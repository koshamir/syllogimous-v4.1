import {
    AtomicQuery,
    BooleanConstraintPremise,
    CategoricalPremise,
    CategoricalWorld,
    DomainSpec,
    GraphEdgePremise,
    IntervalPremise,
    IntervalWorld,
    MappingWorld,
    MembershipWorld,
    OrderPremise,
    PositionWorld,
    PremiseNode,
    PropositionWorld,
    PropositionValuePremise,
    QueryNode,
    ReasoningItem,
    ScopeWorld,
    ScopedRelationPremise,
    SemanticWorld,
    TransformWorld,
} from "../models/semantic.models";
import { validateCategoricalWorld } from "./categorical";
import { evaluateOrderAtom, positionWorldSatisfiesOrderPremises } from "./order";
import { evaluateIntervalAtom, intervalWorldSatisfiesPremises } from "./interval";
import { evaluateBooleanQuery, enumeratePropositionWorlds } from "../solvers/proposition-solver";
import { evaluateScopedRelation } from "./scope";
import { validateContextScopeWorld, validateScopeWorld } from "../solvers/scope-solver";
import {
    hierarchyContainmentHolds,
    HierarchyPremise,
    validateHierarchyWorld,
} from "../solvers/hierarchy-solver";
import { validateGraphMapping } from "./graph";
import { evaluateTransformationQuery } from "./transformations";
import { reconstructCoupledFrameProblem, validateCoupledWorld } from "./coupled-frames";

export interface WorldVerification {
    valid: boolean;
    queryHolds?: boolean;
    messageRu?: string;
    violatedPremiseId?: string;
}

function propositionMap(world: PropositionWorld): Map<string, boolean> | null {
    const map = new Map<string, boolean>();
    for (const entry of world.values) {
        if (map.has(entry.propositionId)) return null;
        map.set(entry.propositionId, entry.value);
    }
    return map;
}

function atomicHolds(item: ReasoningItem, query: AtomicQuery, world: SemanticWorld): boolean | undefined {
    switch (query.kind) {
        case "categorical": {
            if (world.kind !== "categoricalWorld" || item.domain.kind !== "categoricalUnary") return undefined;
            const premise: CategoricalPremise = { ...query, id: "__submitted_query__" };
            return validateCategoricalWorld(world, [premise], item.domain.namedClasses, "emptyClassesAllowed");
        }
        case "order": {
            if (world.kind !== "positionWorld" || item.domain.kind !== "boundedPositions") return undefined;
            const entityIds = item.entities.filter(entity => entity.sort === "position" || entity.sort === "object").map(entity => entity.id);
            const evaluated = evaluateOrderAtom(query, world, entityIds, item.domain);
            return evaluated.ok ? evaluated.holds : undefined;
        }
        case "containment": {
            if (world.kind !== "membershipWorld") return undefined;
            const objectIds = item.entities.filter(entity => entity.sort === "object" || entity.sort === "person").map(entity => entity.id);
            const memberships = new Set(world.memberships.map(entry => `${entry.objectId}\u0000${entry.classId}`));
            return hierarchyContainmentHolds({ ...query, id: "__submitted_query__" }, memberships, objectIds);
        }
        case "interval": {
            if (world.kind !== "intervalWorld" || item.domain.kind !== "boundedIntervals") return undefined;
            const entityIds = item.entities.filter(entity => entity.sort === "interval").map(entity => entity.id);
            const evaluated = evaluateIntervalAtom(query, world, entityIds, item.domain);
            return evaluated.ok ? evaluated.holds : undefined;
        }
        case "proposition": {
            if (world.kind !== "propositionWorld") return undefined;
            const values = propositionMap(world);
            return values ? values.get(query.propositionId) : undefined;
        }
        case "scopedRelation":
            return world.kind === "scopeWorld" || world.kind === "contextScopeWorld" ? evaluateScopedRelation(query, world) : undefined;
        case "transformationResult": {
            if (world.kind !== "transformWorld" || item.domain.kind !== "boundedTransformations") return undefined;
            const evaluated = evaluateTransformationQuery(query, item.domain);
            return evaluated.ok
                && world.initialPoint[0] === query.initialPoint[0]
                && world.initialPoint[1] === query.initialPoint[1]
                && world.finalPoint[0] === query.expectedPoint[0]
                && world.finalPoint[1] === query.expectedPoint[1]
                && evaluated.holds;
        }
        case "mappingValidity":
        case "graphIsomorphism":
            return graphQueryHolds(item, query, world);
        case "rational":
            return undefined;
    }
}

function graphQueryHolds(
    item: ReasoningItem,
    query: Extract<AtomicQuery, { kind: "mappingValidity" | "graphIsomorphism" }>,
    world: SemanticWorld,
): boolean | undefined {
    if (world.kind !== "mappingWorld" || item.domain.kind !== "boundedGraph") return undefined;
    const edges = item.premises.filter((premise): premise is GraphEdgePremise => premise.kind === "graphEdge");
    const sourceIds = item.entities.filter(entity => entity.features?.["frame"] === "source").map(entity => entity.id);
    const targetIds = item.entities.filter(entity => entity.features?.["frame"] === "target").map(entity => entity.id);
    const contract = query.mappingContract;
    const pairs = query.kind === "mappingValidity" ? query.pairs : world.pairs;
    return validateGraphMapping(edges, item.domain, sourceIds, targetIds, pairs, contract).valid;
}

export function evaluateQueryInWorld(item: ReasoningItem, world: SemanticWorld): boolean | undefined {
    const query: QueryNode = item.query;
    if (query.kind === "logicalNot") {
        const value = atomicHolds(item, query.operand, world);
        return value === undefined ? undefined : !value;
    }
    if (query.kind === "boolean") {
        const left = atomicHolds(item, query.operands[0], world);
        const right = atomicHolds(item, query.operands[1], world);
        if (left === undefined || right === undefined) return undefined;
        return query.operator === "and" ? left && right : query.operator === "or" ? left || right : left !== right;
    }
    return atomicHolds(item, query, world);
}

function categoricalPremises(item: ReasoningItem): CategoricalPremise[] | null {
    const premises = item.premises.filter((premise): premise is CategoricalPremise => premise.kind === "categorical");
    return premises.length === item.premises.length ? premises : null;
}

function orderPremises(item: ReasoningItem): OrderPremise[] | null {
    const premises = item.premises.filter((premise): premise is OrderPremise => premise.kind === "order");
    return premises.length === item.premises.length ? premises : null;
}

function intervalPremises(item: ReasoningItem): IntervalPremise[] | null {
    const premises = item.premises.filter((premise): premise is IntervalPremise => premise.kind === "interval");
    return premises.length === item.premises.length ? premises : null;
}

function submittedWorldSatisfiesPremises(item: ReasoningItem, world: SemanticWorld): WorldVerification {
    if (world.kind === "categoricalWorld" && item.domain.kind === "categoricalUnary") {
        const premises = categoricalPremises(item);
        if (!premises) return { valid: false, messageRu: "Тип модели не соответствует смешанным посылкам задания." };
        const valid = validateCategoricalWorld(world, premises, item.domain.namedClasses, item.domain.existentialImport);
        return valid ? { valid: true } : { valid: false, messageRu: "Модель нарушает категориальную посылку или условие непустоты классов." };
    }
    if (world.kind === "positionWorld" && item.domain.kind === "boundedPositions") {
        const premises = orderPremises(item);
        if (!premises) return { valid: false, messageRu: "Тип модели не соответствует посылкам задания." };
        const entityIds = item.entities.filter(entity => entity.sort === "position" || entity.sort === "object").map(entity => entity.id);
        const failed = premises.find(premise => {
            const value = evaluateOrderAtom(premise, world, entityIds, item.domain as Extract<DomainSpec, { kind: "boundedPositions" }>);
            return !value.ok || !value.holds;
        });
        return positionWorldSatisfiesOrderPremises(world, premises, entityIds, item.domain)
            ? { valid: true }
            : { valid: false, violatedPremiseId: failed?.id, messageRu: failed ? `Нарушена посылка «${failed.id}».` : "Расположение неполно или выходит за границы." };
    }
    if (world.kind === "intervalWorld" && item.domain.kind === "boundedIntervals") {
        const premises = intervalPremises(item);
        if (!premises) return { valid: false, messageRu: "Тип модели не соответствует посылкам задания." };
        const entityIds = item.entities.filter(entity => entity.sort === "interval").map(entity => entity.id);
        const failed = premises.find(premise => {
            const value = evaluateIntervalAtom(premise, world, entityIds, item.domain as Extract<DomainSpec, { kind: "boundedIntervals" }>);
            return !value.ok || !value.holds;
        });
        return intervalWorldSatisfiesPremises(world, premises, entityIds, item.domain)
            ? { valid: true }
            : { valid: false, violatedPremiseId: failed?.id, messageRu: failed ? `Нарушена посылка «${failed.id}».` : "Концы интервалов заданы неверно." };
    }
    if (world.kind === "propositionWorld") {
        const booleanPremises = item.premises.filter((premise): premise is BooleanConstraintPremise | PropositionValuePremise =>
            premise.kind === "booleanConstraint" || premise.kind === "propositionValue");
        if (booleanPremises.length !== item.premises.length) return { valid: false, messageRu: "Тип модели не соответствует посылкам задания." };
        const candidates = enumeratePropositionWorlds(booleanPremises, item.query);
        const submitted = propositionMap(world);
        const equal = submitted && candidates.some(candidate => {
            const candidateValues = propositionMap(candidate)!;
            return submitted.size === candidateValues.size && [...submitted].every(([key, value]) => candidateValues.get(key) === value);
        });
        return equal ? { valid: true } : { valid: false, messageRu: "Оценка высказываний нарушает логическую связку." };
    }
    if (world.kind === "contextScopeWorld") {
        if (item.domain.kind !== "boundedContexts" || !item.domain.frames) {
            return { valid: false, messageRu: "Многоконтекстная модель требует явно перечисленных ролевых таблиц." };
        }
        const premises = item.premises.filter((premise): premise is ScopedRelationPremise => premise.kind === "scopedRelation");
        if (premises.length !== item.premises.length) return { valid: false, messageRu: "Тип модели не соответствует посылкам задания." };
        const checked = validateContextScopeWorld(world, premises, item.domain.frames);
        const failed = premises.find(premise => !evaluateScopedRelation(premise, world));
        return checked.valid ? { valid: true } : { valid: false, messageRu: checked.messageRu, violatedPremiseId: failed?.id };
    }
    if (world.kind === "scopeWorld") {
        if (item.domain.kind === "boundedContexts" && item.domain.frames) {
            return { valid: false, messageRu: "Для этого задания нужны отдельные таблицы всех объявленных контекстов и отношений." };
        }
        const premises = item.premises.filter((premise): premise is ScopedRelationPremise => premise.kind === "scopedRelation");
        if (premises.length !== item.premises.length) return { valid: false, messageRu: "Тип модели не соответствует посылкам задания." };
        const expectedPeople = item.entities.filter(entity => entity.sort === "person").map(entity => entity.id).sort();
        const expectedObjects = item.entities.filter(entity => entity.sort === "object").map(entity => entity.id).sort();
        const actualPeople = [...world.people].sort();
        const actualObjects = [...world.objects].sort();
        if (new Set(world.people).size !== world.people.length
            || new Set(world.objects).size !== world.objects.length
            || actualPeople.length !== expectedPeople.length
            || actualObjects.length !== expectedObjects.length
            || actualPeople.some((id, index) => id !== expectedPeople[index])
            || actualObjects.some((id, index) => id !== expectedObjects[index])) {
            return { valid: false, messageRu: "Модель должна содержать ровно перечисленных людей и объекты этого конечного контекста." };
        }
        const checked = validateScopeWorld(world, premises);
        if (checked.valid) return { valid: true };
        const failed = premises.find(premise => !evaluateScopedRelation(premise, world));
        return { valid: false, violatedPremiseId: failed?.id, messageRu: checked.messageRu };
    }
    if (world.kind === "membershipWorld") {
        const premises = item.premises.filter((premise): premise is HierarchyPremise => premise.kind === "containment" || premise.kind === "conditional");
        if (premises.length !== item.premises.length) return { valid: false, messageRu: "Тип модели не соответствует посылкам задания." };
        const objectIds = item.entities.filter(entity => entity.sort === "object" || entity.sort === "person").map(entity => entity.id);
        const classIds = item.entities.filter(entity => entity.sort === "class").map(entity => entity.id);
        return validateHierarchyWorld(world, premises, objectIds, classIds);
    }
    if (world.kind === "mappingWorld") {
        const value = item.query.kind === "graphIsomorphism" || item.query.kind === "mappingValidity"
            ? graphQueryHolds(item, item.query, world)
            : undefined;
        return value ? { valid: true } : { valid: false, messageRu: "Соответствие не сохраняет требуемые связи и порядок ролей." };
    }
    if (world.kind === "transformWorld") {
        return item.domain.kind === "boundedTransformations"
            ? { valid: true }
            : { valid: false, messageRu: "Модель преобразования не соответствует области задания." };
    }
    return { valid: false, messageRu: "Представленная модель не соответствует типу задания." };
}

export function verifySubmittedWorld(item: ReasoningItem, world: SemanticWorld): WorldVerification {
    if (world.kind === "membershipOrderWorld" || world.kind === "temporalSpatialWorld" || world.kind === "mappingQuantityWorld") {
        const problem = reconstructCoupledFrameProblem(item);
        if (!problem) return { valid: false, messageRu: "Связанная модель не соответствует публичному контракту задания." };
        const checked = validateCoupledWorld(problem, world);
        return checked.valid
            ? { valid: true, queryHolds: checked.queryValue }
            : { valid: false, violatedPremiseId: checked.violatedPremiseId, messageRu: "Связанная модель нарушает объявленные ограничения или посылку." };
    }
    const premises = submittedWorldSatisfiesPremises(item, world);
    if (!premises.valid) return premises;
    const queryHolds = evaluateQueryInWorld(item, world);
    return queryHolds === undefined
        ? { valid: false, messageRu: "Для этого типа запроса конструктивный ответ не определён." }
        : { valid: true, queryHolds };
}
