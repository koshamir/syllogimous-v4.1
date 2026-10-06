import { AtomicQuery, DomainSpec, TransformationPremise } from "../models/semantic.models";
import {
    applyTransformationSequence,
    evaluateTransformationChain,
    transformationsCommute,
} from "../semantics/transformations";
import { classifyTransformation } from "./transformation-solver";

describe("fixed-axis transformation semantics", () => {
    const domain: Extract<DomainSpec, { kind: "boundedTransformations" }> = {
        kind: "boundedTransformations",
        closure: "listedStatesOnly",
        width: 3,
        height: 3,
        frame: "fixedAxes",
    };

    it("detects that rotation and reflection order can change the result", () => {
        const rotateThenReflect = applyTransformationSequence(
            [0, 0],
            ["rotate90", "reflectVertical"],
            domain,
        );
        const reflectThenRotate = applyTransformationSequence(
            [0, 0],
            ["reflectVertical", "rotate90"],
            domain,
        );

        expect(rotateThenReflect.ok).toBeTrue();
        expect(reflectThenRotate.ok).toBeTrue();
        if (!rotateThenReflect.ok || !reflectThenRotate.ok) return;
        expect(rotateThenReflect.value.point).toEqual([0, 0]);
        expect(reflectThenRotate.value.point).toEqual([2, 2]);
        expect(transformationsCommute("rotate90", "reflectVertical", domain)).toBeFalse();
        expect(transformationsCommute("rotate180", "rotate180", domain)).toBeTrue();
    });

    it("classifies an exact composed result without reversing operation order", () => {
        const query: Extract<AtomicQuery, { kind: "transformationResult" }> = {
            kind: "transformationResult",
            initialPoint: [0, 0],
            operators: ["rotate90", "reflectVertical"],
            expectedPoint: [0, 0],
        };
        const result = classifyTransformation(query, domain);

        expect(result.ok).toBeTrue();
        if (result.ok) {
            expect(result.classification).toBe("entailed");
            expect(result.queryWorld.finalPoint).toEqual([0, 0]);
        }
    });

    it("evaluates a connected premise chain and rejects a disconnected one", () => {
        const chain: TransformationPremise[] = [
            {
                kind: "transformation",
                id: "p1",
                operator: "rotate90",
                inputState: "s0",
                outputState: "s1",
                order: 1,
            },
            {
                kind: "transformation",
                id: "p2",
                operator: "reflectVertical",
                inputState: "s1",
                outputState: "s2",
                order: 2,
            },
        ];
        const result = evaluateTransformationChain(chain, "s0", [0, 0], domain);
        expect(result.ok).toBeTrue();
        if (result.ok) {
            expect(result.world.finalPoint).toEqual([0, 0]);
            expect(result.states.map(state => state.stateId)).toEqual(["s0", "s1", "s2"]);
        }

        const disconnected = evaluateTransformationChain(
            [{ ...chain[1], inputState: "other" }, chain[0]],
            "s0",
            [0, 0],
            domain,
        );
        expect(disconnected.ok).toBeFalse();
        if (!disconnected.ok) expect(disconnected.code).toBe("invalidChain");
    });
});
