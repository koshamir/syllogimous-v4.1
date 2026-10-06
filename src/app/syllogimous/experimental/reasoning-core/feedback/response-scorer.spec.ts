import { generateCategoricalItem } from "../generators/categorical-generator";
import { ComplexityTarget, GenerationRequest, ReasoningItem } from "../models/semantic.models";
import { DEFAULT_SEMANTICS_VERSION } from "../models/versions";
import { scoreReasoningResponse } from "./response-scorer";

function request(format: ComplexityTarget["responseFormat"], seed: string): GenerationRequest {
    return {
        requestId: seed,
        seed,
        family: "categorical",
        partition: "training",
        semanticsVersion: DEFAULT_SEMANTICS_VERSION,
        maxAttempts: 30,
        wallTimeBudgetMs: 1000,
        target: {
            level: 2,
            primaryDimension: "supportSize",
            displayedPremises: { min: 2, max: 6 },
            responseFormat: format,
            memoryVisibility: "visible",
            distractorCount: 0,
            timePressure: "none",
        },
    };
}

function generated(format: ComplexityTarget["responseFormat"], seed: string): ReasoningItem {
    const result = generateCategoricalItem(request(format, seed));
    if (!result.ok) throw new Error(result.messageRu);
    return result.item;
}

describe("deterministic response scoring", () => {
    it("12. accepts a valid alternative constructed model", () => {
        const item = generated("constructSatisfyingModel", "alternative-world");
        const witness = item.semanticCertificate.queryWitness;
        expect(witness?.kind).toBe("categoricalWorld");
        if (!witness || witness.kind !== "categoricalWorld") return;
        const alternative = {
            ...witness,
            witnesses: [...witness.witnesses, { id: "extra-object", classes: [] }],
        };
        expect(alternative).not.toEqual(witness);
        const score = scoreReasoningResponse(item, { kind: "constructSatisfyingModel", world: alternative });
        expect(score.correct).toBeTrue();
        expect(score.evidenceRole).toBe("satisfyingWitness");
    });

    it("18. labels a counterexample as nonentailment evidence, not refutation proof", () => {
        const item = generated("constructCounterexample", "counterexample-role");
        const witness = item.semanticCertificate.negatedQueryWitness;
        expect(witness).toBeDefined();
        if (!witness) return;
        const score = scoreReasoningResponse(item, { kind: "constructCounterexample", world: witness });
        expect(score.correct).toBeTrue();
        expect(score.evidenceRole).toBe("counterexampleToEntailment");
        expect(score.evidenceRole).not.toBe("proofOfRefutation");
        expect(score.detailRu.join(" ")).toContain("не доказывает");
    });

    it("keeps three answer locations stable", () => {
        const item = generated("threeWayInference", "stable-controls");
        expect(item.presentation.stableAnswerOrder).toEqual(["entailed", "refuted", "underdetermined"]);
        expect(item.responseSpec.kind).toBe("threeWayInference");
    });
});
