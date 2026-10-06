import {
    AtomicQuery,
    DomainSpec,
    EntitySpec,
    GenerationRequest,
    GenerationResult,
    RationalPremise,
    RationalRelation,
    RationalValue,
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
import { classifyProportional } from "../solvers/proportional-solver";
import { multiplyRational, rational } from "../semantics/rational";
import { groundExpressionCertificate } from "./bounded-generator-helpers";
import {
    DEFAULT_GENERATION_CONTROL,
    GenerationControl,
    generationBudgetFailure,
    responseSpecFor,
    targetAllowsPremiseCount,
} from "./generator-utils";
import { createRandomStreams, SeededRandom } from "./seeded-random";

type RationalQuery = Extract<AtomicQuery, { kind: "rational" }>;
type RationalDomain = Extract<DomainSpec, { kind: "exactRationals" }>;

interface RationalTemplate {
    tag: string;
    query: RationalQuery;
}

const UNITS_BY_PARTITION: Readonly<Record<GenerationRequest["partition"], string>> = {
    training: "доля",
    development: "условная единица",
    assessment: "часть целого",
};

const NUMBER_LABELS_BY_PARTITION: Readonly<Record<GenerationRequest["partition"], readonly string[]>> = {
    training: ["первая величина", "вторая величина", "результат"],
    development: ["исходная доля", "коэффициент", "полученная доля"],
    assessment: ["величина «Лён»", "величина «Мак»", "величина «Ирис»"],
};

function premise(
    id: string,
    relation: RationalRelation,
    left: RationalValue,
    right: RationalValue,
    units: string,
    result?: RationalValue,
): RationalPremise {
    return { kind: "rational", id, relation, left, right, result, units };
}

function comparisonTemplate(
    relation: "ratioLess" | "ratioGreater",
    entailed: boolean,
    random: SeededRandom,
    units: string,
    fractional: boolean,
): RationalTemplate {
    const denominator = fractional ? random.int(2, 6) : 1;
    const lowNumerator = random.int(1, Math.max(1, denominator));
    const gap = random.int(1, 3);
    const low = rational(lowNumerator, denominator);
    const high = rational(lowNumerator + gap, denominator);
    const left = relation === "ratioLess" ? low : high;
    const right = relation === "ratioLess" ? high : low;
    return {
        tag: fractional ? `fraction-${relation}` : `integer-${relation}`,
        query: {
            kind: "rational",
            relation,
            left: entailed ? left : right,
            right: entailed ? right : left,
            units,
        },
    };
}

function equalityTemplate(entailed: boolean, random: SeededRandom, units: string): RationalTemplate {
    const numerator = random.int(1, 5);
    const denominator = random.int(2, 6);
    const multiplier = random.int(2, 4);
    return {
        tag: "equivalent-ratios",
        query: {
            kind: "rational",
            relation: "ratioEqual",
            left: rational(numerator, denominator),
            right: entailed
                ? rational(numerator * multiplier, denominator * multiplier)
                : rational(numerator * multiplier + 1, denominator * multiplier),
            units,
        },
    };
}

function scalingTemplate(entailed: boolean, random: SeededRandom, units: string): RationalTemplate {
    const left = rational(random.int(1, 4), random.int(2, 5));
    const right = rational(random.int(1, 4), random.int(2, 4));
    const correct = multiplyRational(left, right);
    const proposed = entailed
        ? correct
        : rational(correct.numerator + correct.denominator, correct.denominator);
    return {
        tag: "exact-scaling",
        query: { kind: "rational", relation: "scaledBy", left, right, result: proposed, units },
    };
}

function selectTemplate(
    request: GenerationRequest,
    entailed: boolean,
    random: SeededRandom,
    units: string,
): RationalTemplate {
    if (request.partition === "training") {
        if (request.target.level === 1) return comparisonTemplate(random.bool() ? "ratioLess" : "ratioGreater", entailed, random, units, false);
        if (request.target.level <= 3) return comparisonTemplate(random.bool() ? "ratioLess" : "ratioGreater", entailed, random, units, true);
        return random.bool() ? equalityTemplate(entailed, random, units) : scalingTemplate(entailed, random, units);
    }
    if (request.partition === "development") {
        return request.target.level <= 2
            ? equalityTemplate(entailed, random, units)
            : scalingTemplate(entailed, random, units);
    }
    return request.target.level <= 2
        ? comparisonTemplate(random.bool() ? "ratioLess" : "ratioGreater", entailed, random, units, true)
        : random.bool(0.65)
            ? scalingTemplate(entailed, random, units)
            : equalityTemplate(entailed, random, units);
}

function truePremise(index: number, random: SeededRandom, units: string): RationalPremise {
    switch (index % 4) {
        case 0: {
            const numerator = random.int(1, 4);
            const denominator = random.int(2, 6);
            return premise(`p${index + 1}`, "ratioEqual", rational(numerator, denominator), rational(numerator * 2, denominator * 2), units);
        }
        case 1: {
            const denominator = random.int(2, 6);
            const numerator = random.int(1, denominator);
            return premise(`p${index + 1}`, "ratioLess", rational(numerator, denominator), rational(numerator + 1, denominator), units);
        }
        case 2: {
            const denominator = random.int(2, 6);
            const numerator = random.int(2, denominator + 2);
            return premise(`p${index + 1}`, "ratioGreater", rational(numerator, denominator), rational(numerator - 1, denominator), units);
        }
        default: {
            const left = rational(random.int(1, 3), random.int(2, 4));
            const right = rational(random.int(1, 3), random.int(2, 4));
            return premise(`p${index + 1}`, "scaledBy", left, right, units, multiplyRational(left, right));
        }
    }
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

export function generateProportionalItem(
    request: GenerationRequest,
    control: GenerationControl = DEFAULT_GENERATION_CONTROL,
): GenerationResult {
    const startedAt = control.now();
    if (request.family !== "proportional") {
        return unsupported(startedAt, control, "Этот генератор создаёт только задания на точные пропорции.");
    }
    if (request.semanticsVersion !== DEFAULT_SEMANTICS_VERSION && request.semanticsVersion !== EMPTY_CLASS_SEMANTICS_VERSION) {
        return unsupported(startedAt, control, "Выбрана неизвестная версия семантики экспериментального режима.");
    }
    if (request.target.responseFormat !== "threeWayInference") {
        return unsupported(startedAt, control, "Текущий точный числовой фрагмент поддерживает только определение статуса вывода.");
    }
    if (request.target.displayedPremises.min < 0
        || request.target.displayedPremises.max < request.target.displayedPremises.min
        || request.target.displayedPremises.max > 8) {
        return unsupported(startedAt, control, "Для пропорционального задания укажите не более восьми видимых посылок.");
    }

    const streams = createRandomStreams(request.seed);
    const units = UNITS_BY_PARTITION[request.partition];
    const domain: RationalDomain = { kind: "exactRationals", closure: "listedValuesOnly", units };
    for (let attempt = 1; attempt <= request.maxAttempts; attempt++) {
        const budgetFailure = generationBudgetFailure(request, startedAt, control, attempt - 1);
        if (budgetFailure) return budgetFailure;
        const desired = streams.semantic.bool() ? "entailed" as const : "refuted" as const;
        const template = selectTemplate(request, desired === "entailed", streams.semantic, units);
        const premiseCount = Math.max(request.target.displayedPremises.min, request.target.distractorCount);
        if (!targetAllowsPremiseCount(request.target, premiseCount)) continue;
        const semanticPremises = Array.from(
            { length: premiseCount },
            (_, index) => truePremise(index, streams.semantic, units),
        );
        const solved = classifyProportional(semanticPremises, template.query, domain);
        if (!solved.ok || solved.classification !== desired) continue;
        const semanticCertificate = groundExpressionCertificate(
            solved.classification,
            solved.finiteDomainAssumption,
        );
        const lateBudgetFailure = generationBudgetFailure(request, startedAt, control, attempt);
        if (lateBudgetFailure) return lateBudgetFailure;

        const labels = streams.presentation.shuffle(NUMBER_LABELS_BY_PARTITION[request.partition]);
        const entities: EntitySpec[] = labels.map((label, index) => ({
            id: `n${index + 1}`,
            label,
            sort: "number",
            features: { semanticRole: index === 0 ? "left" : index === 1 ? "right" : "result" },
        }));
        const premises = streams.presentation.shuffle(semanticPremises);
        const responseSpec = responseSpecFor(request.target, entities, premises, desired);
        const fingerprint = structuralFingerprint(entities, premises, template.query, domain);
        const elapsedMs = control.now() - startedAt;
        const baseItem = withMeasuredComplexity({
            id: `ri-proportion-${stableHash(`${request.seed}:${fingerprint}`)}`,
            schemaVersion: REASONING_ITEM_SCHEMA_VERSION,
            generatorVersion: GENERATOR_VERSION,
            semanticsVersion: request.semanticsVersion,
            solverVersion: SOLVER_VERSION,
            seed: request.seed,
            family: "proportional",
            componentFamilies: ["proportional"],
            structureFamily: `${request.partition}-proportional-${template.tag}-ground-l${request.target.level}`,
            grammarPartition: request.partition,
            domain,
            entities,
            premises,
            query: template.query,
            responseSpec,
            targetComplexity: request.target,
            semanticCertificate,
            structuralFingerprint: fingerprint,
            presentation: {
                locale: "ru",
                premiseOrder: premises.map(item => item.id),
                labelVariant: streams.presentation.int(0, 3),
                stableAnswerOrder: ["entailed", "refuted", "underdetermined"],
                negationCue: "textAndSymbol",
                scaffolds: request.target.level <= 2 ? ["workedFirstStep", "workspace"] : ["workspace"],
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
                    admissibleModelCount: 1,
                    modelCountStatus: "exact",
                    modelCountDomainNote: solved.finiteDomainAssumption,
                },
            },
        };
    }
    return {
        ok: false,
        code: "attemptBudgetExceeded",
        messageRu: "Не удалось построить точное пропорциональное задание в пределах числа попыток.",
        attempts: request.maxAttempts,
        elapsedMs: control.now() - startedAt,
        recoverable: true,
    };
}
