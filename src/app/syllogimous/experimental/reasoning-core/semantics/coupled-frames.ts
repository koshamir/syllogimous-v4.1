import {
    BridgePremise,
    ContainmentPremise,
    CoupledFrameSpec,
    CoupledFrameWorld,
    DomainSpec,
    EntityId,
    GraphEdgePremise,
    InferenceClassification,
    IntervalPremise,
    MappingPairPremise,
    MappingQuantityWorld,
    MembershipOrderWorld,
    OrderPremise,
    PremiseNode,
    RationalPremise,
    RationalValue,
    ReasoningFamily,
    ReasoningItem,
    SemanticCertificate,
    TransformationPremise,
    TemporalSpatialWorld,
    TransformOperator,
    VerifiedSupport,
} from "../models/semantic.models";
export { CoupledFrameWorld, MembershipOrderWorld, TemporalSpatialWorld, MappingQuantityWorld } from "../models/semantic.models";
import { enumerateMinimalSupports } from "../certificates/exhaustive-supports";
import { evaluateOrderAtom } from "./order";
import { evaluateIntervalAtom } from "./interval";
import { applyTransformationSequence, GridPoint } from "./transformations";
import { compareRational, rationalEquals } from "./rational";

type MembershipOrderPremise = ContainmentPremise | OrderPremise | BridgePremise;
type TemporalSpatialPremise = IntervalPremise | TransformationPremise | BridgePremise;
type MappingQuantityPremise = MappingPairPremise | RationalPremise | BridgePremise;

export interface MembershipOrderProblem {
    kind: "membershipOrder";
    componentFamilies: ["hierarchy", "order"];
    premises: readonly MembershipOrderPremise[];
    objectIds: readonly EntityId[];
    classId: EntityId;
    focusTargetId: EntityId;
    positionDomain: Extract<DomainSpec, { kind: "boundedPositions" }>;
    queryPropositionId: string;
}

export interface TemporalSpatialProblem {
    kind: "temporalSpatial";
    componentFamilies: ["temporalIntervals", "transformations"];
    premises: readonly TemporalSpatialPremise[];
    intervalIds: readonly EntityId[];
    intervalDomain: Extract<DomainSpec, { kind: "boundedIntervals" }>;
    transformDomain: Extract<DomainSpec, { kind: "boundedTransformations" }>;
    initialPoint: GridPoint;
    expectedPoint: GridPoint;
    recipeOperators: readonly TransformOperator[];
    activationPremiseId?: string;
    recipePremiseId?: string;
    queryPropositionId: string;
}

export interface MappingQuantityProblem {
    kind: "mappingQuantity";
    componentFamilies: ["analogy", "proportional"];
    premises: readonly MappingQuantityPremise[];
    sourceIds: readonly EntityId[];
    targetIds: readonly EntityId[];
    selectedSourceRoleId: EntityId;
    threshold: RationalValue;
    quantityCandidates: readonly RationalValue[];
    quantityFacts: readonly { premiseId: string; targetId: EntityId }[];
    quantityEntities: readonly { entityId: EntityId; targetId: EntityId }[];
    queryPropositionId: string;
}

export type CoupledFrameProblem =
    | MembershipOrderProblem
    | TemporalSpatialProblem
    | MappingQuantityProblem;

