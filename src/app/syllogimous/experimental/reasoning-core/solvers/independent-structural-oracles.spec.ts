import { ContainmentPremise, DomainSpec, GraphEdgePremise, ScopedRelationPremise } from "../models/semantic.models";
import { evaluateScopedRelation } from "../semantics/scope";
import { classifyGraphIsomorphism } from "./graph-solver";
import { classifyHierarchyQuery } from "./hierarchy-solver";

describe("small independent structural reference oracles", () => {
    it("checks membership, inclusion and exclusion against a concrete Boolean matrix oracle", () => {
        const objects = ["o0", "o1"], classes = ["c0", "c1"];
        const constraints: ContainmentPremise[] = [
            { kind: "containment", id: "one", relation: "memberOf", subject: "o0", classId: "c0" },
            { kind: "containment", id: "two", relation: "includedIn", subject: "c0", classId: "c1" },
            { kind: "containment", id: "three", relation: "excludedFrom", subject: "o1", classId: "c1" },
        ];
        const holds = (p: Omit<ContainmentPremise, "id">, mask: number): boolean => {
            const cell = (o: number, c: number) => !!(mask & (1 << (o * 2 + c)));
            if (p.relation === "includedIn") return [0, 1].every(o => !cell(o, classes.indexOf(p.subject)) || cell(o, classes.indexOf(p.classId)));
            const value = cell(objects.indexOf(p.subject), classes.indexOf(p.classId));
            return p.relation === "memberOf" ? value : !value;
        };
        for (let subset = 0; subset < 8; subset++) {
            const premises = constraints.filter((_, index) => !!(subset & (1 << index)));
            const worlds = Array.from({ length: 16 }, (_, mask) => mask).filter(mask => premises.every(p => holds(p, mask)));
            for (const subject of objects) for (const classId of classes) {
                const query = { kind: "containment" as const, relation: "memberOf" as const, subject, classId };
                const outcomes = worlds.map(mask => holds(query, mask));
                const expected = outcomes.every(Boolean) ? "entailed" : outcomes.every(value => !value) ? "refuted" : "underdetermined";
                expect(classifyHierarchyQuery(premises, query, objects, classes).classification).toBe(expected);
            }
        }
    });
    it("checks every/some and both scope orders for all sixteen 2x2 relation matrices", () => {
        for (const subjectQuantifier of ["every", "some"] as const) for (const objectQuantifier of ["every", "some"] as const) {
            for (const subjectFirst of [true, false]) for (let mask = 0; mask < 16; mask++) {
                const premise: ScopedRelationPremise = {
                    kind: "scopedRelation", id: "scope", contextId: "ctx", subjectBindingId: "s", objectBindingId: "o",
                    quantifierOrder: subjectFirst ? ["s", "o"] : ["o", "s"], subjectQuantifier, objectQuantifier,
                    subjectClass: "people", objectClass: "objects", relation: "reads", nestingDepth: 2,
                };
                const cells = [[!!(mask & 1), !!(mask & 2)], [!!(mask & 4), !!(mask & 8)]];
                const fold = (values: boolean[], q: "every" | "some") => q === "every" ? values.every(Boolean) : values.some(Boolean);
                const expected = subjectFirst
                    ? fold(cells.map(row => fold(row, objectQuantifier)), subjectQuantifier)
                    : fold([0, 1].map(column => fold(cells.map(row => row[column]), subjectQuantifier)), objectQuantifier);
                const pairs: Array<[string, string]> = [];
                for (let row = 0; row < 2; row++) for (let column = 0; column < 2; column++) if (cells[row][column]) pairs.push([`p${row}`, `b${column}`]);
                expect(evaluateScopedRelation(premise, { kind: "scopeWorld", contextId: "ctx", people: ["p0", "p1"], objects: ["b0", "b1"], relationPairs: pairs })).toBe(expected);
            }
        }
    });
    it("checks all two-node loop-free directed graph pairs with independent adjacency comparisons", () => {
        const domain: Extract<DomainSpec, { kind: "boundedGraph" }> = { kind: "boundedGraph", closure: "closedFiniteDomain", directed: true, loopsAllowed: false, nodeIds: ["s0", "s1", "t0", "t1"], relationLabels: ["связь"] };
        for (let source = 0; source < 4; source++) for (let target = 0; target < 4; target++) {
            const edges: GraphEdgePremise[] = [];
            for (const [frame, bits, prefix] of [["source", source, "s"], ["target", target, "t"]] as const) {
                if (bits & 1) edges.push({ kind: "graphEdge", id: `${prefix}0`, graphId: frame, from: `${prefix}0`, to: `${prefix}1`, relationLabel: "связь" });
                if (bits & 2) edges.push({ kind: "graphEdge", id: `${prefix}1`, graphId: frame, from: `${prefix}1`, to: `${prefix}0`, relationLabel: "связь" });
            }
            const flipped = ((target & 1) << 1) | ((target & 2) >> 1);
            const expected = source === target || source === flipped ? "entailed" : "refuted";
            expect(classifyGraphIsomorphism(edges, domain, ["s0", "s1"], ["t0", "t1"], "bijection").classification).toBe(expected);
        }
    });
});
