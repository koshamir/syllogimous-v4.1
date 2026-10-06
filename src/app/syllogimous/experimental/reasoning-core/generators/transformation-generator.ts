import {
    AtomicQuery,
    DomainSpec,
    EntitySpec,
    GenerationRequest,
    GenerationResult,
    TransformationPremise,
    TransformOperator,
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
import {
    applyTransformationSequence,
    evaluateTransformationChain,
    GridPoint,
} from "../semantics/transformations";
import { classifyTransformation } from "../solvers/transformation-solver";
import { groundExpressionCertificate } from "./bounded-generator-helpers";
import {
    DEFAULT_GENERATION_CONTROL,
    GenerationControl,
    generationBudgetFailure,
    responseSpecFor,
    targetAllowsPremiseCount,
} from "./generator-utils";
import { createRandomStreams, SeededRandom } from "./seeded-random";

type TransformationQuery = Extract<AtomicQuery, { kind: "transformationResult" }>;
type TransformationDomain = Extract<DomainSpec, { kind: "boundedTransformations" }>;

const DOMAIN: TransformationDomain = {
    kind: "boundedTransformations",
    closure: "listedStatesOnly",
    width: 3,
    height: 3,
    frame: "fixedAxes",
};

const CORNERS_AND_EDGES: readonly GridPoint[] = [
    [0, 0], [2, 0], [0, 2], [2, 2], [1, 0], [2, 1], [1, 2], [0, 1],
];

function minimumComposition(level: GenerationRequest["target"]["level"]): number {
    return level === 1 ? 1 : level <= 3 ? 2 : level === 4 ? 3 : 4;
}

function baseOperators(request: GenerationRequest, random: SeededRandom): TransformOperator[] {
    if (request.partition === "training") {
        if (request.target.level === 1) return [random.pick(["rotate90", "rotate180", "rotate270"] as const)];
        if (request.target.level === 2) {
            return random.bool()
                ? ["rotate90", "rotate90"]
                : ["rotate270", "rotate180"];
        }
        return random.bool()
            ? ["rotate90", "reflectVertical"]
            : ["reflectHorizontal", "rotate270"];
    }
    if (request.partition === "development") {
        if (request.target.level <= 2) return ["reflectHorizontal", "reflectVertical"];
        return random.bool()
            ? ["reflectHorizontal", "rotate90"]
            : ["rotate270", "reflectVertical"];
    }
    if (request.target.level <= 2) return ["reflectVertical", "rotate180"];
    return random.bool()
        ? ["rotate270", "reflectHorizontal"]
        : ["reflectVertical", "rotate90"];
}

function operatorSequence(request: GenerationRequest, random: SeededRandom, count: number): TransformOperator[] {
    const operators = baseOperators(request, random).slice(0, count);
    const extensionPool: readonly TransformOperator[] = request.partition === "assessment"
        ? ["rotate270", "reflectHorizontal", "rotate90"]
        : request.partition === "development"
            ? ["reflectVertical", "rotate180", "reflectHorizontal"]
            : ["rotate90", "rotate180", "reflectVertical"];
    while (operators.length < count) operators.push(random.pick(extensionPool));
    return operators;
}

function samePoint(left: GridPoint, right: GridPoint): boolean {
    return left[0] === right[0] && left[1] === right[1];
}

function chooseInitialPoint(operators: readonly TransformOperator[], random: SeededRandom): {
    point: GridPoint;
    orderSensitive: boolean;
} {
    const reversed = [...operators].reverse();
    for (const point of random.shuffle(CORNERS_AND_EDGES)) {
        const forwardResult = applyTransformationSequence(point, operators, DOMAIN);
        const reversedResult = applyTransformationSequence(point, reversed, DOMAIN);
        if (forwardResult.ok && reversedResult.ok && !samePoint(forwardResult.value.point, reversedResult.value.point)) {
            return { point: [...point], orderSensitive: true };
        }
    }
    return { point: [...random.pick(CORNERS_AND_EDGES)], orderSensitive: false };
}

function transformationPremises(operators: readonly TransformOperator[]): TransformationPremise[] {
    return operators.map((operator, index) => ({
        kind: "transformation",
        id: `p${index + 1}`,
        operator,
        inputState: `s${index}`,
        outputState: `s${index + 1}`,
        order: index + 1,
    }));
}

function alternatePoint(actual: GridPoint): GridPoint {
    return [(actual[0] + 1) % DOMAIN.width, actual[1]];
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

export function generateTransformationItem(
    request: GenerationRequest,
    control: GenerationControl = DEFAULT_GENERATION_CONTROL,
): GenerationResult {
    const startedAt = control.now();
    if (request.family !== "transformations") {
        return unsupported(startedAt, control, "Этот генератор создаёт только задания о порядке геометрических преобразований.");
    }
    if (request.semanticsVersion !== DEFAULT_SEMANTICS_VERSION && request.semanticsVersion !== EMPTY_CLASS_SEMANTICS_VERSION) {
        return unsupported(startedAt, control, "Выбрана неизвестная версия семантики экспериментального режима.");
    }
    if (request.target.responseFormat !== "threeWayInference") {
        return unsupported(startedAt, control, "Текущий фрагмент преобразований поддерживает только определение статуса вывода.");
    }
    const requiredComposition = minimumComposition(request.target.level);
    if (request.target.displayedPremises.min < 1
        || request.target.displayedPremises.max < request.target.displayedPremises.min
        || request.target.displayedPremises.max > 7
        || request.target.displayedPremises.max < requiredComposition) {
        return unsupported(
            startedAt,
            control,
            `Для уровня ${request.target.level} нужна последовательность от ${requiredComposition} до семи преобразований.`,
        );
    }

    const streams = createRandomStreams(request.seed);
    for (let attempt = 1; attempt <= request.maxAttempts; attempt++) {
        const budgetFailure = generationBudgetFailure(request, startedAt, control, attempt - 1);
        if (budgetFailure) return budgetFailure;
        const compositionLength = Math.max(requiredComposition, request.target.displayedPremises.min);
        if (!targetAllowsPremiseCount(request.target, compositionLength)) continue;
        const operators = operatorSequence(request, streams.semantic, compositionLength);
        const chosenPoint = chooseInitialPoint(operators, streams.semantic);
        const applied = applyTransformationSequence(chosenPoint.point, operators, DOMAIN);
        if (!applied.ok) continue;
        const desired = streams.semantic.bool() ? "entailed" as const : "refuted" as const;
        const query: TransformationQuery = {
            kind: "transformationResult",
            initialPoint: chosenPoint.point,
            operators,
            expectedPoint: desired === "entailed" ? applied.value.point : alternatePoint(applied.value.point),
        };
        const premises = transformationPremises(operators);
        const chain = evaluateTransformationChain(premises, "s0", chosenPoint.point, DOMAIN);
        const solved = classifyTransformation(query, DOMAIN);
        if (!chain.ok || !solved.ok || solved.classification !== desired) continue;
        if (!samePoint(chain.world.finalPoint, solved.queryWorld.finalPoint)) continue;
        const semanticCertificate = groundExpressionCertificate(
            solved.classification,
            solved.finiteDomainAssumption,
            solved.queryWorld,
        );
        const lateBudgetFailure = generationBudgetFailure(request, startedAt, control, attempt);
        if (lateBudgetFailure) return lateBudgetFailure;

        const entities: EntitySpec[] = Array.from({ length: operators.length + 1 }, (_, index) => ({
            id: `s${index}`,
            label: index === 0 ? "исходное состояние" : `состояние после шага ${index}`,
            sort: "position",
            features: { sequenceIndex: index },
        }));
        const responseSpec = responseSpecFor(request.target, entities, premises, desired);
        const fingerprint = structuralFingerprint(entities, premises, query, DOMAIN);
        const elapsedMs = control.now() - startedAt;
        const baseItem = withMeasuredComplexity({
            id: `ri-transform-${stableHash(`${request.seed}:${fingerprint}`)}`,
            schemaVersion: REASONING_ITEM_SCHEMA_VERSION,
            generatorVersion: GENERATOR_VERSION,
            semanticsVersion: request.semanticsVersion,
            solverVersion: SOLVER_VERSION,
            seed: request.seed,
            family: "transformations",
            componentFamilies: ["transformations"],
            structureFamily: `${request.partition}-transform-${chosenPoint.orderSensitive ? "order-sensitive" : "control"}-l${request.target.level}`,
            grammarPartition: request.partition,
            domain: DOMAIN,
            entities,
            premises,
            query,
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
                    noncommutative: chosenPoint.orderSensitive,
                },
            },
        };
    }
    return {
        ok: false,
        code: "attemptBudgetExceeded",
        messageRu: "Не удалось построить задание о преобразованиях в пределах числа попыток.",
        attempts: request.maxAttempts,
        elapsedMs: control.now() - startedAt,
        recoverable: true,
    };
}
