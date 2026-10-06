import { generateScopeItem } from "../generators/scope-generator";
import { ReasoningItem } from "../models/semantic.models";
import { DEFAULT_SEMANTICS_VERSION } from "../models/versions";
import { validateCategoricalWorld } from "./categorical";
import { verifySubmittedWorld } from "./world-verifier";

describe("submitted-world validation", () => {
    it("rejects undeclared classes and duplicate witness identities", () => {
        const domainClasses = ["a", "b"];
        expect(validateCategoricalWorld(
            { kind: "categoricalWorld", witnesses: [{ id: "w1", classes: ["a", "outside"] }] },
            [],
            domainClasses,
            "emptyClassesAllowed",
        )).toBeFalse();
        expect(validateCategoricalWorld(
            {
                kind: "categoricalWorld",
                witnesses: [
                    { id: "w1", classes: ["a"] },
                    { id: "w1", classes: ["b"] },
                ],
            },
            [],
            domainClasses,
            "emptyClassesAllowed",
        )).toBeFalse();
    });

    it("does not allow an empty submitted scope domain to make every vacuously true", () => {
        let item: ReasoningItem | undefined;
        for (let index = 0; index < 40 && !item; index++) {
            const generated = generateScopeItem({
                requestId: `scope-world-${index}`,
                seed: `scope-world-${index}`,
                family: "contextScope",
                partition: "training",
                semanticsVersion: DEFAULT_SEMANTICS_VERSION,
                maxAttempts: 8,
                wallTimeBudgetMs: 1_000,
                target: {
                    level: 2,
                    primaryDimension: "scopeDepth",
                    displayedPremises: { min: 1, max: 3 },
                    responseFormat: "constructSatisfyingModel",
                    memoryVisibility: "visible",
                    distractorCount: 0,
                    timePressure: "none",
                },
            });
            if (generated.ok) item = generated.item;
        }
        expect(item).toBeDefined();
        if (!item) return;
        const result = verifySubmittedWorld(item, {
            kind: "scopeWorld",
            contextId: "reading-room",
            people: [],
            objects: [],
            relationPairs: [],
        });
        expect(result.valid).toBeFalse();
    });
});