/** Serialises all parameters needed to repeat solving after export. */
export function coupledFrameSpec(problem: CoupledFrameProblem): CoupledFrameSpec {
    switch (problem.kind) {
        case "membershipOrder": return {
            kind: problem.kind, componentFamilies: problem.componentFamilies,
            objectIds: [...problem.objectIds], classId: problem.classId,
            focusTargetId: problem.focusTargetId, positionDomain: problem.positionDomain,
            queryPropositionId: problem.queryPropositionId,
        };
        case "temporalSpatial": {
            const activation = problem.premises.find(premise => premise.kind === "interval"
                && (!problem.activationPremiseId || premise.id === problem.activationPremiseId));
            const recipe = problem.premises.find(premise => premise.kind === "transformation"
                && (!problem.recipePremiseId || premise.id === problem.recipePremiseId));
            if (!activation || !recipe) throw new Error("Связанный временной фрагмент не содержит объявленного условия или рецепта.");
            return {
                kind: problem.kind, componentFamilies: problem.componentFamilies,
                intervalIds: [...problem.intervalIds], intervalDomain: problem.intervalDomain,
                transformDomain: problem.transformDomain, initialPoint: [...problem.initialPoint],
                expectedPoint: [...problem.expectedPoint], recipeOperators: [...problem.recipeOperators],
                activationPremiseId: activation.id, recipePremiseId: recipe.id,
                queryPropositionId: problem.queryPropositionId,
            };
        }
        case "mappingQuantity": return {
            kind: problem.kind, componentFamilies: problem.componentFamilies,
            sourceIds: [...problem.sourceIds], targetIds: [...problem.targetIds],
            selectedSourceRoleId: problem.selectedSourceRoleId, threshold: problem.threshold,
            quantityCandidates: [...problem.quantityCandidates], quantityFacts: [...problem.quantityFacts],
            quantityEntities: [...problem.quantityEntities], queryPropositionId: problem.queryPropositionId,
        };
    }
}

/** Reconstructs bridge meaning from the full public AST, not presentation text. */
export function reconstructCoupledFrameProblem(item: ReasoningItem): CoupledFrameProblem {
    const spec = item.coupledFrameSpec;
    if (!spec || item.family !== "coupledFrames" || item.query.kind !== "proposition"
        || item.query.propositionId !== spec.queryPropositionId) {
        throw new Error("Связанный запрос не соответствует опубликованному семантическому контракту.");
    }
    if (item.domain.kind !== "composite" || spec.componentFamilies.some((family, index) => item.componentFamilies[index] !== family)) {
        throw new Error("Компоненты связанного мира не совпадают с опубликованным доменом.");
    }
    const includesDomain = (domain: DomainSpec) => item.domain.kind === "composite"
        && item.domain.parts.some(part => JSON.stringify(part) === JSON.stringify(domain));
    if ((spec.kind === "membershipOrder" && !includesDomain(spec.positionDomain))
        || (spec.kind === "temporalSpatial" && (!includesDomain(spec.intervalDomain) || !includesDomain(spec.transformDomain)))) {
        throw new Error("Границы связанного мира не совпадают с объявленными доменами.");
    }
    const entities = new Map(item.entities.map(entity => [entity.id, entity]));
    const allKnown = (ids: readonly string[], sorts: readonly string[]) => new Set(ids).size === ids.length
        && ids.every(entityId => sorts.includes(entities.get(entityId)?.sort ?? ""));
    switch (spec.kind) {
        case "membershipOrder": {
            const membershipDomain = item.domain.parts.find(part => part.kind === "boundedMembership");
            if (!allKnown(spec.objectIds, ["object", "person"]) || !spec.objectIds.includes(spec.focusTargetId)
                || entities.get(spec.classId)?.sort !== "class"
                || membershipDomain?.kind !== "boundedMembership"
                || membershipDomain.objectIds.length !== spec.objectIds.length
                || spec.objectIds.some(entityId => !membershipDomain.objectIds.includes(entityId))
                || membershipDomain.classIds.length !== 1 || membershipDomain.classIds[0] !== spec.classId) {
                throw new Error("Роли и классы связанного членства не совпадают с конечным доменом.");
            }
            const premises = item.premises.filter((premise): premise is MembershipOrderPremise =>
                premise.kind === "containment" || premise.kind === "order" || premise.kind === "bridge");
            if (premises.length !== item.premises.length) throw new Error("Неподдерживаемая посылка членства и порядка.");
            return { ...spec, premises };
        }
        case "temporalSpatial": {
            if (!allKnown(spec.intervalIds, ["interval"])) throw new Error("Временное связующее правило использует необъявленные интервалы.");
            const premises = item.premises.filter((premise): premise is TemporalSpatialPremise =>
                premise.kind === "interval" || premise.kind === "transformation" || premise.kind === "bridge");
            if (premises.length !== item.premises.length) throw new Error("Неподдерживаемая временно-пространственная посылка.");
            if (!premises.some(premise => premise.kind === "interval" && premise.id === spec.activationPremiseId)
                || !premises.some(premise => premise.kind === "transformation" && premise.id === spec.recipePremiseId)) {
                throw new Error("Связующее правило ссылается на необъявленное условие или рецепт.");
            }
            return { ...spec, premises };
        }
        case "mappingQuantity": {
            const mappingDomain = item.domain.parts.find(part => part.kind === "boundedStructuralMapping");
            if (!allKnown(spec.sourceIds, ["object", "graphNode"]) || !allKnown(spec.targetIds, ["object", "graphNode"])
                || spec.sourceIds.some(entityId => spec.targetIds.includes(entityId)) || !spec.sourceIds.includes(spec.selectedSourceRoleId)
                || mappingDomain?.kind !== "boundedStructuralMapping" || mappingDomain.mappingContract !== "bijection"
                || mappingDomain.sourceIds.length !== spec.sourceIds.length || mappingDomain.targetIds.length !== spec.targetIds.length
                || spec.sourceIds.some(entityId => !mappingDomain.sourceIds.includes(entityId))
                || spec.targetIds.some(entityId => !mappingDomain.targetIds.includes(entityId))
                || spec.quantityFacts.some(fact => !spec.targetIds.includes(fact.targetId)
                    || !item.premises.some(premise => premise.kind === "rational" && premise.id === fact.premiseId))
                || spec.quantityEntities.some(role => !spec.targetIds.includes(role.targetId) || entities.get(role.entityId)?.sort !== "number")) {
                throw new Error("Количественные роли не совпадают с опубликованным доменом отображения.");
            }
            const premises = item.premises.filter((premise): premise is MappingQuantityPremise =>
                premise.kind === "mappingPair" || premise.kind === "rational" || premise.kind === "bridge");
            if (premises.length !== item.premises.length) throw new Error("Неподдерживаемая количественная посылка отображения.");
            return { ...spec, premises };
        }
    }
}

