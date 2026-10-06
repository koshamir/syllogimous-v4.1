import {
    AtomicQuery,
    DomainSpec,
    IntervalPremise,
    IntervalWorld,
} from "../models/semantic.models";
import { evaluateIntervalAtom } from "../semantics/interval";
import { classifyBoundedIntervals, enumerateIntervalWorlds } from "./bounded-interval-solver";

describe("bounded interval semantics", () => {
    it("uses explicit endpoint definitions for the supported interval relations", () => {
        const domain: Extract<DomainSpec, { kind: "boundedIntervals" }> = {
            kind: "boundedIntervals",
            closure: "closedFiniteDomain",
            endpointMin: 0,
            endpointMax: 7,
        };
        const ids = ["a", "b", "inside", "sameStart", "sameEnd", "same", "later", "touching"];
        const world: IntervalWorld = {
            kind: "intervalWorld",
            intervals: [
                { entityId: "a", start: 0, end: 4 },
                { entityId: "b", start: 3, end: 6 },
                { entityId: "inside", start: 1, end: 3 },
                { entityId: "sameStart", start: 0, end: 2 },
                { entityId: "sameEnd", start: 2, end: 4 },
                { entityId: "same", start: 0, end: 4 },
                { entityId: "later", start: 5, end: 7 },
                { entityId: "touching", start: 4, end: 6 },
            ],
        };
        const holds = (relation: Extract<AtomicQuery, { kind: "interval" }>["relation"], left: string, right: string) => {
            const result = evaluateIntervalAtom({ kind: "interval", relation, left, right }, world, ids, domain);
            return result.ok && result.holds;
        };

        expect(holds("overlaps", "a", "b")).toBeTrue();
        expect(holds("during", "inside", "a")).toBeTrue();
        expect(holds("starts", "sameStart", "a")).toBeTrue();
        expect(holds("finishes", "sameEnd", "a")).toBeTrue();
        expect(holds("equals", "same", "a")).toBeTrue();
        expect(holds("before", "a", "later")).toBeTrue();
        expect(holds("after", "later", "a")).toBeTrue();
        expect(holds("before", "a", "touching")).toBeFalse();
        expect(holds("overlaps", "b", "a")).toBeFalse();
    });

    it("returns two validated witnesses when bounded interval premises leave a query open", () => {
        const domain: Extract<DomainSpec, { kind: "boundedIntervals" }> = {
            kind: "boundedIntervals",
            closure: "closedFiniteDomain",
            endpointMin: 0,
            endpointMax: 5,
        };
        const premises: IntervalPremise[] = [
            { kind: "interval", id: "p1", relation: "before", left: "a", right: "b" },
        ];
        const query: Extract<AtomicQuery, { kind: "interval" }> = {
            kind: "interval",
            relation: "before",
            left: "c",
            right: "a",
        };
        const result = classifyBoundedIntervals(["a", "b", "c"], premises, query, domain);

        expect(result.ok).toBeTrue();
        if (!result.ok) return;
        expect(result.classification).toBe("underdetermined");
        expect(result.queryWitness).toBeDefined();
        expect(result.negatedQueryWitness).toBeDefined();
        const positive = evaluateIntervalAtom(query, result.queryWitness!, ["a", "b", "c"], domain);
        const negative = evaluateIntervalAtom(query, result.negatedQueryWitness!, ["a", "b", "c"], domain);
        expect(positive.ok && positive.holds).toBeTrue();
        expect(negative.ok && !negative.holds).toBeTrue();
    });

    it("rejects an interval search that exceeds its declared budget", () => {
        const result = enumerateIntervalWorlds(
            ["a", "b", "c"],
            [],
            {
                kind: "boundedIntervals",
                closure: "closedFiniteDomain",
                endpointMin: 0,
                endpointMax: 5,
            },
            { maxAssignments: 3_000 },
        );

        expect(result.ok).toBeFalse();
        if (!result.ok) {
            expect(result.code).toBe("searchBudgetExceeded");
            expect(result.requiredAssignments).toBe(3_375);
        }
    });
});
