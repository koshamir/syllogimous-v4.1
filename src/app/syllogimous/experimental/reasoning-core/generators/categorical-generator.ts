import {
    AtomicQuery,
    CategoricalPremise,
    CategoricalQuantifier,
    EntitySpec,
    GenerationRequest,
    GenerationResult,
    InferenceClassification,
} from "../models/semantic.models";
import {
    DEFAULT_SEMANTICS_VERSION,
    EMPTY_CLASS_SEMANTICS_VERSION,
    GENERATOR_VERSION,
    REASONING_ITEM_SCHEMA_VERSION,
    SOLVER_VERSION,
    SUPPORTED_SEMANTICS,
} from "../models/versions";
import { classifyCategorical } from "../solvers/categorical-solver";
import { referenceClassifyCategorical } from "../solvers/reference-categorical-oracle";
import { negateCategoricalQuantifier } from "../semantics/categorical";
import { createRandomStreams } from "./seeded-random";
import {
    DEFAULT_GENERATION_CONTROL,
    GenerationControl,
    generationBudgetFailure,
    responseSpecFor,
    targetAllowsPremiseCount,
} from "./generator-utils";
import { structuralFingerprint, stableHash } from "../certificates/canonical";
import { withMeasuredComplexity } from "../complexity/complexity";

const CLASS_LABELS = [
    "астрономы",
    "ботаники",
    "геологи",
    "дизайнеры",
    "экологи",
    "историки",
    "картографы",
    "лингвисты",
] as const;

interface Template {
    premises: CategoricalPremise[];
    query: Extract<AtomicQuery, { kind: "categorical" }>;
}

function categorical(id: string, quantifier: CategoricalQuantifier, subject: string, predicate: string): CategoricalPremise {
    return { kind: "categorical", id, quantifier, subject, predicate };
}

function entailingTemplate(quantifier: CategoricalQuantifier, branching: boolean): Template {
    if (branching && quantifier === "all") {
        return {
            premises: [
                categorical("p1", "all", "a", "b"),
                categorical("p2", "all", "a", "c"),
                categorical("p3", "all", "b", "d"),
                categorical("p4", "all", "c", "d"),
            ],
            query: { kind: "categorical", quantifier: "all", subject: "a", predicate: "d" },
        };
    }
    const second: CategoricalQuantifier = quantifier === "all" || quantifier === "some" ? "all" : "no";
    const first: CategoricalQuantifier = quantifier === "all" || quantifier === "no" ? "all" : "some";
    return {
        premises: [
            categorical("p1", first, "a", "b"),
            categorical("p2", second, "b", "c"),
        ],
        query: { kind: "categorical", quantifier, subject: "a", predicate: "c" },
    };
}

function unknownTemplate(quantifier: CategoricalQuantifier, branching: boolean): Template {
    const premises: CategoricalPremise[] = quantifier === "all"
        ? [categorical("p1", "some", "a", "b"), categorical("p2", "some", "c", "b")]
        : [categorical("p1", "all", "a", "b"), categorical("p2", "some", "b", "c")];
    if (branching) {
        premises.push(categorical("p3", "all", "d", "b"), categorical("p4", "someNot", "d", "c"));
    }
    return { premises, query: { kind: "categorical", quantifier, subject: "a", predicate: "c" } };
}

/** Reserved mixed-witness topology, never selected by the training partition. */
function assessmentTemplate(quantifier: CategoricalQuantifier, subject: string, predicate: string): Template {
    return {
        premises: [
            categorical("p1", "all", "a", "b"),
            categorical("p2", "no", "b", "c"),
            categorical("p3", "some", "c", "d"),
            categorical("p4", "no", "a", "d"),
        ],
        query: { kind: "categorical", quantifier, subject, predicate },
    };
}

function addDeclaredDistractors(template: Template, count: number): Template {
    const premises = [...template.premises];
    const offset = premises.filter(premise => premise.id.startsWith("d")).length;
    for (let index = 0; index < count; index++) {
        const subject = index % 2 ? "d" : "b";
        premises.push(categorical(`d${offset + index + 1}`, "all", subject, subject));
    }
    return { ...template, premises };
}

function desiredClassification(request: GenerationRequest, randomValue: number): InferenceClassification {
    if (request.target.responseFormat === "identifyNecessaryPremise" || request.target.responseFormat === "repairProof") {
        return randomValue < 0.5 ? "entailed" : "refuted";
    }
    if (request.target.responseFormat === "constructCounterexample") {
        return randomValue < 0.5 ? "refuted" : "underdetermined";
    }
    if (request.target.responseFormat === "constructSatisfyingModel") {
        return randomValue < 0.5 ? "entailed" : "underdetermined";
    }
    return randomValue < 1 / 3 ? "entailed" : randomValue < 2 / 3 ? "refuted" : "underdetermined";
}