export interface CouplingCertificate {
    accepted: boolean;
    componentFamilies: [ReasoningFamily, ReasoningFamily];
    bridgePremiseIds: string[];
    sharedEntityIds: EntityId[];
    exactMinimalSupports: boolean;
    everyMinimalSupportRequiresBridge: boolean;
    reasonRu: string;
}

export interface CoupledSolveResult {
    certificate: SemanticCertificate;
    worlds: CoupledFrameWorld[];
    queryWorld?: CoupledFrameWorld;
    negatedQueryWorld?: CoupledFrameWorld;
    coupling: CouplingCertificate;
}

function permutations<T>(values: readonly T[]): T[][] {
    if (!values.length) return [[]];
    const result: T[][] = [];
    values.forEach((value, index) => {
        const rest = [...values.slice(0, index), ...values.slice(index + 1)];
        for (const suffix of permutations(rest)) result.push([value, ...suffix]);
    });
    return result;
}

function membershipOrderWorlds(problem: MembershipOrderProblem): MembershipOrderWorld[] {
    if (problem.objectIds.length > 7 || problem.positionDomain.allowCoincidence) {
        throw new Error("Точный связанный решатель поддерживает не более семи объектов на различных позициях.");
    }
    const values = Array.from({ length: problem.positionDomain.size }, (_, index) => index);
    if (values.length !== problem.objectIds.length) {
        throw new Error("Для этой связанной задачи число позиций должно совпадать с числом объектов.");
    }
    const worlds: MembershipOrderWorld[] = [];
    for (let mask = 0; mask < 2 ** problem.objectIds.length; mask++) {
        const memberObjectIds = problem.objectIds.filter((_, index) => (mask & (1 << index)) !== 0);
        for (const order of permutations(values)) {
            const positions = problem.objectIds.map((entityId, index) => ({ entityId, value: order[index] }));
            for (const focusObjectId of problem.objectIds) {
                worlds.push({ kind: "membershipOrderWorld", memberObjectIds, positions, focusObjectId });
            }
        }
    }
    return worlds;
}

