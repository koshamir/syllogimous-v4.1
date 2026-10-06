import { DomainSpec, EntityId, GraphEdgePremise } from "../models/semantic.models";

export interface MappingViolation {
    code:
        | "missingSource"
        | "unknownSource"
        | "unknownTarget"
        | "duplicateSource"
        | "notInjective"
        | "missingRelation"
        | "extraRelation"
        | "invalidGraph";
    messageRu: string;
    source?: EntityId;
    target?: EntityId;
    relationLabel?: string;
}

function edgeKey(from: EntityId, to: EntityId, label: string, directed: boolean): string {
    const ordered = directed || from <= to ? [from, to] : [to, from];
    return `${ordered[0]}\u0000${label}\u0000${ordered[1]}`;
}

export function validateGraphDefinition(
    edges: readonly GraphEdgePremise[],
    domain: Extract<DomainSpec, { kind: "boundedGraph" }>,
    sourceIds: readonly EntityId[],
    targetIds: readonly EntityId[],
): string[] {
    const errors: string[] = [];
    const source = new Set(sourceIds);
    const target = new Set(targetIds);
    const domainNodes = new Set(domain.nodeIds);
    if (source.size !== sourceIds.length || target.size !== targetIds.length) {
        errors.push("В одной структуре идентификатор узла повторяется.");
    }
    if (sourceIds.some(id => target.has(id))) errors.push("Исходные и целевые идентификаторы узлов должны различаться.");
    if ([...source, ...target].some(id => !domainNodes.has(id))) {
        errors.push("Узел структуры отсутствует в объявленном конечном домене.");
    }
    const seenEdges = new Set<string>();
    for (const edge of edges) {
        const frame = edge.graphId === "source" ? source : target;
        if (!frame.has(edge.from) || !frame.has(edge.to)) errors.push(`Ребро «${edge.id}» пересекает границу структуры.`);
        if (!domain.relationLabels.includes(edge.relationLabel)) errors.push(`Метка ребра «${edge.id}» не объявлена.`);
        if (!domain.loopsAllowed && edge.from === edge.to) errors.push(`Петля «${edge.id}» запрещена договором.`);
        const semanticKey = `${edge.graphId}\u0000${edgeKey(edge.from, edge.to, edge.relationLabel, domain.directed)}`;
        if (seenEdges.has(semanticKey)) errors.push(`Ребро «${edge.id}» дублирует уже заданную связь.`);
        seenEdges.add(semanticKey);
    }
    return errors;
}

export function validateGraphMapping(
    edges: readonly GraphEdgePremise[],
    domain: Extract<DomainSpec, { kind: "boundedGraph" }>,
    sourceIds: readonly EntityId[],
    targetIds: readonly EntityId[],
    pairs: readonly { source: EntityId; target: EntityId }[],
    contract: "bijection" | "injectiveHomomorphism" | "homomorphism",
): { valid: boolean; violations: MappingViolation[] } {
    const violations: MappingViolation[] = [];
    const definitionErrors = validateGraphDefinition(edges, domain, sourceIds, targetIds);
    if (definitionErrors.length) return {
        valid: false,
        violations: definitionErrors.map(messageRu => ({ code: "invalidGraph", messageRu })),
    };
    const map = new Map<EntityId, EntityId>();
    for (const pair of pairs) {
        if (map.has(pair.source)) {
            violations.push({
                code: "duplicateSource",
                source: pair.source,
                messageRu: `Для исходного узла «${pair.source}» соответствие указано более одного раза.`,
            });
        } else {
            map.set(pair.source, pair.target);
        }
    }
    const knownNodes = new Set(domain.nodeIds);
    const knownLabels = new Set(domain.relationLabels);
    for (const edge of edges) {
        if (!knownNodes.has(edge.from) || !knownNodes.has(edge.to)
            || !knownLabels.has(edge.relationLabel)
            || (!domain.loopsAllowed && edge.from === edge.to)) {
            violations.push({
                code: "invalidGraph",
                relationLabel: edge.relationLabel,
                messageRu: `Ребро «${edge.id}» не соответствует объявленному конечному графу.`,
            });
        }
    }
    for (const source of sourceIds) {
        if (!map.has(source)) {
            violations.push({ code: "missingSource", source, messageRu: `Для узла «${source}» не задано соответствие.` });
        }
    }
    for (const [source, target] of map) {
        if (!sourceIds.includes(source)) {
            violations.push({ code: "unknownSource", source, messageRu: `Узел источника «${source}» не объявлен.` });
        }
        if (!targetIds.includes(target)) {
            violations.push({ code: "unknownTarget", target, messageRu: `Узел цели «${target}» не объявлен.` });
        }
    }
    if (contract !== "homomorphism" && new Set(map.values()).size !== map.size) {
        violations.push({ code: "notInjective", messageRu: "Два исходных узла сопоставлены одному целевому узлу." });
    }
    if (contract === "bijection" && (sourceIds.length !== targetIds.length || map.size !== sourceIds.length)) {
        violations.push({ code: "missingSource", messageRu: "Для биекции нужно сопоставить каждый узел ровно одному узлу другой структуры." });
    }

    const sourceEdges = edges.filter(edge => edge.graphId === "source");
    const targetEdges = edges.filter(edge => edge.graphId === "target");
    const targetKeys = new Set(targetEdges.map(edge => edgeKey(edge.from, edge.to, edge.relationLabel, domain.directed)));
    for (const edge of sourceEdges) {
        const mappedFrom = map.get(edge.from);
        const mappedTo = map.get(edge.to);
        if (mappedFrom && mappedTo && !targetKeys.has(edgeKey(mappedFrom, mappedTo, edge.relationLabel, domain.directed))) {
            violations.push({
                code: "missingRelation",
                source: edge.from,
                target: edge.to,
                relationLabel: edge.relationLabel,
                messageRu: `Связь «${edge.relationLabel}» между ролями ${edge.from} и ${edge.to} не сохраняется.`,
            });
        }
    }
    if (contract === "bijection") {
        const mappedSourceKeys = new Set(sourceEdges.flatMap(edge => {
            const from = map.get(edge.from);
            const to = map.get(edge.to);
            return from && to ? [edgeKey(from, to, edge.relationLabel, domain.directed)] : [];
        }));
        for (const edge of targetEdges) {
            if (!mappedSourceKeys.has(edgeKey(edge.from, edge.to, edge.relationLabel, domain.directed))) {
                violations.push({
                    code: "extraRelation",
                    relationLabel: edge.relationLabel,
                    messageRu: `В целевой структуре есть лишняя связь «${edge.relationLabel}», которой нет в источнике.`,
                });
            }
        }
    }
    return { valid: violations.length === 0, violations };
}

