import {
    DomainSpec,
    EntitySpec,
    GenerationRequest,
    GenerationResult,
    GraphEdgePremise,
    InferenceClassification,
    ResponseSpec,
} from "../models/semantic.models";
import { classifyStructuralAnalogy } from "../solvers/analogy-solver";
import {
    scoreMissingRelationLabel,
    StructuralMappingProblem,
} from "../semantics/structural-mapping";
import { createRandomStreams } from "./seeded-random";
import {
    DEFAULT_GENERATION_CONTROL,
    GenerationControl,
    generationBudgetFailure,
    responseSpecFor,
    targetAllowsPremiseCount,
} from "./generator-utils";
import { buildStructuralItem } from "./structural-item-builder";

function edge(
    id: string,
    graphId: "source" | "target",
    from: string,
    to: string,
    relationLabel: string,
): GraphEdgePremise {
    return { kind: "graphEdge", id, graphId, from, to, relationLabel };
}

export function generateAnalogyItem(
    request: GenerationRequest,
    control: GenerationControl = DEFAULT_GENERATION_CONTROL,
): GenerationResult {
    const startedAt = control.now();
    const supportedFormat = request.target.responseFormat === "threeWayInference"
        || request.target.responseFormat === "completeMapping"
        || request.target.responseFormat === "identifyMissingRelation";
    if (request.family !== "analogy" || !supportedFormat) {
        return {
            ok: false,
            code: "unsupportedTarget",
            messageRu: "Структурная аналогия поддерживает проверку вывода, восстановление связи и завершение отображения ролей.",
            attempts: 0,
            elapsedMs: control.now() - startedAt,
            recoverable: true,
        };
    }
    const streams = createRandomStreams(request.seed);
    for (let attempt = 1; attempt <= request.maxAttempts; attempt++) {
        const budgetFailure = generationBudgetFailure(request, startedAt, control, attempt - 1);
        if (budgetFailure) return budgetFailure;
        const missingRelation = request.target.responseFormat === "identifyMissingRelation";
        const positive = request.target.responseFormat === "completeMapping"
            || (!missingRelation && streams.semantic.bool());
        const sourceIds = ["source-agent", "source-object", "source-checker"];
        const targetIds = ["target-a", "target-b", "target-c"];
        const permutation = streams.semantic.shuffle(targetIds);
        const mapped = new Map(sourceIds.map((source, index) => [source, permutation[index]]));
        const relationLabels = request.target.level >= 3
            ? ["передаёт", "проверяет", "направляет"]
            : ["передаёт", "проверяет"];
        const premises: GraphEdgePremise[] = [
            edge("a-s1", "source", "source-agent", "source-object", "передаёт"),
            edge("a-s2", "source", "source-object", "source-checker", "проверяет"),
        ];
        if (request.target.level >= 3) {
            premises.push(edge("a-s3", "source", "source-agent", "source-checker", "направляет"));
        }
        premises.push(edge("a-t1", "target", mapped.get("source-agent")!, mapped.get("source-object")!, "передаёт"));
        if (!missingRelation) {
            premises.push(positive
                ? edge("a-t2", "target", mapped.get("source-object")!, mapped.get("source-checker")!, "проверяет")
                : edge("a-t2", "target", mapped.get("source-checker")!, mapped.get("source-object")!, "проверяет"));
        }
        if (request.target.level >= 3) {
            premises.push(edge("a-t3", "target", mapped.get("source-agent")!, mapped.get("source-checker")!, "направляет"));
        }
        if (!targetAllowsPremiseCount(request.target, premises.length)) continue;

        const entities: EntitySpec[] = [
            { id: "source-agent", label: "маяк", sort: "graphNode", features: { frame: "source", surface: "круг" } },
            { id: "source-object", label: "лодка", sort: "graphNode", features: { frame: "source", surface: "треугольник" } },
            { id: "source-checker", label: "порт", sort: "graphNode", features: { frame: "source", surface: "квадрат" } },
            // Surface features deliberately favour the wrong reversed-role pairing.
            { id: "target-a", label: "архив", sort: "graphNode", features: { frame: "target", surface: "треугольник" } },
            { id: "target-b", label: "курьер", sort: "graphNode", features: { frame: "target", surface: "квадрат" } },
            { id: "target-c", label: "редактор", sort: "graphNode", features: { frame: "target", surface: "круг" } },
        ];
        const domain: Extract<DomainSpec, { kind: "boundedGraph" }> = {
            kind: "boundedGraph",
            closure: "closedFiniteDomain",
            directed: true,
            loopsAllowed: false,
            nodeIds: [...sourceIds, ...targetIds],
            relationLabels,
        };
        const orderedPremises = streams.presentation.shuffle(premises);
        const problem: StructuralMappingProblem = {
            contract: "bijection",
            domain,
            entities,
            sourceIds,
            targetIds,
            edges: orderedPremises,
        };
        const certificate = classifyStructuralAnalogy(problem);
        const desired: InferenceClassification = positive && !missingRelation ? "entailed" : "refuted";
        if (certificate.classification !== desired) continue;
        let responseSpec: ResponseSpec;
        if (request.target.responseFormat === "completeMapping") {
            responseSpec = { kind: "completeMapping", sourceIds, targetIds, contract: "bijection" };
        } else if (missingRelation) {
            const repaired = scoreMissingRelationLabel(problem, relationLabels, "проверяет");
            if (!repaired.correct || repaired.acceptedLabels.length !== 1) continue;
            responseSpec = {
                kind: "identifyMissingRelation",
                choices: relationLabels,
                expectedRelation: repaired.acceptedLabels[0],
            };
        } else {
            responseSpec = responseSpecFor(request.target, entities, orderedPremises, desired);
        }
        return {
            ok: true,
            item: buildStructuralItem(request, {
                family: "analogy",
                componentFamilies: ["analogy"],
                structureFamily: `${request.partition}-analogy-directed-roles-${missingRelation ? "missing-relation" : positive ? "match" : "role-reversal"}`,
                domain,
                entities,
                premises: orderedPremises,
                query: { kind: "graphIsomorphism", mappingContract: "bijection" },
                responseSpec,
                semanticCertificate: certificate,
                attempt,
                startedAt,
                now: control.now,
                labelVariant: streams.presentation.int(0, 2),
                scaffolds: request.target.level <= 2 ? ["roleLabels", "partialGraph", "workspace"] : ["workspace"],
            }),
        };
    }
    return {
        ok: false,
        code: "attemptBudgetExceeded",
        messageRu: "Не удалось построить структурную аналогию в заданном диапазоне посылок.",
        attempts: request.maxAttempts,
        elapsedMs: control.now() - startedAt,
        recoverable: true,
    };
}