function membershipOrderPremiseHolds(
    problem: MembershipOrderProblem,
    premise: MembershipOrderPremise,
    world: MembershipOrderWorld,
): boolean {
    if (premise.kind === "containment") {
        if (premise.classId !== problem.classId || premise.relation === "includedIn") return false;
        const isMember = world.memberObjectIds.includes(premise.subject);
        return premise.relation === "memberOf" ? isMember : !isMember;
    }
    if (premise.kind === "order") {
        const evaluated = evaluateOrderAtom(
            premise,
            { kind: "positionWorld", positions: world.positions },
            problem.objectIds,
            problem.positionDomain,
        );
        return evaluated.ok && evaluated.holds;
    }
    if (premise.bridgeType !== "membershipSelectsOrder"
        || premise.fromEntity !== problem.classId
        || !problem.objectIds.includes(premise.toEntity)) return false;
    // Explicit monotonic conditional bridge: membership activates the role binding.
    return !world.memberObjectIds.includes(premise.toEntity)
        || world.focusObjectId === premise.toEntity;
}

function membershipOrderQueryHolds(problem: MembershipOrderProblem, world: MembershipOrderWorld): boolean {
    const positions = new Map(world.positions.map(entry => [entry.entityId, entry.value]));
    return positions.get(world.focusObjectId)! < positions.get(problem.focusTargetId)!;
}

function allIntervals(domain: Extract<DomainSpec, { kind: "boundedIntervals" }>): Array<{ start: number; end: number }> {
    const intervals: Array<{ start: number; end: number }> = [];
    for (let start = domain.endpointMin; start < domain.endpointMax; start++) {
        for (let end = start + 1; end <= domain.endpointMax; end++) intervals.push({ start, end });
    }
    return intervals;
}

function temporalSpatialWorlds(problem: TemporalSpatialProblem): TemporalSpatialWorld[] {
    if (problem.intervalIds.length > 3 || problem.recipeOperators.length < 2) {
        throw new Error("Точная временно-пространственная задача требует 1–3 интервала и не менее двух рецептов.");
    }
    const intervalValues = allIntervals(problem.intervalDomain);
    const assignments = problem.intervalIds.reduce<Array<Array<{ entityId: EntityId; start: number; end: number }>>>(
        (partial, entityId) => partial.flatMap(entries => intervalValues.map(value => [...entries, { entityId, ...value }])),
        [[]],
    );
    const worlds: TemporalSpatialWorld[] = [];
    for (const intervals of assignments) {
        for (const recipeOperator of problem.recipeOperators) {
            for (let x = 0; x < problem.transformDomain.width; x++) {
                for (let y = 0; y < problem.transformDomain.height; y++) {
                    worlds.push({
                        kind: "temporalSpatialWorld",
                        intervals,
                        recipeOperator,
                        outputPoint: [x, y],
                    });
                }
            }
        }
    }
    return worlds;
}

function temporalSpatialPremiseHolds(
    problem: TemporalSpatialProblem,
    premise: TemporalSpatialPremise,
    world: TemporalSpatialWorld,
): boolean {
    if (premise.kind === "interval") {
        const evaluated = evaluateIntervalAtom(
            premise,
            { kind: "intervalWorld", intervals: world.intervals },
            problem.intervalIds,
            problem.intervalDomain,
        );
        return evaluated.ok && evaluated.holds;
    }
    if (premise.kind === "transformation") return world.recipeOperator === premise.operator;
    if (premise.bridgeType !== "temporalSelectsTransformation") return false;
    const temporal = problem.premises.find((candidate): candidate is IntervalPremise => candidate.kind === "interval"
        && (!problem.activationPremiseId || candidate.id === problem.activationPremiseId));
    const transformation = problem.premises.find(
        (candidate): candidate is TransformationPremise => candidate.kind === "transformation"
            && (!problem.recipePremiseId || candidate.id === problem.recipePremiseId),
    );
    if (!temporal || !transformation
        || premise.fromEntity !== temporal.left
        || premise.toEntity !== transformation.outputState) return false;
    const temporalHolds = temporalSpatialPremiseHolds(problem, temporal, world);
    if (!temporalHolds) return true;
    const applied = applyTransformationSequence(problem.initialPoint, [world.recipeOperator], problem.transformDomain);
    return applied.ok
        && applied.value.point[0] === world.outputPoint[0]
        && applied.value.point[1] === world.outputPoint[1];
}

