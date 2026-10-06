import { GraphEdgePremise, TransformOperator } from "../models/semantic.models";

/** Diagnostic fluency algorithms, not evidence of shortcut absence or capacity. */
export function parityStrategyBot(
    edges: readonly { left: string; right: string; opposite: boolean }[], left: string, right: string,
): boolean | null {
    const queue: Array<[string, boolean]> = [[left, false]], seen = new Map<string, boolean>();
    for (let index = 0; index < queue.length; index++) {
        const [node, parity] = queue[index];
        if (seen.has(node)) { if (seen.get(node) !== parity) return null; continue; }
        seen.set(node, parity);
        for (const edge of edges) {
            if (edge.left === node) queue.push([edge.right, parity !== edge.opposite]);
            else if (edge.right === node) queue.push([edge.left, parity !== edge.opposite]);
        }
    }
    return seen.get(right) ?? null;
}

export function strictOrderStrategyBot(
    edges: readonly { before: string; after: string }[], left: string, right: string,
): "entailed" | "refuted" | null {
    const reaches = (start: string, end: string): boolean => {
        const queue = [start], visited = new Set<string>();
        for (let index = 0; index < queue.length; index++) {
            const node = queue[index];
            if (visited.has(node)) continue;
            visited.add(node);
            for (const edge of edges.filter(edge => edge.before === node)) {
                if (edge.after === end) return true;
                queue.push(edge.after);
            }
        }
        return false;
    };
    if (left === right || reaches(right, left)) return "refuted";
    return reaches(left, right) ? "entailed" : null;
}

/** Fixed 3x3 screen coordinates, origin top left; arithmetic fluency diagnostic. */
export function coordinateStrategyBot(initial: readonly [number, number], operations: readonly TransformOperator[]): [number, number] {
    let [x, y] = initial;
    if (![x, y].every(value => Number.isInteger(value) && value >= 0 && value < 3)) throw new Error("Bot requires a 3x3 point");
    for (const operation of operations) {
        switch (operation) {
            case "rotate90": [x, y] = [2 - y, x]; break;
            case "rotate180": [x, y] = [2 - x, 2 - y]; break;
            case "rotate270": [x, y] = [y, 2 - x]; break;
            case "reflectHorizontal": y = 2 - y; break;
            case "reflectVertical": x = 2 - x; break;
        }
    }
    return [x, y];
}

/** Abstention on equal signatures is essential: equality is not isomorphism. */
export function localInvariantStrategyBot(edges: readonly GraphEdgePremise[], sourceIds: readonly string[], targetIds: readonly string[]): "refuted" | null {
    const signature = (ids: readonly string[], graphId: "source" | "target") => ids.map(id => {
        const frameEdges = edges.filter(edge => edge.graphId === graphId);
        return `${frameEdges.filter(edge => edge.from === id).length}:${frameEdges.filter(edge => edge.to === id).length}`;
    }).sort().join("|");
    return sourceIds.length !== targetIds.length || signature(sourceIds, "source") !== signature(targetIds, "target") ? "refuted" : null;
}
