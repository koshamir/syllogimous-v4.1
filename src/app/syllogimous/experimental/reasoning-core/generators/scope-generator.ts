import {
    AtomicQuery,
    EntitySpec,
    GenerationRequest,
    GenerationResult,
    InferenceClassification,
    QueryNode,
    ScopedRelationPremise,
    ScopeFrameSpec,
} from "../models/semantic.models";
import { classifyScopeFormula } from "../solvers/scope-solver";
import { validateUniqueBindings } from "../semantics/scope";
import { createRandomStreams } from "./seeded-random";
import {
    DEFAULT_GENERATION_CONTROL,
    GenerationControl,
    generationBudgetFailure,
    responseSpecFor,
    targetAllowsPremiseCount,
} from "./generator-utils";
import { buildStructuralItem } from "./structural-item-builder";

function scoped(
    id: string,
    subjectQuantifier: "every" | "some",
    objectQuantifier: "every" | "some",
    outer: "subject" | "object",
    frame?: ScopeFrameSpec,
): ScopedRelationPremise {
    const subjectBindingId = `${id}-person`;
    const objectBindingId = `${id}-book`;
    return {
        kind: "scopedRelation",
        id,
        contextId: frame?.contextId ?? "reading-room",
        subjectBindingId,
        objectBindingId,
        quantifierOrder: outer === "subject"
            ? [subjectBindingId, objectBindingId]
            : [objectBindingId, subjectBindingId],
        subjectQuantifier,
        objectQuantifier,
        subjectClass: frame?.subjectClass ?? "people-class",
        objectClass: frame?.objectClass ?? "books-class",
        relation: frame?.relation ?? "reads",
        nestingDepth: 2,
    };
}

function generateMultiContextScopeItem(request: GenerationRequest, control: GenerationControl): GenerationResult {
    const startedAt = control.now();
    const streams = createRandomStreams(request.seed);
    const frames: ScopeFrameSpec[] = [
        { contextId: "phase-one", relation: "signalsTo", subjectClass: "senders-class", objectClass: "receivers-class",
            subjectIds: ["node-a", "node-b"], objectIds: ["node-c", "node-d"] },
        { contextId: "phase-two", relation: request.target.level >= 4 ? "sees" : "signalsTo", subjectClass: "senders-class", objectClass: "receivers-class",
            subjectIds: ["node-c", "node-d"], objectIds: ["node-a", "node-b"] },
    ];
    const entities: EntitySpec[] = [
        { id: "phase-one", label: "первый режим", sort: "context" }, { id: "phase-two", label: "второй режим", sort: "context" },
        { id: "senders-class", label: "исходные роли", sort: "class" }, { id: "receivers-class", label: "целевые роли", sort: "class" },
        { id: "node-a", label: "датчик «Альфа»", sort: "object" }, { id: "node-b", label: "датчик «Бета»", sort: "object" },
        { id: "node-c", label: "датчик «Гамма»", sort: "object" }, { id: "node-d", label: "датчик «Дельта»", sort: "object" },
    ];
    for (let attempt = 1; attempt <= request.maxAttempts; attempt++) {
        const failure = generationBudgetFailure(request, startedAt, control, attempt - 1);
        if (failure) return failure;
        const desired = desiredClassification(request, streams.semantic.next());
        const premises = [scoped("mc1", "every", "some", "subject", frames[0]), scoped("mc2", "every", "some", "subject", frames[1])];
        const count = Math.max(2, request.target.displayedPremises.min, 2 + request.target.distractorCount);
        for (let index = 2; index < count; index++) premises.push(scoped(`mc${index + 1}`, "some", "some", "subject", frames[index % 2]));
        if (!targetAllowsPremiseCount(request.target, premises.length)) continue;
        const { id: _queryId, ...atomic } = scoped("mc-query", "every", "some", desired === "underdetermined" ? "object" : "subject", frames[1]);
        const query = desired === "refuted" ? { kind: "logicalNot" as const, operand: atomic } : atomic;
        const bindingErrors = validateUniqueBindings([...premises, atomic]);
        if (bindingErrors.length) throw new Error(bindingErrors.join(" "));
        const certificate = classifyScopeFormula(premises, query, [], [], frames);
        if (!certificate.premisesSatisfiable || certificate.classification !== desired) continue;
        const orderedPremises = streams.presentation.shuffle(premises);
        const item = buildStructuralItem(request, {
            family: "contextScope", componentFamilies: ["contextScope"],
            structureFamily: `${request.partition}-scope-two-context-role-switch-${frames[1].relation}-l${request.target.level}`,
            domain: { kind: "boundedContexts", closure: "listedContextsOnly", contextIds: frames.map(frame => frame.contextId), maxNesting: 2, frames },
            entities, premises: orderedPremises, query, responseSpec: responseSpecFor(request.target, entities, orderedPremises, desired),
            semanticCertificate: certificate, attempt, startedAt, now: control.now, labelVariant: streams.presentation.int(0, 2),
        });
        const lateFailure = generationBudgetFailure(request, startedAt, control, attempt);
        if (lateFailure) return lateFailure;
        return { ok: true, item: { ...item, presentation: { ...item.presentation, instructionsRu: [
            "Здесь описаны два условных режима четырёх датчиков, а не свойства реальных людей. Каждая направленная связь задана отдельно для своего режима и отношения; она не переносится в другой режим автоматически.",
            "В первом режиме исходные роли: «Альфа», «Бета»; целевые роли: «Гамма», «Дельта». Во втором режиме роли меняются местами: исходные — «Гамма», «Дельта»; целевые — «Альфа», «Бета».",
            request.target.level >= 4 ? "Отношения «передаёт сигнал» и «видит» различны: одно не означает другое. Других ограничений на таблицы связей нет." : "Отношение «передаёт сигнал» направлено от исходной роли к целевой. Других ограничений на таблицы связей нет.",
            "Кванторы распространяются только на два датчика своей ролевой группы в указанном режиме. Глубина области действия — два квантора; более глубокие условия здесь не используются.",
        ] } } };
    }
    return { ok: false, code: "attemptBudgetExceeded", messageRu: "Не удалось подготовить многоконтекстное задание в пределах бюджета.",
        attempts: request.maxAttempts, elapsedMs: control.now() - startedAt, recoverable: true };
}

