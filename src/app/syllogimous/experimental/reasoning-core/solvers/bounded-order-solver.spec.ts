import {
    AtomicQuery,
    DomainSpec,
    OrderPremise,
    PositionWorld,
} from "../models/semantic.models";
import {
    evaluateOrderAtom,
    transformCyclicPositionWorld,
} from "../semantics/order";
import {
    classifyBoundedOrder,
    enumeratePositionWorlds,
} from "./bounded-order-solver";

describe("bounded order semantics", () => {
    const linearDomain: Extract<DomainSpec, { kind: "boundedPositions" }> = {
        kind: "boundedPositions",
        closure: "closedFiniteDomain",
        size: 3,
        cyclic: false,
        allowCoincidence: false,
    };

    it("keeps an unforced comparison unknown across two partial-order extensions", () => {
        const premises: OrderPremise[] = [
            { kind: "order", id: "p1", relation: "strictLess", args: ["a", "b"] },
            { kind: "order", id: "p2", relation: "strictLess", args: ["a", "c"] },
        ];
        const query: Extract<AtomicQuery, { kind: "order" }> = {
            kind: "order",
            relation: "strictLess",
            args: ["b", "c"],
        };
        const result = classifyBoundedOrder(["a", "b", "c"], premises, query, linearDomain);

        expect(result.ok).toBeTrue();
        if (!result.ok) return;
        expect(result.classification).toBe("underdetermined");
        expect(result.modelCount).toBe(2);
        expect(result.queryWitness).toBeDefined();
        expect(result.negatedQueryWitness).toBeDefined();
        const positive = evaluateOrderAtom(query, result.queryWitness!, ["a", "b", "c"], linearDomain);
        const negative = evaluateOrderAtom(query, result.negatedQueryWitness!, ["a", "b", "c"], linearDomain);
        expect(positive.ok && positive.holds).toBeTrue();
        expect(negative.ok && !negative.holds).toBeTrue();
    });

    it("uses the explicit [middle, left boundary, right boundary] Between roles", () => {
        const world: PositionWorld = {
            kind: "positionWorld",
            positions: [
                { entityId: "left", value: 0 },
                { entityId: "middle", value: 1 },
                { entityId: "right", value: 2 },
            ],
        };
        const correct = evaluateOrderAtom(
            { kind: "order", relation: "between", args: ["middle", "left", "right"] },
            world,
            ["left", "middle", "right"],
            linearDomain,
        );
        const reversedRoles = evaluateOrderAtom(
            { kind: "order", relation: "between", args: ["left", "middle", "right"] },
            world,
            ["left", "middle", "right"],
            linearDomain,
        );

        expect(correct.ok && correct.holds).toBeTrue();
        expect(reversedRoles.ok && !reversedRoles.holds).toBeTrue();
    });

    it("preserves clockwise relations under rotation and gates reflections", () => {
        const cyclicDomain: Extract<DomainSpec, { kind: "boundedPositions" }> = {
            kind: "boundedPositions",
            closure: "closedFiniteDomain",
            size: 5,
            cyclic: true,
            allowCoincidence: false,
        };
        const world: PositionWorld = {
            kind: "positionWorld",
            positions: [{ entityId: "a", value: 0 }, { entityId: "b", value: 1 }],
        };
        const clockwise: Extract<AtomicQuery, { kind: "order" }> = {
            kind: "order",
            relation: "cyclicClockwise",
            args: ["a", "b"],
        };
        const rotated = transformCyclicPositionWorld(world, ["a", "b"], cyclicDomain, {
            rotation: 3,
            reflect: false,
            reflectionAllowed: false,
        });
        expect(rotated.ok).toBeTrue();
        if (rotated.ok) {
            const rotatedEvaluation = evaluateOrderAtom(clockwise, rotated.world, ["a", "b"], cyclicDomain);
            expect(rotatedEvaluation.ok && rotatedEvaluation.holds).toBeTrue();
        }

        const forbiddenReflection = transformCyclicPositionWorld(world, ["a", "b"], cyclicDomain, {
            rotation: 0,
            reflect: true,
            reflectionAllowed: false,
        });
        expect(forbiddenReflection.ok).toBeFalse();
        if (!forbiddenReflection.ok) expect(forbiddenReflection.code).toBe("reflectionNotAllowed");

        const permittedReflection = transformCyclicPositionWorld(world, ["a", "b"], cyclicDomain, {
            rotation: 0,
            reflect: true,
            reflectionAllowed: true,
        });
        expect(permittedReflection.ok).toBeTrue();
        if (permittedReflection.ok) {
            const reflectedEvaluation = evaluateOrderAtom(clockwise, permittedReflection.world, ["a", "b"], cyclicDomain);
            expect(reflectedEvaluation.ok && !reflectedEvaluation.holds).toBeTrue();
        }
    });

    it("rejects an oversized exact enumeration before returning partial worlds", () => {
        const result = enumeratePositionWorlds(
            ["a", "b", "c"],
            [],
            { ...linearDomain, size: 10, allowCoincidence: true },
            { maxAssignments: 999 },
        );

        expect(result.ok).toBeFalse();
        if (!result.ok) {
            expect(result.code).toBe("searchBudgetExceeded");
            expect(result.requiredAssignments).toBe(1_000);
        }
    });
});