function temporalSpatialQueryHolds(problem: TemporalSpatialProblem, world: TemporalSpatialWorld): boolean {
    return world.outputPoint[0] === problem.expectedPoint[0]
        && world.outputPoint[1] === problem.expectedPoint[1];
}

function mappingWorlds(problem: MappingQuantityProblem): MappingQuantityWorld[] {
    if (problem.sourceIds.length !== problem.targetIds.length || problem.sourceIds.length > 7) {
        throw new Error("Точный количественный решатель требует равных наборов не более чем из семи ролей.");
    }
    const mappings = permutations(problem.targetIds).map(order =>
        problem.sourceIds.map((source, index) => ({ source, target: order[index] })));
    const assignments = problem.targetIds.reduce<Array<Array<{ targetId: EntityId; value: RationalValue }>>>(
        (partial, targetId) => partial.flatMap(entries => problem.quantityCandidates.map(value => [
            ...entries,
            { targetId, value },
        ])),
        [[]],
    );
    return mappings.flatMap(mapping => assignments.flatMap(quantities => problem.targetIds.map(selectedTargetId => ({
        kind: "mappingQuantityWorld" as const,
        mapping,
        quantities,
        selectedTargetId,
    }))));
}

function mappingQuantityPremiseHolds(
    problem: MappingQuantityProblem,
    premise: MappingQuantityPremise,
    world: MappingQuantityWorld,
): boolean {
    if (premise.kind === "mappingPair") {
        return world.mapping.some(pair => pair.source === premise.source && pair.target === premise.target);
    }
    if (premise.kind === "rational") {
        const quantityFact = problem.quantityFacts.find(fact => fact.premiseId === premise.id);
        const comparison = compareRational(premise.left, premise.right);
        const arithmeticHolds = premise.relation === "ratioGreater"
            ? comparison > 0
            : premise.relation === "ratioLess"
                ? comparison < 0
                : premise.relation === "ratioEqual"
                    ? comparison === 0
                    : premise.result !== undefined && rationalEquals(premise.result, premise.right);
        if (!quantityFact) return arithmeticHolds;
        const actual = world.quantities.find(entry => entry.targetId === quantityFact.targetId)?.value;
        return actual !== undefined && rationalEquals(actual, premise.left) && arithmeticHolds;
    }
    if (premise.bridgeType !== "mappingSelectsQuantity"
        || premise.fromEntity !== problem.selectedSourceRoleId) return false;
    const bridgedTarget = problem.quantityEntities.find(entry => entry.entityId === premise.toEntity)?.targetId;
    if (!bridgedTarget) return false;
    const mapped = world.mapping.find(pair => pair.source === problem.selectedSourceRoleId)?.target;
    // The bridge is an explicit conditional: this quantity role is selected
    // only when the structural mapping reaches its associated target.
    return mapped !== bridgedTarget || world.selectedTargetId === mapped;
}

function mappingQuantityQueryHolds(problem: MappingQuantityProblem, world: MappingQuantityWorld): boolean {
    const value = world.quantities.find(entry => entry.targetId === world.selectedTargetId)?.value;
    return value !== undefined && compareRational(value, problem.threshold) > 0;
}

