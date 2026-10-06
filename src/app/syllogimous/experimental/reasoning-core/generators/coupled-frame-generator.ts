import {
    BridgePremise,
    ComplexityTarget,
    DomainSpec,
    EntitySpec,
    GenerationRequest,
    GenerationResult,
    IntervalPremise,
    MappingPairPremise,
    OrderPremise,
    PremiseNode,
    RationalPremise,
    ResponseSpec,
    TransformationPremise,
} from "../models/semantic.models";
import { rational } from "../semantics/rational";
import {
    CoupledFrameProblem,
    coupledFrameSpec,
    MappingQuantityProblem,
    MembershipOrderProblem,
    solveCoupledFrame,
    TemporalSpatialProblem,
} from "../semantics/coupled-frames";
import { createRandomStreams } from "./seeded-random";
import {
    DEFAULT_GENERATION_CONTROL,
    GenerationControl,
    generationBudgetFailure,
    responseSpecFor,
    targetAllowsPremiseCount,
} from "./generator-utils";
import { buildStructuralItem } from "./structural-item-builder";
import { structuralFingerprint } from "../certificates/canonical";

export type CoupledFrameKind = CoupledFrameProblem["kind"];

interface CoupledTemplate {
    problem: CoupledFrameProblem;
    domain: Extract<DomainSpec, { kind: "composite" }>;
    entities: EntitySpec[];
    queryText: string;
}

function bridge(
    id: string,
    bridgeType: BridgePremise["bridgeType"],
    fromEntity: string,
    toEntity: string,
    componentFamilies: BridgePremise["componentFamilies"],
): BridgePremise {
    return { kind: "bridge", id, bridgeType, fromEntity, toEntity, componentFamilies };
}

function membershipOrderTemplate(extraPremises: number): CoupledTemplate {
    const member = {
        kind: "containment" as const,
        id: "cm-member",
        relation: "memberOf" as const,
        subject: "token-focus",
        classId: "selected-class",
    };
    const order: OrderPremise = {
        kind: "order",
        id: "cm-order",
        relation: "leftOf",
        args: ["token-focus", "token-anchor"],
    };
    const link = bridge(
        "cm-bridge",
        "membershipSelectsOrder",
        "selected-class",
        "token-focus",
        ["hierarchy", "order"],
    );
    const premises: MembershipOrderProblem["premises"][number][] = [member, order, link];
    for (let index = 0; index < extraPremises; index++) {
        premises.push({
            kind: "order",
            id: `cm-d${index + 1}`,
            relation: "equal",
            args: ["token-spare", "token-spare"],
        });
    }
    const positionDomain: Extract<DomainSpec, { kind: "boundedPositions" }> = {
        kind: "boundedPositions",
        closure: "closedFiniteDomain",
        size: 3,
        cyclic: false,
        allowCoincidence: false,
    };
    return {
        problem: {
            kind: "membershipOrder",
            componentFamilies: ["hierarchy", "order"],
            premises,
            objectIds: ["token-focus", "token-anchor", "token-spare"],
            classId: "selected-class",
            focusTargetId: "token-anchor",
            positionDomain,
            queryPropositionId: "выбранный по принадлежности объект находится левее ориентира",
        },
        domain: {
            kind: "composite",
            closure: "productOfDeclaredDomains",
            parts: [
                {
                    kind: "boundedMembership",
                    closure: "listedObjectsAndClassesOnly",
                    objectIds: ["token-focus", "token-anchor", "token-spare"],
                    classIds: ["selected-class"],
                },
                positionDomain,
            ],
        },
        entities: [
            { id: "token-focus", label: "жетон «Север»", sort: "object" },
            { id: "token-anchor", label: "жетон «Маяк»", sort: "object" },
            { id: "token-spare", label: "жетон «Река»", sort: "object" },
            { id: "selected-class", label: "выбранные жетоны", sort: "class" },
        ],
        queryText: "выбранный по принадлежности объект находится левее ориентира",
    };
}

