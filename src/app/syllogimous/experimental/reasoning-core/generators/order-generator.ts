import {
    AtomicQuery,
    DomainSpec,
    EntitySpec,
    GenerationRequest,
    GenerationResult,
    InferenceClassification,
    OrderPremise,
    OrderRelation,
} from "../models/semantic.models";
import {
    DEFAULT_SEMANTICS_VERSION,
    EMPTY_CLASS_SEMANTICS_VERSION,
    GENERATOR_VERSION,
    REASONING_ITEM_SCHEMA_VERSION,
    SOLVER_VERSION,
} from "../models/versions";
import { structuralFingerprint, stableHash } from "../certificates/canonical";
import { withMeasuredComplexity } from "../complexity/complexity";
import { classifyBoundedOrder } from "../solvers/bounded-order-solver";
import {
    DEFAULT_GENERATION_CONTROL,
    GenerationControl,
    generationBudgetFailure,
    responseSpecFor,
    targetAllowsPremiseCount,
} from "./generator-utils";
import { createRandomStreams, SeededRandom } from "./seeded-random";
import { deriveBoundedSemanticCertificate } from "./bounded-generator-helpers";

type OrderQuery = Extract<AtomicQuery, { kind: "order" }>;
type PositionDomain = Extract<DomainSpec, { kind: "boundedPositions" }>;

interface OrderTemplate {
    tag: string;
    entityIds: string[];
    domain: PositionDomain;
    premises: OrderPremise[];
    query: OrderQuery;
}

const LABELS_BY_PARTITION: Readonly<Record<GenerationRequest["partition"], readonly string[]>> = {
    training: ["точка «Альфа»", "точка «Бета»", "точка «Гамма»", "точка «Дельта»"],
    development: ["метка «Север»", "метка «Восток»", "метка «Юг»", "метка «Запад»"],
    assessment: ["позиция «Роса»", "позиция «Иней»", "позиция «Туман»", "позиция «Гроза»", "позиция «Ветер»"],
};

const SUPPORTED_FORMATS = new Set([
    "threeWayInference",
    "constructSatisfyingModel",
    "constructCounterexample",
    "repairProof",
    "identifyNecessaryPremise",
    "updateAfterPremiseChange",
]);

function order(
    id: string,
    relation: OrderRelation,
    args: string[],
    displacement?: number,
): OrderPremise {
    return { kind: "order", id, relation, args, displacement };
}

function linearDomain(size: number, allowCoincidence = false): PositionDomain {
    return {
        kind: "boundedPositions",
        closure: "closedFiniteDomain",
        size,
        cyclic: false,
        allowCoincidence,
    };
}

function desiredClassification(request: GenerationRequest, random: SeededRandom): InferenceClassification {
    if (request.target.responseFormat === "constructSatisfyingModel") {
        return random.bool() ? "entailed" : "underdetermined";
    }
    if (request.target.responseFormat === "constructCounterexample") {
        return random.bool() ? "refuted" : "underdetermined";
    }
    if (request.target.responseFormat === "repairProof" || request.target.responseFormat === "identifyNecessaryPremise") {
        return random.bool() ? "entailed" : "refuted";
    }
    const value = random.next();
    return value < 1 / 3 ? "entailed" : value < 2 / 3 ? "refuted" : "underdetermined";
}

function directTemplate(desired: InferenceClassification): OrderTemplate {
    const premises = [order("p1", "strictLess", ["a", "b"])];
    const query = desired === "entailed"
        ? { kind: "order" as const, relation: "strictLess" as const, args: ["a", "b"] }
        : desired === "refuted"
            ? { kind: "order" as const, relation: "strictLess" as const, args: ["b", "a"] }
            : { kind: "order" as const, relation: "strictLess" as const, args: ["a", "c"] };
    return { tag: "direct", entityIds: ["a", "b", "c"], domain: linearDomain(3), premises, query };
}

function strictTemplate(desired: InferenceClassification, relation: "strictLess" | "leftOf"): OrderTemplate {
    const premises = desired === "underdetermined"
        ? [order("p1", relation, ["a", "b"]), order("p2", relation, ["a", "c"])]
        : [order("p1", relation, ["a", "b"]), order("p2", relation, ["b", "c"])];
    const query: OrderQuery = desired === "entailed"
        ? { kind: "order", relation, args: ["a", "c"] }
        : desired === "refuted"
            ? { kind: "order", relation, args: ["c", "a"] }
            : { kind: "order", relation, args: ["b", "c"] };
    return { tag: relation === "leftOf" ? "left-chain" : "strict-chain", entityIds: ["a", "b", "c"], domain: linearDomain(3), premises, query };
}

