import { DomainSpec, GraphEdgePremise } from "../models/semantic.models";
import { validateGraphMapping } from "./graph";

describe("submitted mapping validates graph frames", () => {
    it("rejects an edge labelled source but using a target endpoint", () => {
        const domain: Extract<DomainSpec, { kind: "boundedGraph" }> = {
            kind: "boundedGraph", closure: "closedFiniteDomain", directed: true,
            loopsAllowed: false, nodeIds: ["s1", "s2", "t1", "t2"], relationLabels: ["связь"],
        };
        const edges: GraphEdgePremise[] = [{ kind: "graphEdge", id: "bad", graphId: "source", from: "s1", to: "t2", relationLabel: "связь" }];
        const result = validateGraphMapping(edges, domain, ["s1", "s2"], ["t1", "t2"], [{ source: "s1", target: "t1" }, { source: "s2", target: "t2" }], "bijection");
        expect(result.valid).toBeFalse();
        expect(result.violations[0].code).toBe("invalidGraph");
    });
});
