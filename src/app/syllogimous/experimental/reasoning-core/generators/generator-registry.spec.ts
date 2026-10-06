import { verifyReasoningItem } from "../certificates/item-verifier";
import { ComplexityTarget, GenerationRequest, ReasoningFamily } from "../models/semantic.models";
import { DEFAULT_SEMANTICS_VERSION } from "../models/versions";
import { CORE_REASONING_FAMILIES, generateReasoningItem } from "./generator-registry";

function target(): ComplexityTarget {
    return {
        level: 3,
        primaryDimension: "branching",
        displayedPremises: { min: 1, max: 7 },
        responseFormat: "threeWayInference",
        memoryVisibility: "visible",
        distractorCount: 0,
        timePressure: "none",
    };
}

function request(family: ReasoningFamily, seed: string): GenerationRequest {
    return {
        requestId: `test-${family}-${seed}`,
        seed,
        family,
        partition: "training",
        target: target(),
        semanticsVersion: DEFAULT_SEMANTICS_VERSION,
        maxAttempts: 16,
        wallTimeBudgetMs: 5_000,
    };
}

describe("core generator registry", () => {
    it("dispatches every core family and independently rechecks available semantics", () => {
        for (const family of CORE_REASONING_FAMILIES) {
            const result = generateReasoningItem(request(family, "registry-smoke"));
            expect(result.ok).withContext(family).toBeTrue();
            if (!result.ok) continue;
            const verification = verifyReasoningItem(result.item);
            expect(verification.valid)
                .withContext(`${family}: ${verification.issues.map(issue => issue.code).join(", ")}`)
                .toBeTrue();
        }
    });

    it("reproduces semantic and presentation content from the same seed", () => {
        for (const family of CORE_REASONING_FAMILIES) {
            const first = generateReasoningItem(request(family, "reproduction"));
            const second = generateReasoningItem(request(family, "reproduction"));
            expect(first.ok).withContext(family).toBeTrue();
            expect(second.ok).withContext(family).toBeTrue();
            if (!first.ok || !second.ok) continue;
            expect(first.item.structuralFingerprint).withContext(family).toBe(second.item.structuralFingerprint);
            expect(first.item.entities).withContext(family).toEqual(second.item.entities);
            expect(first.item.premises).withContext(family).toEqual(second.item.premises);
            expect(first.item.query).withContext(family).toEqual(second.item.query);
            expect(first.item.presentation).withContext(family).toEqual(second.item.presentation);
            expect(first.item.semanticCertificate).withContext(family).toEqual(second.item.semanticCertificate);
        }
    });

    it("returns typed recoverable failures for invalid engineering budgets", () => {
        const invalid = request("categorical", "invalid-budget");
        invalid.maxAttempts = 0;
        const result = generateReasoningItem(invalid);
        expect(result.ok).toBeFalse();
        if (!result.ok) {
            expect(result.code).toBe("unsupportedTarget");
            expect(result.recoverable).toBeTrue();
        }
    });
    it("does not substitute a lower intrinsic target or accept inherited semantics keys", () => {
        const high = request("transformations", "bounded-dimension");
        high.target.metricBounds = { transformComposition: { min: 100, max: 100 } };
        const result = generateReasoningItem(high);
        expect(result.ok).toBeFalse();
        if (!result.ok) expect(result.code).toBe("targetMismatch");
        const inherited = request("hierarchy", "bad-semantics");
        inherited.semanticsVersion = "toString";
        expect(generateReasoningItem(inherited).ok).toBeFalse();
    });
});
