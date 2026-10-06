import {
    AtomicQuery,
    DomainSpec,
    EntitySpec,
    GenerationRequest,
    GenerationResult,
    InferenceClassification,
    IntervalPremise,
    IntervalRelation,
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
import { classifyBoundedIntervals } from "../solvers/bounded-interval-solver";
import { deriveBoundedSemanticCertificate } from "./bounded-generator-helpers";
import {
    DEFAULT_GENERATION_CONTROL,
    GenerationControl,
    generationBudgetFailure,
    responseSpecFor,
    targetAllowsPremiseCount,
} from "./generator-utils";
import { createRandomStreams, SeededRandom } from "./seeded-random";

type IntervalQuery = Extract<AtomicQuery, { kind: "interval" }>;
type IntervalDomain = Extract<DomainSpec, { kind: "boundedIntervals" }>;

interface IntervalTemplate {
    tag: string;
    entityIds: string[];
    premises: IntervalPremise[];
    query: IntervalQuery;
}

const DOMAIN: IntervalDomain = {
    kind: "boundedIntervals",
    closure: "closedFiniteDomain",
    endpointMin: 0,
    endpointMax: 5,
};

const LABELS_BY_PARTITION: Readonly<Record<GenerationRequest["partition"], readonly string[]>> = {
    training: ["подготовка", "проверка", "обсуждение"],
    development: ["рассвет", "полдень", "закат"],
    assessment: ["фаза «Лён»", "фаза «Мак»", "фаза «Ирис»"],
};

const SUPPORTED_FORMATS = new Set([
    "threeWayInference",
    "constructSatisfyingModel",
    "constructCounterexample",
    "repairProof",
    "identifyNecessaryPremise",
    "updateAfterPremiseChange",
]);

function interval(id: string, relation: IntervalRelation, left: string, right: string): IntervalPremise {
    return { kind: "interval", id, relation, left, right };
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

function directTemplate(relation: IntervalRelation, desired: InferenceClassification): IntervalTemplate {
    const premises = [interval("p1", relation, "a", "b")];
    const query: IntervalQuery = desired === "entailed"
        ? { kind: "interval", relation, left: "a", right: "b" }
        : desired === "refuted"
            ? relation === "equals"
                ? { kind: "interval", relation: "before", left: "a", right: "b" }
                : { kind: "interval", relation, left: "b", right: "a" }
            : { kind: "interval", relation, left: "c", right: "a" };
    return { tag: `direct-${relation}`, entityIds: ["a", "b", "c"], premises, query };
}

function transitiveTemplate(relation: Exclude<IntervalRelation, "overlaps">, desired: InferenceClassification): IntervalTemplate {
    if (desired === "underdetermined") return directTemplate(relation, desired);
    const premises = [
        interval("p1", relation, "a", "b"),
        interval("p2", relation, "b", "c"),
    ];
    const query: IntervalQuery = desired === "entailed"
        ? { kind: "interval", relation, left: "a", right: "c" }
        : relation === "equals"
            ? { kind: "interval", relation: "before", left: "a", right: "c" }
            : { kind: "interval", relation, left: "c", right: "a" };
    return { tag: `transitive-${relation}`, entityIds: ["a", "b", "c"], premises, query };
}

function selectRelation(request: GenerationRequest, random: SeededRandom): IntervalRelation {
    const level = request.target.level;
    const relations: readonly IntervalRelation[] = request.partition === "training"
        ? level <= 1 ? ["before", "after"] : level === 2 ? ["before", "during"] : ["during", "starts", "finishes"]
        : request.partition === "development"
            ? level <= 2 ? ["overlaps", "during"] : ["starts", "finishes", "before"]
            : level <= 2 ? ["equals", "after"] : ["finishes", "starts", "equals"];
    return random.pick(relations);
}

function selectTemplate(
    request: GenerationRequest,
    desired: InferenceClassification,
    random: SeededRandom,
): IntervalTemplate {
    const relation = selectRelation(request, random);
    const useChain = request.target.level >= 3
        && request.target.displayedPremises.max >= 2
        && relation !== "overlaps"
        && random.bool(0.7);
    return useChain ? transitiveTemplate(relation, desired) : directTemplate(relation, desired);
}

function padPremises(template: IntervalTemplate, count: number): IntervalTemplate {
    const premises = [...template.premises];
    while (premises.length < count) {
        premises.push(interval(`d${premises.length + 1}`, "equals", template.entityIds[0], template.entityIds[0]));
    }
    return { ...template, premises };
}

function unsupported(startedAt: number, control: GenerationControl, messageRu: string): GenerationResult {
    return {
        ok: false,
        code: "unsupportedTarget",
        messageRu,
        attempts: 0,
        elapsedMs: control.now() - startedAt,
        recoverable: false,
    };
}

export function generateTemporalIntervalItem(
    request: GenerationRequest,
    control: GenerationControl = DEFAULT_GENERATION_CONTROL,
): GenerationResult {
    const startedAt = control.now();
    if (request.family !== "temporalIntervals") {
        return unsupported(startedAt, control, "Этот генератор создаёт только задания о временных интервалах.");
    }
    if (request.semanticsVersion !== DEFAULT_SEMANTICS_VERSION && request.semanticsVersion !== EMPTY_CLASS_SEMANTICS_VERSION) {
        return unsupported(startedAt, control, "Выбрана неизвестная версия семантики экспериментального режима.");
    }
    if (!SUPPORTED_FORMATS.has(request.target.responseFormat)) {
        return unsupported(startedAt, control, "Выбранный формат ответа пока не определён для временных интервалов.");
    }
    if (request.target.displayedPremises.min < 1
        || request.target.displayedPremises.max < request.target.displayedPremises.min
        || request.target.displayedPremises.max > 8) {
        return unsupported(startedAt, control, "Для временных интервалов укажите от одной до восьми видимых посылок.");
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

        const solved = classifyBoundedIntervals(template.entityIds, template.premises, template.query, DOMAIN);
        if (!solved.ok || solved.classification !== desired) continue;
        const semanticCertificate = deriveBoundedSemanticCertificate(
            template.premises,
            solved,
            subset => {
                const result = classifyBoundedIntervals(template.entityIds, subset, template.query, DOMAIN);
                return result.ok ? result : undefined;
            },
        );
        const lateBudgetFailure = generationBudgetFailure(request, startedAt, control, attempt);
        if (lateBudgetFailure) return lateBudgetFailure;

        const shuffledLabels = streams.presentation.shuffle(LABELS_BY_PARTITION[request.partition]);
        const entities: EntitySpec[] = template.entityIds.map((id, index) => ({
            id,
            label: shuffledLabels[index],
            sort: "interval",
        }));
        const premises = streams.presentation.shuffle(template.premises);
        let responseSpec;
        try {
            responseSpec = responseSpecFor(request.target, entities, premises, desired);
        } catch {
            continue;
        }
        const fingerprint = structuralFingerprint(entities, premises, template.query, DOMAIN);
        const elapsedMs = control.now() - startedAt;
        const baseItem = withMeasuredComplexity({
            id: `ri-interval-${stableHash(`${request.seed}:${fingerprint}`)}`,
            schemaVersion: REASONING_ITEM_SCHEMA_VERSION,
            generatorVersion: GENERATOR_VERSION,
            semanticsVersion: request.semanticsVersion,
            solverVersion: SOLVER_VERSION,
            seed: request.seed,
            family: "temporalIntervals",
            componentFamilies: ["temporalIntervals"],
            structureFamily: `${request.partition}-interval-${template.tag}-l${request.target.level}`,
            grammarPartition: request.partition,
            domain: DOMAIN,
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
        messageRu: "Не удалось построить интервальное задание с выбранным сочетанием сложности в пределах числа попыток.",
        attempts: request.maxAttempts,
        elapsedMs: control.now() - startedAt,
        recoverable: true,
    };
}