function temporalSpatialTemplate(extraPremises: number): CoupledTemplate {
    const temporal: IntervalPremise = {
        kind: "interval",
        id: "ct-time",
        relation: "before",
        left: "phase-before",
        right: "phase-after",
    };
    const transformation: TransformationPremise = {
        kind: "transformation",
        id: "ct-recipe",
        operator: "rotate90",
        inputState: "marker-start",
        outputState: "marker-output",
        order: 1,
    };
    const link = bridge(
        "ct-bridge",
        "temporalSelectsTransformation",
        "phase-before",
        "marker-output",
        ["temporalIntervals", "transformations"],
    );
    const premises: TemporalSpatialProblem["premises"][number][] = [temporal, transformation, link];
    for (let index = 0; index < extraPremises; index++) {
        premises.push({
            kind: "interval",
            id: `ct-d${index + 1}`,
            relation: "equals",
            left: "phase-after",
            right: "phase-after",
        });
    }
    const intervalDomain: Extract<DomainSpec, { kind: "boundedIntervals" }> = {
        kind: "boundedIntervals",
        closure: "closedFiniteDomain",
        endpointMin: 0,
        endpointMax: 4,
    };
    const transformDomain: Extract<DomainSpec, { kind: "boundedTransformations" }> = {
        kind: "boundedTransformations",
        closure: "listedStatesOnly",
        width: 3,
        height: 3,
        frame: "fixedAxes",
    };
    return {
        problem: {
            kind: "temporalSpatial",
            componentFamilies: ["temporalIntervals", "transformations"],
            premises,
            intervalIds: ["phase-before", "phase-after"],
            intervalDomain,
            transformDomain,
            initialPoint: [0, 1],
            expectedPoint: [1, 0],
            recipeOperators: ["rotate90", "reflectVertical"],
            queryPropositionId: "выходная отметка совпадает с точкой (1; 0)",
        },
        domain: {
            kind: "composite",
            closure: "productOfDeclaredDomains",
            parts: [intervalDomain, transformDomain],
        },
        entities: [
            { id: "phase-before", label: "этап «Подготовка»", sort: "interval" },
            { id: "phase-after", label: "этап «Проверка»", sort: "interval" },
            { id: "marker-start", label: "исходная отметка", sort: "position" },
            { id: "marker-output", label: "выходная отметка", sort: "position" },
        ],
        queryText: "выходная отметка совпадает с точкой (1; 0)",
    };
}

function mappingQuantityTemplate(extraPremises: number): CoupledTemplate {
    const mapping: MappingPairPremise = {
        kind: "mappingPair",
        id: "cq-map",
        source: "source-key-role",
        target: "target-high",
    };
    const quantity: RationalPremise = {
        kind: "rational",
        id: "cq-quantity",
        relation: "ratioGreater",
        left: rational(3),
        right: rational(2),
        units: "балла",
    };
    const link = bridge(
        "cq-bridge",
        "mappingSelectsQuantity",
        "source-key-role",
        "quantity-high",
        ["analogy", "proportional"],
    );
    const premises: MappingQuantityProblem["premises"][number][] = [mapping, quantity, link];
    for (let index = 0; index < extraPremises; index++) {
        premises.push({
            kind: "rational",
            id: `cq-d${index + 1}`,
            relation: "ratioEqual",
            left: rational(1),
            right: rational(1),
            units: "балл",
        });
    }
    return {
        problem: {
            kind: "mappingQuantity",
            componentFamilies: ["analogy", "proportional"],
            premises,
            sourceIds: ["source-key-role", "source-other-role"],
            targetIds: ["target-high", "target-low"],
            selectedSourceRoleId: "source-key-role",
            threshold: rational(2),
            quantityCandidates: [rational(1), rational(3)],
            quantityFacts: [{ premiseId: "cq-quantity", targetId: "target-high" }],
            quantityEntities: [{ entityId: "quantity-high", targetId: "target-high" }],
            queryPropositionId: "величина сопоставленной роли больше 2 баллов",
        },
        domain: {
            kind: "composite",
            closure: "productOfDeclaredDomains",
            parts: [
                {
                    kind: "boundedStructuralMapping",
                    closure: "listedStructuresOnly",
                    mappingContract: "bijection",
                    sourceIds: ["source-key-role", "source-other-role"],
                    targetIds: ["target-high", "target-low"],
                },
                { kind: "exactRationals", closure: "listedValuesOnly", units: "балла" },
            ],
        },
        entities: [
            { id: "source-key-role", label: "исходная ведущая роль", sort: "graphNode", features: { frame: "source" } },
            { id: "source-other-role", label: "исходная вспомогательная роль", sort: "graphNode", features: { frame: "source" } },
            { id: "target-high", label: "целевая роль «Альфа»", sort: "object", features: { frame: "target" } },
            { id: "target-low", label: "целевая роль «Бета»", sort: "object", features: { frame: "target" } },
            { id: "quantity-high", label: "величина роли «Альфа»", sort: "number", features: { numerator: 3, denominator: 1 } },
        ],
        queryText: "величина сопоставленной роли больше 2 баллов",
    };
}

function template(kind: CoupledFrameKind, extraPremises: number): CoupledTemplate {
    switch (kind) {
        case "membershipOrder": return membershipOrderTemplate(extraPremises);
        case "temporalSpatial": return temporalSpatialTemplate(extraPremises);
        case "mappingQuantity": return mappingQuantityTemplate(extraPremises);
    }
}

function supportedResponseFormat(target: ComplexityTarget): boolean {
    return target.responseFormat === "threeWayInference"
        || target.responseFormat === "identifyNecessaryPremise"
        || target.responseFormat === "repairProof"
        || target.responseFormat === "updateAfterPremiseChange";
}