function enumerateWorlds(problem: CoupledFrameProblem): CoupledFrameWorld[] {
    // Conservative explicit memory ceiling; world arrays are never unbounded.
    const factorial = (value: number) => Array.from({ length: value }, (_, index) => index + 1)
        .reduce((product, next) => product * next, 1);
    let count: number;
    if (problem.kind === "membershipOrder") {
        if (!Number.isSafeInteger(problem.positionDomain.size) || problem.positionDomain.size < 1
            || problem.positionDomain.cyclic || problem.objectIds.length > 7) throw new Error("Некорректный конечный домен членства и порядка.");
        count = 2 ** problem.objectIds.length * factorial(problem.objectIds.length) * problem.objectIds.length;
    } else if (problem.kind === "temporalSpatial") {
        const span = problem.intervalDomain.endpointMax - problem.intervalDomain.endpointMin;
        if (!Number.isSafeInteger(problem.intervalDomain.endpointMin) || !Number.isSafeInteger(problem.intervalDomain.endpointMax)
            || !Number.isSafeInteger(span) || span < 1 || span > 8
            || !Number.isSafeInteger(problem.transformDomain.width) || !Number.isSafeInteger(problem.transformDomain.height)
            || problem.transformDomain.width < 1 || problem.transformDomain.height < 1
            || problem.transformDomain.width > 8 || problem.transformDomain.height > 8) throw new Error("Некорректный временно-пространственный домен.");
        count = (span * (span + 1) / 2) ** problem.intervalIds.length
            * problem.recipeOperators.length * problem.transformDomain.width * problem.transformDomain.height;
    } else {
        if (problem.sourceIds.length > 7 || problem.targetIds.length !== problem.sourceIds.length || !problem.quantityCandidates.length) throw new Error("Некорректный количественный домен отображения.");
        count = factorial(problem.targetIds.length) * problem.quantityCandidates.length ** problem.targetIds.length * problem.targetIds.length;
    }
    if (!Number.isFinite(count) || count > 200000) throw new Error("Связанный мир превышает лимит 200 000 состояний; цель не была упрощена.");
    switch (problem.kind) {
        case "membershipOrder": return membershipOrderWorlds(problem);
        case "temporalSpatial": return temporalSpatialWorlds(problem);
        case "mappingQuantity": return mappingWorlds(problem);
    }
}

function premiseHolds(problem: CoupledFrameProblem, premise: PremiseNode, world: CoupledFrameWorld): boolean {
    switch (problem.kind) {
        case "membershipOrder":
            return world.kind === "membershipOrderWorld"
                && (premise.kind === "containment" || premise.kind === "order" || premise.kind === "bridge")
                && membershipOrderPremiseHolds(problem, premise, world);
        case "temporalSpatial":
            return world.kind === "temporalSpatialWorld"
                && (premise.kind === "interval" || premise.kind === "transformation" || premise.kind === "bridge")
                && temporalSpatialPremiseHolds(problem, premise, world);
        case "mappingQuantity":
            return world.kind === "mappingQuantityWorld"
                && (premise.kind === "mappingPair" || premise.kind === "rational" || premise.kind === "bridge")
                && mappingQuantityPremiseHolds(problem, premise, world);
    }
}

function queryHolds(problem: CoupledFrameProblem, world: CoupledFrameWorld): boolean {
    switch (problem.kind) {
        case "membershipOrder": return world.kind === "membershipOrderWorld" && membershipOrderQueryHolds(problem, world);
        case "temporalSpatial": return world.kind === "temporalSpatialWorld" && temporalSpatialQueryHolds(problem, world);
        case "mappingQuantity": return world.kind === "mappingQuantityWorld" && mappingQuantityQueryHolds(problem, world);
    }
}

function classifyWorlds(problem: CoupledFrameProblem, worlds: readonly CoupledFrameWorld[]): InferenceClassification | undefined {
    if (!worlds.length) return undefined;
    const hasQuery = worlds.some(world => queryHolds(problem, world));
    const hasNegatedQuery = worlds.some(world => !queryHolds(problem, world));
    return !hasNegatedQuery ? "entailed" : !hasQuery ? "refuted" : "underdetermined";
}