function desiredClassification(request: GenerationRequest, value: number): InferenceClassification {
    if (request.target.level === 1) {
        return request.target.responseFormat === "constructCounterexample"
            ? "refuted"
            : request.target.responseFormat === "constructSatisfyingModel"
                ? "entailed"
                : value < 0.5 ? "entailed" : "refuted";
    }
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

export function generateScopeItem(
    request: GenerationRequest,
    control: GenerationControl = DEFAULT_GENERATION_CONTROL,
): GenerationResult {
    const startedAt = control.now();
    if (request.family !== "contextScope"
        || request.target.responseFormat === "completeMapping"
        || request.target.responseFormat === "identifyMissingRelation") {
        return {
            ok: false,
            code: "unsupportedTarget",
            messageRu: "Выбранный формат не относится к задачам на область действия кванторов.",
            attempts: 0,
            elapsedMs: control.now() - startedAt,
            recoverable: true,
        };
    }
    const streams = createRandomStreams(request.seed);
    if (request.target.level >= 3) return generateMultiContextScopeItem(request, control);
    for (let attempt = 1; attempt <= request.maxAttempts; attempt++) {
        const budgetFailure = generationBudgetFailure(request, startedAt, control, attempt - 1);
        if (budgetFailure) return budgetFailure;
        const desired = desiredClassification(request, streams.semantic.next());
        const premise = request.target.level === 1
            ? scoped("s1", "some", "some", "subject")
            : scoped("s1", "every", "some", "subject");
        const premises: ScopedRelationPremise[] = [premise];
        const requestedCount = Math.max(1, request.target.displayedPremises.min, 1 + request.target.distractorCount);
        for (let index = 1; index < requestedCount; index++) {
            premises.push(scoped(`s${index + 1}`, "some", "some", index % 2 ? "object" : "subject"));
        }
        if (!targetAllowsPremiseCount(request.target, premises.length)) continue;

        const queryPremise = desired === "underdetermined"
            ? scoped("scope-query", "every", "some", "object")
            : request.target.level === 1
                ? scoped("scope-query", "some", "some", "subject")
                : scoped("scope-query", "every", "some", "subject");
        // Premise IDs do not belong on query nodes.
        const { id: _queryId, ...atomicQuery } = queryPremise;
        const scopeFormula: Extract<AtomicQuery, { kind: "scopedRelation" }>
            | ({ kind: "logicalNot"; operand: Extract<AtomicQuery, { kind: "scopedRelation" }> }) = desired === "refuted"
            ? { kind: "logicalNot", operand: atomicQuery }
            : atomicQuery;
        const query: QueryNode = scopeFormula;
        const bindingErrors = validateUniqueBindings([
            ...premises,
            atomicQuery,
        ]);
        if (bindingErrors.length) {
            return {
                ok: false,
                code: "internalValidationError",
                messageRu: bindingErrors.join(" "),
                attempts: attempt,
                elapsedMs: control.now() - startedAt,
                recoverable: false,
            };
        }
        const certificate = classifyScopeFormula(
            premises,
            scopeFormula,
            ["person-1", "person-2"],
            ["book-1", "book-2"],
        );
        if (!certificate.premisesSatisfiable || certificate.classification !== desired) continue;
        const entities: EntitySpec[] = [
            { id: "reading-room", label: "читальный зал", sort: "context" },
            { id: "people-class", label: "посетители", sort: "class" },
            { id: "books-class", label: "книги", sort: "class" },
            { id: "person-1", label: "Ирина", sort: "person", grammaticalGender: "feminine" },
            { id: "person-2", label: "Максим", sort: "person", grammaticalGender: "masculine" },
            { id: "book-1", label: "книга «Маяк»", sort: "object" },
            { id: "book-2", label: "книга «Орбита»", sort: "object" },
        ];
        let responseSpec;
        try {
            responseSpec = responseSpecFor(request.target, entities, premises, desired);
        } catch {
            continue;
        }
        const orderedPremises = streams.presentation.shuffle(premises);
        return {
            ok: true,
            item: buildStructuralItem(request, {
                family: "contextScope",
                componentFamilies: ["contextScope"],
                structureFamily: `${request.partition}-scope-${request.target.level === 1 ? "operator-comprehension" : desired === "underdetermined" ? "forall-exists-vs-exists-forall" : "explicit-binding"}`,
                domain: {
                    kind: "boundedContexts",
                    closure: "listedContextsOnly",
                    contextIds: ["reading-room"],
                    maxNesting: 2,
                },
                entities,
                premises: orderedPremises,
                query,
                responseSpec,
                semanticCertificate: certificate,
                attempt,
                startedAt,
                now: control.now,
                labelVariant: streams.presentation.int(0, 2),
            }),
        };
    }
    return {
        ok: false,
        code: "attemptBudgetExceeded",
        messageRu: "Не удалось построить задачу на область действия с выбранным числом посылок.",
        attempts: request.maxAttempts,
        elapsedMs: control.now() - startedAt,
        recoverable: true,
    };
}