/** These are semantic conventions, not hints or feedback, and never fade. */
function instructionsRu(built: CoupledTemplate): string[] {
    const labels = new Map(built.entities.map(entity => [entity.id, entity.label]));
    const name = (entityId: string) => `«${labels.get(entityId) ?? entityId}»`;
    const problem = built.problem;
    switch (problem.kind) {
        case "membershipOrder": return [
            `Мир содержит ровно ${problem.objectIds.map(name).join(", ")}; они занимают различные позиции 0–${problem.positionDomain.size - 1} на прямой.`,
            `Выбранная роль обозначает один из этих объектов. Без связующего правила её носитель не задан. Ориентир — ${name(problem.focusTargetId)}.`,
            `Связующее правило означает: если ${name("token-focus")} принадлежит классу ${name(problem.classId)}, то именно этот объект занимает выбранную роль. Оно не утверждает принадлежность само по себе.`,
        ];
        case "temporalSpatial": return [
            `Концы интервалов — целые числа от ${problem.intervalDomain.endpointMin} до ${problem.intervalDomain.endpointMax}; начало каждого интервала строго раньше его конца.`,
            `Координаты сетки: 0–${problem.transformDomain.width - 1} по горизонтали и 0–${problem.transformDomain.height - 1} по вертикали; начало вверху слева, x растёт вправо, y — вниз. Исходная отметка: (${problem.initialPoint.join("; ")}).`,
            "Рецепт — одно из двух преобразований: поворот на 90° по часовой стрелке или отражение относительно вертикальной оси через центр сетки. Посылка «Шаг 1» задаёт рецепт; без неё он не определён.",
            "Связующее правило означает: если этап «Подготовка» заканчивается до начала этапа «Проверка», выходная отметка получается применением выбранного рецепта к исходной отметке. Без этого условия её положение не задано.",
        ];
        case "mappingQuantity": return [
            `Исходные роли ${problem.sourceIds.map(name).join(", ")} и целевые роли ${problem.targetIds.map(name).join(", ")} связаны биекцией: каждая роль имеет ровно один образ, образы различны.`,
            "Величина каждой целевой роли равна 1 или 3 баллам. Посылка «3 больше 2» задаёт величину роли «Альфа»: 3 балла; остальные величины без отдельной посылки не заданы.",
            `Сравниваемая роль — одна из целевых ролей. Связующее правило означает: если образ роли ${name(problem.selectedSourceRoleId)} — роль «Альфа», то для сравнения выбирается её величина. Само правило не задаёт образ исходной роли.`,
        ];
    }
}

export function generateCoupledFrameItem(
    request: GenerationRequest,
    control: GenerationControl = DEFAULT_GENERATION_CONTROL,
    requestedKind?: CoupledFrameKind,
): GenerationResult {
    const startedAt = control.now();
    if (request.family !== "coupledFrames" || !supportedResponseFormat(request.target)) {
        return {
            ok: false,
            code: "unsupportedTarget",
            messageRu: "Для связанной задачи выбран формат без проверенного общего контракта ответа.",
            attempts: 0,
            elapsedMs: control.now() - startedAt,
            recoverable: true,
        };
    }
    const streams = createRandomStreams(request.seed);
    const kind = requestedKind
        ?? (request.target.level === 1
            ? "membershipOrder"
            : request.target.level === 2
                ? "temporalSpatial"
                : "mappingQuantity");
    for (let attempt = 1; attempt <= request.maxAttempts; attempt++) {
        const budgetFailure = generationBudgetFailure(request, startedAt, control, attempt - 1);
        if (budgetFailure) return budgetFailure;
        const requestedCount = Math.max(3, request.target.displayedPremises.min, 3 + request.target.distractorCount);
        if (!targetAllowsPremiseCount(request.target, requestedCount)) continue;
        const built = template(kind, requestedCount - 3);
        const solved = solveCoupledFrame(built.problem);
        if (!solved.certificate.premisesSatisfiable
            || solved.certificate.classification !== "entailed"
            || !solved.coupling.accepted) continue;
        const premises: PremiseNode[] = streams.presentation.shuffle([...built.problem.premises]);
        const responseSpec: ResponseSpec = responseSpecFor(
            request.target,
            built.entities,
            premises,
            "entailed",
        );
        const spec = coupledFrameSpec(built.problem);
        const lateBudgetFailure = generationBudgetFailure(request, startedAt, control, attempt);
        if (lateBudgetFailure) return lateBudgetFailure;
        const item = buildStructuralItem(request, {
            family: "coupledFrames",
            componentFamilies: [...built.problem.componentFamilies],
            structureFamily: `${request.partition}-coupled-${kind}`,
            domain: built.domain,
            entities: built.entities,
            premises,
            query: { kind: "proposition", propositionId: built.queryText },
            responseSpec,
            semanticCertificate: solved.certificate,
            attempt,
            startedAt,
            now: control.now,
            labelVariant: streams.presentation.int(0, 2),
            scaffolds: request.target.level <= 2 ? ["roleLabels", "partialGraph", "workspace"] : ["workspace"],
            fingerprint: structuralFingerprint(built.entities, premises,
                { kind: "proposition", propositionId: built.queryText }, built.domain, spec),
        });
        return {
            ok: true,
            item: { ...item, coupledFrameSpec: spec,
                presentation: { ...item.presentation, instructionsRu: instructionsRu(built) } },
        };
    }
    return {
        ok: false,
        code: "targetMismatch",
        messageRu: "Связанная структура не помещается в выбранный диапазон посылок; целевой уровень не был упрощён автоматически.",
        attempts: request.maxAttempts,
        elapsedMs: control.now() - startedAt,
        recoverable: true,
    };
}