function nonStrictTemplate(desired: InferenceClassification): OrderTemplate {
    const premises = desired === "underdetermined"
        ? [order("p1", "lessOrEqual", ["a", "b"]), order("p2", "lessOrEqual", ["a", "c"])]
        : [order("p1", "lessOrEqual", ["a", "b"]), order("p2", "lessOrEqual", ["b", "c"])];
    const query: OrderQuery = desired === "entailed"
        ? { kind: "order", relation: "lessOrEqual", args: ["a", "c"] }
        : desired === "refuted"
            ? { kind: "order", relation: "strictLess", args: ["c", "a"] }
            : { kind: "order", relation: "lessOrEqual", args: ["b", "c"] };
    return { tag: "non-strict-chain", entityIds: ["a", "b", "c"], domain: linearDomain(3, true), premises, query };
}

function equalityTemplate(desired: InferenceClassification): OrderTemplate {
    const premises = desired === "underdetermined"
        ? [order("p1", "equal", ["a", "b"]), order("p2", "lessOrEqual", ["c", "c"])]
        : [order("p1", "equal", ["a", "b"]), order("p2", "equal", ["b", "c"])];
    const query: OrderQuery = desired === "entailed"
        ? { kind: "order", relation: "equal", args: ["a", "c"] }
        : desired === "refuted"
            ? { kind: "order", relation: "strictLess", args: ["a", "c"] }
            : { kind: "order", relation: "equal", args: ["a", "c"] };
    return { tag: "equality", entityIds: ["a", "b", "c"], domain: linearDomain(3, true), premises, query };
}

function betweenTemplate(desired: InferenceClassification): OrderTemplate {
    const premises = [order("p1", "between", ["b", "a", "c"])];
    const query: OrderQuery = desired === "entailed"
        ? { kind: "order", relation: "strictLess", args: ["a", "c"] }
        : desired === "refuted"
            ? { kind: "order", relation: "strictLess", args: ["c", "a"] }
            : { kind: "order", relation: "strictLess", args: ["d", "a"] };
    return { tag: "between", entityIds: ["a", "b", "c", "d"], domain: linearDomain(4), premises, query };
}

function adjacencyTemplate(desired: InferenceClassification): OrderTemplate {
    const premises = desired === "refuted"
        ? [order("p1", "exactDisplacement", ["a", "b"], 2)]
        : [order("p1", "adjacent", ["a", "b"])];
    const query: OrderQuery = desired === "entailed"
        ? { kind: "order", relation: "adjacent", args: ["b", "a"] }
        : desired === "refuted"
            ? { kind: "order", relation: "adjacent", args: ["a", "b"] }
            : { kind: "order", relation: "leftOf", args: ["a", "b"] };
    return { tag: "adjacency", entityIds: ["a", "b", "c"], domain: linearDomain(3), premises, query };
}

function displacementTemplate(desired: InferenceClassification): OrderTemplate {
    const premises = [order("p1", "exactDisplacement", ["a", "b"], desired === "underdetermined" ? 1 : 2)];
    const query: OrderQuery = desired === "entailed"
        ? { kind: "order", relation: "leftOf", args: ["a", "b"] }
        : desired === "refuted"
            ? { kind: "order", relation: "rightOf", args: ["a", "b"] }
            : { kind: "order", relation: "leftOf", args: ["b", "c"] };
    return { tag: "exact-displacement", entityIds: ["a", "b", "c"], domain: linearDomain(4), premises, query };
}

function cyclicTemplate(desired: InferenceClassification): OrderTemplate {
    const domain: PositionDomain = {
        kind: "boundedPositions",
        closure: "closedFiniteDomain",
        size: 4,
        cyclic: true,
        allowCoincidence: false,
    };
    const premises = desired === "underdetermined"
        ? [order("p1", "cyclicClockwise", ["a", "b"], 1)]
        : [
            order("p1", "cyclicClockwise", ["a", "b"], 1),
            order("p2", "cyclicClockwise", ["b", "c"], 1),
        ];
    const query: OrderQuery = desired === "entailed"
        ? { kind: "order", relation: "cyclicClockwise", args: ["a", "c"], displacement: 2 }
        : desired === "refuted"
            ? { kind: "order", relation: "cyclicClockwise", args: ["a", "c"], displacement: 3 }
            : { kind: "order", relation: "cyclicClockwise", args: ["b", "c"], displacement: 1 };
    return { tag: "cyclic-clockwise", entityIds: ["a", "b", "c"], domain, premises, query };
}

