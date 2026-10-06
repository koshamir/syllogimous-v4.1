import {
    DomainSpec,
    EntitySpec,
    GenerationRequest,
    GenerationResult,
    GraphEdgePremise,
    ResponseSpec,
} from "../models/semantic.models";
import { stableHash } from "../certificates/canonical";
import {
    canonicalGraphEncoding,
    graphPairHasMatchingDegreeSignature,
} from "../semantics/graph";
import {
    checkDegreeMatchedHardNegative,
    classifyGraphIsomorphism,
} from "../solvers/graph-solver";
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

function positivePair(permutation: readonly string[], expanded: boolean): GraphEdgePremise[] {
    const mapped = new Map(["s0", "s1", "s2"].map((source, index) => [source, permutation[index]]));
    const edges = [
        edge("g-s1", "source", "s0", "s1", "передаёт"),
        edge("g-s2", "source", "s1", "s2", "проверяет"),
        edge("g-t1", "target", mapped.get("s0")!, mapped.get("s1")!, "передаёт"),
        edge("g-t2", "target", mapped.get("s1")!, mapped.get("s2")!, "проверяет"),
    ];
    if (expanded) {
        edges.push(
            edge("g-s3", "source", "s0", "s2", "направляет"),
            edge("g-t3", "target", mapped.get("s0")!, mapped.get("s2")!, "направляет"),
        );
    }
    return edges;
}

/**
 * Four-node hard negative: a directed 2-cycle plus a separate edge versus a
 * directed path.  Every node has a matching local in/out-degree signature.
 */
export function degreeMatchedNegativeEdges(): GraphEdgePremise[] {
    return [
        edge("g-s1", "source", "s0", "s1", "связь"),
        edge("g-s2", "source", "s1", "s0", "связь"),
        edge("g-s3", "source", "s2", "s3", "связь"),
        edge("g-t1", "target", "t0", "t1", "связь"),
        edge("g-t2", "target", "t1", "t2", "связь"),
        edge("g-t3", "target", "t2", "t3", "связь"),
    ];
}

export function generateGraphItem(
    request: GenerationRequest,
    control: GenerationControl = DEFAULT_GENERATION_CONTROL,
): GenerationResult {
    const startedAt = control.now();
    if (request.family !== "graphStructure"
        || (request.target.responseFormat !== "threeWayInference" && request.target.responseFormat !== "completeMapping")) {
        return {
            ok: false,
            code: "unsupportedTarget",
            messageRu: "Графовая структура поддерживает проверку изоморфизма и завершение отображения узлов.",
            attempts: 0,
            elapsedMs: control.now() - startedAt,
            recoverable: true,
        };
    }
    const streams = createRandomStreams(request.seed);
    for (let attempt = 1; attempt <= request.maxAttempts; attempt++) {
        const budgetFailure = generationBudgetFailure(request, startedAt, control, attempt - 1);
        if (budgetFailure) return budgetFailure;
        const hardNegative = request.target.level >= 3 && request.target.responseFormat === "threeWayInference";
        const sourceIds = hardNegative ? ["s0", "s1", "s2", "s3"] : ["s0", "s1", "s2"];
        const targetIds = hardNegative ? ["t0", "t1", "t2", "t3"] : ["t0", "t1", "t2"];
        const premises = hardNegative
            ? degreeMatchedNegativeEdges()
            : positivePair(streams.semantic.shuffle(targetIds), request.target.level >= 2);
        if (!targetAllowsPremiseCount(request.target, premises.length)) continue;
        const relationLabels = [...new Set(premises.map(premise => premise.relationLabel))];
        const domain: Extract<DomainSpec, { kind: "boundedGraph" }> = {
            kind: "boundedGraph",
            closure: "closedFiniteDomain",
            directed: true,
            loopsAllowed: false,
            nodeIds: [...sourceIds, ...targetIds],
            relationLabels,
        };
        if (hardNegative) {
            const diagnostic = checkDegreeMatchedHardNegative(premises, domain, sourceIds, targetIds);
            if (!diagnostic.qualifies || !graphPairHasMatchingDegreeSignature(premises, sourceIds, targetIds, true)) {
                return {
                    ok: false,
                    code: "internalValidationError",
                    messageRu: "Контрольный отрицательный пример не прошёл точную проверку локальных степеней и отображений.",
                    attempts: attempt,
                    elapsedMs: control.now() - startedAt,
                    recoverable: false,
                };
            }
        }
        const entities: EntitySpec[] = [
            ...sourceIds.map((id, index): EntitySpec => ({
                id,
                label: `исходная роль ${index + 1}`,
                sort: "graphNode",
                features: { frame: "source", visibleShape: ["круг", "ромб", "квадрат", "звезда"][index] },
            })),
            ...targetIds.map((id, index): EntitySpec => ({
                id,
                label: `целевая роль ${index + 1}`,
                sort: "graphNode",
                features: { frame: "target", visibleShape: ["квадрат", "круг", "звезда", "ромб"][index] },
            })),
        ];
        const orderedPremises = streams.presentation.shuffle(premises);
        const certificate = classifyGraphIsomorphism(
            orderedPremises,
            domain,
            sourceIds,
            targetIds,
            "bijection",
        );
        const expected = hardNegative ? "refuted" : "entailed";
        if (certificate.classification !== expected) continue;
        const responseSpec: ResponseSpec = request.target.responseFormat === "completeMapping"
            ? { kind: "completeMapping", sourceIds, targetIds, contract: "bijection" }
            : responseSpecFor(request.target, entities, orderedPremises, expected);
        const exactPairEncoding = [
            canonicalGraphEncoding(premises, "source", sourceIds, true),
            canonicalGraphEncoding(premises, "target", targetIds, true),
        ].sort().join("||");
        const fingerprint = `graph-v1:${stableHash(`${exactPairEncoding}:${hardNegative}`)}`;
        return {
            ok: true,
            item: buildStructuralItem(request, {
                family: "graphStructure",
                componentFamilies: ["graphStructure"],
                structureFamily: `${request.partition}-graph-${hardNegative ? "degree-matched-2cycle-vs-path" : "multi-label-map"}`,
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
                scaffolds: request.target.level <= 2 ? ["partialGraph", "workspace"] : ["workspace"],
                fingerprint,
            }),
        };
    }
    return {
        ok: false,
        code: "targetMismatch",
        messageRu: "Для выбранной графовой структуры требуется четыре или шесть атомарных связей; целевой диапазон не изменён автоматически.",
        attempts: request.maxAttempts,
        elapsedMs: control.now() - startedAt,
        recoverable: true,
    };
}
