import {
    AtomicQuery,
    ConditionalPremise,
    ContainmentPremise,
    EntitySpec,
    GenerationRequest,
    GenerationResult,
    InferenceClassification,
    PremiseNode,
} from "../models/semantic.models";
import {
    DEFAULT_SEMANTICS_VERSION,
    EMPTY_CLASS_SEMANTICS_VERSION,
    SUPPORTED_SEMANTICS,
} from "../models/versions";
import { classifyHierarchyQuery } from "../solvers/hierarchy-solver";
import { createRandomStreams } from "./seeded-random";
import {
    DEFAULT_GENERATION_CONTROL,
    GenerationControl,
    generationBudgetFailure,
    responseSpecFor,
    targetAllowsPremiseCount,
} from "./generator-utils";
import { buildStructuralItem } from "./structural-item-builder";

const OBJECT_LABELS = ["жетон «Север»", "жетон «Юг»"] as const;
const CLASS_LABEL_SETS = [
    ["наблюдатели", "участники", "проверяющие"],
    ["синие метки", "круглые метки", "учётные метки"],
] as const;

function containment(
    id: string,
    relation: ContainmentPremise["relation"],
    subject: string,
    classId: string,
): ContainmentPremise {
    return { kind: "containment", id, relation, subject, classId };
}

function desiredClassification(request: GenerationRequest, value: number): InferenceClassification {
    if (request.target.responseFormat === "constructSatisfyingModel") {
        return value < 0.5 ? "entailed" : "underdetermined";
    }
    if (request.target.responseFormat === "constructCounterexample") {
        return value < 0.5 ? "refuted" : "underdetermined";
    }
    if (request.target.responseFormat === "identifyNecessaryPremise" || request.target.responseFormat === "repairProof") {
        return value < 0.5 ? "entailed" : "refuted";
    }
    return value < 1 / 3 ? "entailed" : value < 2 / 3 ? "refuted" : "underdetermined";
}

export function generateHierarchyItem(
    request: GenerationRequest,
    control: GenerationControl = DEFAULT_GENERATION_CONTROL,
): GenerationResult {
    const startedAt = control.now();
    const supportedFormat = request.target.responseFormat !== "completeMapping"
        && request.target.responseFormat !== "identifyMissingRelation";
    if (request.family !== "hierarchy" || !supportedFormat) {
        return {
            ok: false,
            code: "unsupportedTarget",
            messageRu: "Генератор иерархий получил запрос для другой системы отношений.",
            attempts: 0,
            elapsedMs: control.now() - startedAt,
            recoverable: false,
        };
    }
    if (request.semanticsVersion !== DEFAULT_SEMANTICS_VERSION
        && request.semanticsVersion !== EMPTY_CLASS_SEMANTICS_VERSION) {
        return {
            ok: false,
            code: "unsupportedTarget",
            messageRu: "Выбрана неизвестная версия семантики иерархий.",
            attempts: 0,
            elapsedMs: control.now() - startedAt,
            recoverable: false,
        };
    }
    const semantics = SUPPORTED_SEMANTICS[request.semanticsVersion];
    const streams = createRandomStreams(request.seed);
    for (let attempt = 1; attempt <= request.maxAttempts; attempt++) {
        const budgetFailure = generationBudgetFailure(request, startedAt, control, attempt - 1);
        if (budgetFailure) return budgetFailure;
        const desired = desiredClassification(request, streams.semantic.next());
        const rule: ConditionalPremise = {
            kind: "conditional",
            id: "h3",
            bindingId: "связанная_метка_h3",
            if: containment("h3-if", "memberOf", "связанная_метка_h3", "class-middle"),
            then: containment("h3-then", "memberOf", "связанная_метка_h3", "class-result"),
            exceptEntityIds: ["object-other"],
        };
        const advanced = request.target.level >= 2;
        const premises: PremiseNode[] = [
            containment("h1", "memberOf", "object-focus", "class-start"),
            containment("h2", "includedIn", "class-start", "class-middle"),
        ];
        if (advanced) premises.push(rule);
        const baseCount = advanced ? 3 : 2;
        const requestedCount = Math.max(baseCount, request.target.displayedPremises.min, baseCount + request.target.distractorCount);
        for (let index = premises.length; index < requestedCount; index++) {
            premises.push(containment(`h-d${index - 2}`, "includedIn", "class-start", "class-start"));
        }
        if (!targetAllowsPremiseCount(request.target, premises.length)) continue;

        const queryClass = advanced ? "class-result" : "class-middle";
        const query: Extract<AtomicQuery, { kind: "containment" }> = desired === "entailed"
            ? { kind: "containment", relation: "memberOf", subject: "object-focus", classId: queryClass }
            : desired === "refuted"
                ? { kind: "containment", relation: "excludedFrom", subject: "object-focus", classId: queryClass }
                : { kind: "containment", relation: "memberOf", subject: "object-other", classId: queryClass };
        const labelSet = streams.presentation.pick(CLASS_LABEL_SETS);
        const entities: EntitySpec[] = [
            { id: "object-focus", label: OBJECT_LABELS[0], sort: "object" },
            { id: "object-other", label: OBJECT_LABELS[1], sort: "object" },
            { id: "class-start", label: labelSet[0], sort: "class" },
            { id: "class-middle", label: labelSet[1], sort: "class" },
            { id: "class-result", label: labelSet[2], sort: "class" },
        ];
        const orderedPremises = streams.presentation.shuffle(premises);
        const certificate = classifyHierarchyQuery(
            orderedPremises,
            query,
            ["object-focus", "object-other"],
            ["class-start", "class-middle", "class-result"],
        );
        if (!certificate.premisesSatisfiable || certificate.classification !== desired) continue;
        let responseSpec;
        try {
            responseSpec = responseSpecFor(request.target, entities, orderedPremises, desired);
        } catch {
            continue;
        }
        return {
            ok: true,
            item: buildStructuralItem(request, {
                family: "hierarchy",
                componentFamilies: ["hierarchy"],
                structureFamily: `${request.partition}-hierarchy-${advanced ? "monotonic-exception" : "membership-inclusion"}-${desired}`,
                domain: {
                    kind: "boundedMembership",
                    closure: "listedObjectsAndClassesOnly",
                    objectIds: ["object-focus", "object-other"],
                    classIds: ["class-start", "class-middle", "class-result"],
                },
                entities,
                premises: orderedPremises,
                query,
                responseSpec,
                semanticCertificate: certificate,
                attempt,
                startedAt,
                now: control.now,
                labelVariant: streams.presentation.int(0, 1),
            }),
        };
    }
    return {
        ok: false,
        code: "attemptBudgetExceeded",
        messageRu: "Не удалось согласовать число посылок и формат иерархического задания.",
        attempts: request.maxAttempts,
        elapsedMs: control.now() - startedAt,
        recoverable: true,
    };
}