function partialOrderTemplate(desired: InferenceClassification): OrderTemplate {
    const premises = [
        order("p1", "strictLess", ["a", "b"]),
        order("p2", "strictLess", ["a", "c"]),
        order("p3", "strictLess", ["b", "d"]),
        order("p4", "strictLess", ["c", "d"]),
    ];
    const query: OrderQuery = desired === "entailed"
        ? { kind: "order", relation: "strictLess", args: ["a", "d"] }
        : desired === "refuted"
            ? { kind: "order", relation: "strictLess", args: ["d", "a"] }
            : { kind: "order", relation: "strictLess", args: ["b", "c"] };
    return { tag: "partial-diamond", entityIds: ["a", "b", "c", "d"], domain: linearDomain(4), premises, query };
}

function selectTemplate(
    request: GenerationRequest,
    desired: InferenceClassification,
    random: SeededRandom,
): OrderTemplate {
    if (request.partition === "assessment" && request.target.level >= 3) {
        const ids = ["a", "b", "c", "d", "e"];
        const edges = random.pick([
            [["a", "b"], ["a", "c"], ["b", "d"], ["c", "e"]],
            [["a", "b"], ["b", "c"], ["c", "d"], ["a", "e"]],
            [["a", "b"], ["b", "c"], ["b", "d"], ["d", "e"]],
        ]);
        const left = random.pick(ids);
        const right = random.pick(ids.filter(value => value !== left));
        return {
            tag: "reserved-double-fork-v1",
            entityIds: ids,
            domain: linearDomain(5),
            premises: edges.map((args, index) => order(`p${index + 1}`, "strictLess", args)),
            query: { kind: "order", relation: "strictLess", args: [left, right] },
        };
    }
    if (request.target.displayedPremises.max === 1) return directTemplate(desired);
    const level = request.target.level;
    const modes = request.partition === "training"
        ? level <= 1 ? ["strict"] : level === 2 ? ["strict", "left", "nonstrict"] : ["adjacent", "between", "partial"]
        : request.partition === "development"
            ? level <= 2 ? ["adjacent", "displacement"] : ["between", "cyclic", "partial"]
            : level <= 2 ? ["equality", "between"] : ["cyclic", "displacement", "partial"];
    let mode = random.pick(modes);
    if (mode === "partial" && request.target.displayedPremises.max < 4) mode = "between";
    switch (mode) {
        case "strict": return strictTemplate(desired, "strictLess");
        case "left": return strictTemplate(desired, "leftOf");
        case "nonstrict": return nonStrictTemplate(desired);
        case "equality": return equalityTemplate(desired);
        case "between": return betweenTemplate(desired);
        case "adjacent": return adjacencyTemplate(desired);
        case "displacement": return displacementTemplate(desired);
        case "cyclic": return cyclicTemplate(desired);
        case "partial": return partialOrderTemplate(desired);
        default: return strictTemplate(desired, "strictLess");
    }
}

function padPremises(template: OrderTemplate, count: number): OrderTemplate {
    const premises = [...template.premises];
    while (premises.length < count) {
        premises.push(order(`d${premises.length + 1}`, "lessOrEqual", [template.entityIds[0], template.entityIds[0]]));
    }
    return { ...template, premises };
}

function unsupported(
    request: GenerationRequest,
    startedAt: number,
    control: GenerationControl,
    messageRu: string,
): GenerationResult {
    return {
        ok: false,
        code: "unsupportedTarget",
        messageRu,
        attempts: 0,
        elapsedMs: control.now() - startedAt,
        recoverable: false,
    };
}