export function generateCategoricalItem(
    request: GenerationRequest,
    control: GenerationControl = DEFAULT_GENERATION_CONTROL,
): GenerationResult {
    const startedAt = control.now();
    if (request.family !== "categorical") {
        return {
            ok: false,
            code: "unsupportedTarget",
            messageRu: "Категориальный генератор получил запрос для другого семейства отношений.",
            attempts: 0,
            elapsedMs: control.now() - startedAt,
            recoverable: false,
        };
    }
    if (request.target.responseFormat === "completeMapping") {
        return {
            ok: false,
            code: "unsupportedTarget",
            messageRu: "Завершение соответствия ролей относится к задачам на структуры, а не к категориальным выводам.",
            attempts: 0,
            elapsedMs: control.now() - startedAt,
            recoverable: true,
        };
    }
    if (request.target.displayedPremises.min < 1
        || request.target.displayedPremises.max < request.target.displayedPremises.min
        || request.target.displayedPremises.max > 12) {
        return {
            ok: false,
            code: "unsupportedTarget",
            messageRu: "Для категориального задания укажите от одной до двенадцати видимых посылок.",
            attempts: 0,
            elapsedMs: control.now() - startedAt,
            recoverable: true,
        };
    }
    if (request.semanticsVersion !== DEFAULT_SEMANTICS_VERSION && request.semanticsVersion !== EMPTY_CLASS_SEMANTICS_VERSION) {
        return {
            ok: false,
            code: "unsupportedTarget",
            messageRu: "Выбрана неизвестная версия категориальной семантики.",
            attempts: 0,
            elapsedMs: control.now() - startedAt,
            recoverable: false,
        };
    }
    const streams = createRandomStreams(request.seed);
    for (let attempt = 1; attempt <= request.maxAttempts; attempt++) {
        const budgetFailure = generationBudgetFailure(request, startedAt, control, attempt - 1);
        if (budgetFailure) return budgetFailure;
        const quantifiers: CategoricalQuantifier[] = ["all", "no", "some", "someNot"];
        const quantifier = streams.semantic.pick(quantifiers);
        const desired = desiredClassification(request, streams.semantic.next());
        const branching = request.target.level >= 3 && quantifier === "all";
        let template = desired === "underdetermined"
            ? unknownTemplate(quantifier, request.target.level >= 4)
            : entailingTemplate(quantifier, branching);
        if (desired === "refuted") {
            template = {
                ...template,
                query: { ...template.query, quantifier: negateCategoricalQuantifier(template.query.quantifier) },
            };
        }
        if (request.partition === "assessment") {
            const subject = streams.semantic.pick(["a", "b", "c", "d"]);
            const predicate = streams.semantic.pick(["a", "b", "c", "d"].filter(value => value !== subject));
            template = assessmentTemplate(quantifier, subject, predicate);
            if (template.premises.some(premise => premise.quantifier === quantifier
                && premise.subject === subject && premise.predicate === predicate)) continue;
        }
        const requiredPadding = Math.max(
            request.target.distractorCount,
            request.target.displayedPremises.min - template.premises.length,
        );
        template = addDeclaredDistractors(template, requiredPadding);
        if (!targetAllowsPremiseCount(request.target, template.premises.length)) continue;

        const entityIds = [...new Set(template.premises.flatMap(premise => [premise.subject, premise.predicate]).concat([
            template.query.subject,
            template.query.predicate,
        ]))].sort();
        const shuffledLabels = streams.presentation.shuffle(CLASS_LABELS).slice(0, entityIds.length);
        const entities: EntitySpec[] = entityIds.map((id, index) => ({ id, label: shuffledLabels[index], sort: "class" }));
        const semantics = SUPPORTED_SEMANTICS[request.semanticsVersion];
        const domain = {
            kind: "categoricalUnary" as const,
            closure: "unrestrictedUnaryPredicates" as const,
            existentialImport: semantics.existentialImport,
            namedClasses: entityIds,
        };
        const premises = streams.presentation.shuffle(template.premises);
        const solved = classifyCategorical(premises, template.query, domain);
        if (!solved.certificate.premisesSatisfiable || solved.classification !== desired) continue;
        const reference = referenceClassifyCategorical(premises, template.query, domain);
        if (reference !== desired) {
            return {
                ok: false,
                code: "internalValidationError",
                messageRu: "Независимые проверяющие процедуры дали разные ответы.",
                attempts: attempt,
                elapsedMs: control.now() - startedAt,
                recoverable: false,
            };
        }
        solved.certificate.verification.independentOracleChecked = true;
        let responseSpec;
        try {
            responseSpec = responseSpecFor(request.target, entities, premises, desired, {
                expectedRelation: template.query.quantifier,
                choices: ["all", "no", "some", "someNot"],
            });
        } catch {
            continue;
        }
        const fingerprint = structuralFingerprint(entities, premises, template.query, domain);
        const elapsedMs = control.now() - startedAt;
        return {
            ok: true,
            item: withMeasuredComplexity({
                id: `ri-${stableHash(`${request.seed}:${fingerprint}`)}`,
                schemaVersion: REASONING_ITEM_SCHEMA_VERSION,
                generatorVersion: GENERATOR_VERSION,
                semanticsVersion: request.semanticsVersion,
                solverVersion: SOLVER_VERSION,
                seed: request.seed,
                family: "categorical",
                componentFamilies: ["categorical"],
                structureFamily: request.partition === "assessment"
                    ? "assessment-categorical-reserved-mixed-witness-v1"
                    : `${request.partition}-categorical-${branching ? "branch" : "chain"}-${quantifier}`,
                grammarPartition: request.partition,
                domain,
                entities,
                premises,
                query: template.query,
                responseSpec,
                targetComplexity: request.target,
                semanticCertificate: solved.certificate,
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
            }),
        };
    }
    return {
        ok: false,
        code: "attemptBudgetExceeded",
        messageRu: "Не удалось построить задание с выбранным сочетанием свойств в пределах числа попыток.",
        attempts: request.maxAttempts,
        elapsedMs: control.now() - startedAt,
        recoverable: true,
    };
}