export function certifyCoupledStructure(
    premises: readonly PremiseNode[],
    componentFamilies: [ReasoningFamily, ReasoningFamily],
    supports: readonly VerifiedSupport[],
    sharedEntityIds: readonly EntityId[],
): CouplingCertificate {
    const bridges = premises.filter((premise): premise is BridgePremise => premise.kind === "bridge");
    const exactMinimalSupports = supports.length > 0
        && supports.every(support => support.minimal && support.status === "exact");
    const matchingBridges = bridges.filter(bridge =>
        bridge.componentFamilies[0] === componentFamilies[0]
        && bridge.componentFamilies[1] === componentFamilies[1]);
    const everyMinimalSupportRequiresBridge = exactMinimalSupports
        && matchingBridges.length > 0
        && supports.every(support => matchingBridges.some(bridge => support.premiseIds.includes(bridge.id)));
    const accepted = componentFamilies[0] !== componentFamilies[1]
        && sharedEntityIds.length > 0
        && everyMinimalSupportRequiresBridge;
    return {
        accepted,
        componentFamilies,
        bridgePremiseIds: matchingBridges.map(bridge => bridge.id),
        sharedEntityIds: [...sharedEntityIds],
        exactMinimalSupports,
        everyMinimalSupportRequiresBridge,
        reasonRu: accepted
            ? "Каждая точная минимальная опора использует межсистемное связующее правило и общую роль."
            : bridges.length === 0
                ? "Независимые подзадачи без связующего правила не считаются связанной интеграцией."
                : !exactMinimalSupports
                    ? "Необходимость связи не подтверждена точным перебором минимальных опор."
                    : "Хотя бы одна минимальная опора обходит межсистемную связь или не содержит общей роли.",
    };
}

function sharedIds(problem: CoupledFrameProblem): EntityId[] {
    switch (problem.kind) {
        case "membershipOrder": return problem.premises.filter((premise): premise is BridgePremise =>
            premise.kind === "bridge" && premise.bridgeType === "membershipSelectsOrder")
            .map(premise => premise.toEntity);
        case "temporalSpatial": return [problem.intervalIds[0]];
        case "mappingQuantity": return [problem.selectedSourceRoleId];
    }
}

export function solveCoupledFrame(
    problem: CoupledFrameProblem,
    activePremises: readonly PremiseNode[] = problem.premises,
): CoupledSolveResult {
    // The full AST defines an embedded bridge condition; removing its separate
    // assertion does not erase that condition from the bridge's meaning.
    const premises: readonly PremiseNode[] = activePremises;
    const universe = enumerateWorlds(problem);
    const cache = new Map<string, CoupledFrameWorld[]>();
    const worldsFor = (subset: readonly PremiseNode[]): CoupledFrameWorld[] => {
        const key = subset.map(premise => premise.id).sort().join("|");
        const cached = cache.get(key);
        if (cached) return cached;
        const worlds = universe.filter(world => subset.every(premise => premiseHolds(problem, premise, world)));
        cache.set(key, worlds);
        return worlds;
    };
    const worlds = worldsFor(premises);
    const classification = classifyWorlds(problem, worlds);
    const queryWorld = worlds.find(world => queryHolds(problem, world));
    const negatedQueryWorld = worlds.find(world => !queryHolds(problem, world));
    const supportAnalysis = classification
        ? enumerateMinimalSupports(
            premises,
            classification,
            subset => {
                const subsetWorlds = worldsFor(subset);
                return { satisfiable: subsetWorlds.length > 0, classification: classifyWorlds(problem, subsetWorlds) };
            },
        )
        : { supports: [], necessaryPremiseIds: [], status: "unavailable" as const };
    const coupling = certifyCoupledStructure(
        premises,
        problem.componentFamilies,
        supportAnalysis.supports,
        sharedIds(problem),
    );
    const certificate: SemanticCertificate = {
        premisesSatisfiable: worlds.length > 0,
        classification,
        solverCompleteness: "boundedComplete",
        finiteDomainAssumptions: [
            "Перебраны все состояния явно объявленных конечных компонент и их общей связанной роли.",
            "Минимальные опоры относятся только к указанной здесь конечной семантике.",
        ],
        queryWitness: queryWorld,
        negatedQueryWitness: negatedQueryWorld,
        supports: supportAnalysis.supports,
        necessaryPremiseIds: classification === "underdetermined" ? [] : supportAnalysis.necessaryPremiseIds,
        contrastiveRelevantPremiseIds: [],
        verification: {
            premisesChecked: true,
            witnessesChecked: true,
            supportsChecked: supportAnalysis.status,
            independentOracleChecked: null,
        },
    };
    return { certificate, worlds, queryWorld, negatedQueryWorld, coupling };
}

