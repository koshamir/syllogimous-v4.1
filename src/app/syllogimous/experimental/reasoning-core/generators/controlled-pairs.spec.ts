import { verifyReasoningItem } from "../certificates/item-verifier";
import { generateControlledBranchingPair } from "./controlled-pairs";

describe("controlled complexity pairs", () => {
    it("holds nuisance dimensions constant while changing branching and reconvergence", () => {
        const pair = generateControlledBranchingPair("controlled-fixture");
        expect(verifyReasoningItem(pair.control).valid).toBeTrue();
        expect(verifyReasoningItem(pair.elevated).valid).toBeTrue();
        expect(pair.control.premises.length).toBe(pair.elevated.premises.length);
        expect(pair.control.entities).toEqual(pair.elevated.entities);
        expect(pair.control.responseSpec.kind).toBe(pair.elevated.responseSpec.kind);
        expect(pair.control.targetComplexity.memoryVisibility).toBe(pair.elevated.targetComplexity.memoryVisibility);
        expect(pair.control.targetComplexity.distractorCount).toBe(pair.elevated.targetComplexity.distractorCount);
        expect(pair.control.targetComplexity.timePressure).toBe(pair.elevated.targetComplexity.timePressure);
        expect(pair.elevated.measuredComplexity.branchingCount)
            .toBeGreaterThan(pair.control.measuredComplexity.branchingCount);
        expect(pair.elevated.measuredComplexity.reconvergentJoinCount)
            .toBeGreaterThan(pair.control.measuredComplexity.reconvergentJoinCount);
        expect(pair.elevated.measuredComplexity.distinctMinimalSupports).toBe(2);
    });
});