export function generateOrderItem(
    request: GenerationRequest,
    control: GenerationControl = DEFAULT_GENERATION_CONTROL,
): GenerationResult {
    const startedAt = control.now();
    if (request.family !== "order") {
        return unsupported(request, startedAt, control, "Этот генератор создаёт только задания на порядок и расположение.");
    }
    if (request.semanticsVersion !== DEFAULT_SEMANTICS_VERSION && request.semanticsVersion !== EMPTY_CLASS_SEMANTICS_VERSION) {
        return unsupported(request, startedAt, control, "Выбрана неизвестная версия семантики экспериментального режима.");
    }
    if (!SUPPORTED_FORMATS.has(request.target.responseFormat)) {
        return unsupported(request, startedAt, control, "Выбранный формат ответа пока не определён для заданий на порядок.");
    }
    if (request.target.displayedPremises.min < 1
        || request.target.displayedPremises.max < request.target.displayedPremises.min
        || request.target.displayedPremises.max > 8) {
        return unsupported(request, startedAt, control, "Для заданий на порядок укажите от одной до восьми видимых посылок.");
    }

    const streams = createRandomStreams(request.seed);
    for (let attempt = 1; attempt <= request.maxAttempts; attempt++) {
        const budgetFailure = generationBudgetFailure(request, startedAt, control, attempt - 1);
        if (budgetFailure) return budgetFailure;
        const desired = desiredClassification(request, streams.semantic);
        let template = selectTemplate(request, desired, streams.semantic);
        const requestedCount = Math.max(
            template.premises.length,
            request.target.displayedPremises.min,
            template.premises.length + request.target.distractorCount,
        );
        if (!targetAllowsPremiseCount(request.target, requestedCount)) continue;
        template = padPremises(template, requestedCount);

        const solved = classifyBoundedOrder(template.entityIds, template.premises, template.query, template.domain);
        if (!solved.ok || solved.classification !== desired) continue;
        const semanticCertificate = deriveBoundedSemanticCertificate(
            template.premises,
            solved,
            subset => {
                const result = classifyBoundedOrder(template.entityIds, subset, template.query, template.domain);
                return result.ok ? result : undefined;
            },
        );
        const lateBudgetFailure = generationBudgetFailure(request, startedAt, control, attempt);
        if (lateBudgetFailure) return lateBudgetFailure;

        const shuffledLabels = streams.presentation.shuffle(LABELS_BY_PARTITION[request.partition]);
        const entities: EntitySpec[] = template.entityIds.map((id, index) => ({
            id,
            label: shuffledLabels[index],
            sort: "position",
        }));
        const premises = streams.presentation.shuffle(template.premises);
        let responseSpec;
        try {
            responseSpec = responseSpecFor(request.target, entities, premises, desired);
        } catch {
            continue;
        }
        const fingerprint = structuralFingerprint(entities, premises, template.query, template.domain);
        const elapsedMs = control.now() - startedAt;
        const baseItem = withMeasuredComplexity({
            id: `ri-order-${stableHash(`${request.seed}:${fingerprint}`)}`,
            schemaVersion: REASONING_ITEM_SCHEMA_VERSION,
            generatorVersion: GENERATOR_VERSION,
            semanticsVersion: request.semanticsVersion,
            solverVersion: SOLVER_VERSION,
            seed: request.seed,
            family: "order",
            componentFamilies: ["order"],
            structureFamily: `${request.partition}-order-${template.tag}-l${request.target.level}`,
            grammarPartition: request.partition,
            domain: template.domain,
            entities,
            premises,
            query: template.query,
            responseSpec,
            targetComplexity: request.target,
            semanticCertificate,
            structuralFingerprint: fingerprint,
            presentation: {
                locale: "ru",
                premiseOrder: premises.map(premise => premise.id),
                labelVariant: streams.presentation.int(0, 3),
                stableAnswerOrder: ["entailed", "refuted", "underdetermined"],
                negationCue: "textAndSymbol",
                scaffolds: request.target.level <= 2 ? ["roleLabels", "workspace"] : ["workspace"],
            },
            provenance: {
                semanticSeed: `${request.seed}::semantic`,
                presentationSeed: `${request.seed}::presentation`,
                schedulerSeed: `${request.seed}::scheduler`,
                attempt,
                maxAttempts: request.maxAttempts,
                elapsedMs,
                wallTimeBudgetMs: request.wallTimeBudgetMs,
                requestedTarget: request.target,
                appliedTarget: request.target,
                generatedAt: Date.now(),
            },
        });
        return {
            ok: true,
            item: {
                ...baseItem,
                measuredComplexity: {
                    ...baseItem.measuredComplexity,
                    admissibleModelCount: solved.modelCount,
                    modelCountStatus: "exact",
                    modelCountDomainNote: solved.finiteDomainAssumption,
                },
            },
        };
    }
    return {
        ok: false,
        code: "attemptBudgetExceeded",
        messageRu: "Не удалось построить задание на порядок с выбранным сочетанием сложности в пределах числа попыток.",
        attempts: request.maxAttempts,
        elapsedMs: control.now() - startedAt,
        recoverable: true,
    };
}