export function findGraphMappings(
    edges: readonly GraphEdgePremise[],
    domain: Extract<DomainSpec, { kind: "boundedGraph" }>,
    sourceIds: readonly EntityId[],
    targetIds: readonly EntityId[],
    contract: "bijection" | "injectiveHomomorphism" | "homomorphism",
    limit = 256,
): Array<Array<{ source: EntityId; target: EntityId }>> {
    const mappings: Array<Array<{ source: EntityId; target: EntityId }>> = [];
    if (!Number.isSafeInteger(limit) || limit < 1) return mappings;
    const definitionErrors = validateGraphDefinition(edges, domain, sourceIds, targetIds);
    if (definitionErrors.length) throw new Error(definitionErrors.join(" "));
    if (contract === "bijection" && sourceIds.length !== targetIds.length) return mappings;
    const current: Array<{ source: EntityId; target: EntityId }> = [];
    const visit = (index: number): void => {
        if (mappings.length >= limit) return;
        if (index === sourceIds.length) {
            if (validateGraphMapping(edges, domain, sourceIds, targetIds, current, contract).valid) {
                mappings.push(current.map(pair => ({ ...pair })));
            }
            return;
        }
        for (const target of targetIds) {
            if (contract !== "homomorphism" && current.some(pair => pair.target === target)) continue;
            current.push({ source: sourceIds[index], target });
            visit(index + 1);
            current.pop();
        }
    };
    visit(0);
    return mappings;
}

export function degreeSignature(
    edges: readonly GraphEdgePremise[],
    graphId: "source" | "target",
    nodeIds: readonly EntityId[],
    directed: boolean,
): string {
    const graphEdges = edges.filter(edge => edge.graphId === graphId);
    return nodeIds.map(node => {
        const outgoing = graphEdges.filter(edge => edge.from === node || (!directed && edge.to === node)).length;
        const incoming = directed
            ? graphEdges.filter(edge => edge.to === node).length
            : outgoing;
        return `${outgoing}:${incoming}`;
    }).sort().join("|");
}

export function graphPairHasMatchingDegreeSignature(
    edges: readonly GraphEdgePremise[],
    sourceIds: readonly EntityId[],
    targetIds: readonly EntityId[],
    directed: boolean,
): boolean {
    return degreeSignature(edges, "source", sourceIds, directed)
        === degreeSignature(edges, "target", targetIds, directed);
}

/** Exact canonical adjacency encoding for one small, labelled graph. */
export function canonicalGraphEncoding(
    edges: readonly GraphEdgePremise[],
    graphId: "source" | "target",
    nodeIds: readonly EntityId[],
    directed: boolean,
): string {
    if (nodeIds.length > 7) throw new Error("Exact graph canonicalization is limited to seven nodes per frame");
    const graphEdges = edges.filter(edge => edge.graphId === graphId);
    const encodings: string[] = [];
    const order: EntityId[] = [];
    const used = new Set<EntityId>();
    const visit = (): void => {
        if (order.length === nodeIds.length) {
            const index = new Map(order.map((node, position) => [node, position]));
            encodings.push(graphEdges.map(edge => {
                const from = index.get(edge.from)!;
                const to = index.get(edge.to)!;
                const roles = directed || from <= to ? [from, to] : [to, from];
                return `${roles[0]}:${edge.relationLabel}:${roles[1]}`;
            }).sort().join("|"));
            return;
        }
        for (const node of nodeIds) {
            if (used.has(node)) continue;
            used.add(node);
            order.push(node);
            visit();
            order.pop();
            used.delete(node);
        }
    };
    visit();
    return encodings.sort()[0] ?? "";
}