/** Rechecks a custom witness against every premise and the query polarity. */
export function validateCoupledWorld(
    problem: CoupledFrameProblem,
    world: CoupledFrameWorld,
    expectedQueryValue?: boolean,
): { valid: boolean; queryValue: boolean; violatedPremiseId?: string } {
    const uniqueExact = (actual: readonly string[], expected: readonly string[]) =>
        actual.length === expected.length && new Set(actual).size === actual.length
        && actual.every(value => expected.includes(value));
    let domainValid = false;
    switch (problem.kind) {
        case "membershipOrder":
            domainValid = world.kind === "membershipOrderWorld"
                && uniqueExact(world.positions.map(entry => entry.entityId), problem.objectIds)
                && new Set(world.positions.map(entry => entry.value)).size === world.positions.length
                && world.positions.every(entry => Number.isSafeInteger(entry.value) && entry.value >= 0 && entry.value < problem.positionDomain.size)
                && problem.objectIds.includes(world.focusObjectId)
                && new Set(world.memberObjectIds).size === world.memberObjectIds.length
                && world.memberObjectIds.every(entityId => problem.objectIds.includes(entityId));
            break;
        case "temporalSpatial":
            domainValid = world.kind === "temporalSpatialWorld"
                && uniqueExact(world.intervals.map(entry => entry.entityId), problem.intervalIds)
                && world.intervals.every(entry => Number.isSafeInteger(entry.start) && Number.isSafeInteger(entry.end)
                    && entry.start >= problem.intervalDomain.endpointMin && entry.end <= problem.intervalDomain.endpointMax && entry.start < entry.end)
                && problem.recipeOperators.includes(world.recipeOperator)
                && Number.isSafeInteger(world.outputPoint[0]) && Number.isSafeInteger(world.outputPoint[1])
                && world.outputPoint[0] >= 0 && world.outputPoint[0] < problem.transformDomain.width
                && world.outputPoint[1] >= 0 && world.outputPoint[1] < problem.transformDomain.height;
            break;
        case "mappingQuantity":
            domainValid = world.kind === "mappingQuantityWorld"
                && uniqueExact(world.mapping.map(pair => pair.source), problem.sourceIds)
                && uniqueExact(world.mapping.map(pair => pair.target), problem.targetIds)
                && uniqueExact(world.quantities.map(entry => entry.targetId), problem.targetIds)
                && world.quantities.every(entry => problem.quantityCandidates.some(value => rationalEquals(entry.value, value)))
                && problem.targetIds.includes(world.selectedTargetId);
            break;
    }
    if (!domainValid) return { valid: false, queryValue: false };
    const premises: readonly PremiseNode[] = problem.premises;
    const failed = premises.find(premise => !premiseHolds(problem, premise, world));
    const queryValue = queryHolds(problem, world);
    return {
        valid: !failed && (expectedQueryValue === undefined || expectedQueryValue === queryValue),
        queryValue,
        violatedPremiseId: failed?.id,
    };
}

/** Keeps independent legacy Boolean composition explicitly outside coupled integration. */
export function rejectIndependentBooleanComposition(
    premises: readonly PremiseNode[],
    componentFamilies: [ReasoningFamily, ReasoningFamily],
): CouplingCertificate {
    return certifyCoupledStructure(premises, componentFamilies, [], []);
}

// Imported here only to keep the supported premise union explicit at compile time.
export type CoupledGraphEvidence = GraphEdgePremise;
