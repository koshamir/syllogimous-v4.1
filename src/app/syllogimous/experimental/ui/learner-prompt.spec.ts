import { CORE_REASONING_FAMILIES, generateReasoningItem } from "../reasoning-core/generators/generator-registry";
import { DEFAULT_SEMANTICS_VERSION } from "../reasoning-core/models/versions";
import { assertRussianUserFacingText } from "../reasoning-core/rendering/russian-validation";
import { learnerInstructionsRu, renderLearnerQueryRu } from "./learner-prompt";
import { renderPremiseRu } from "../reasoning-core/rendering/russian-renderer";
import { DEFAULT_CURRICULUM } from "../training/transparent-scheduler";

describe("public learner instructions", () => {
    for (const family of CORE_REASONING_FAMILIES) {
        it(`declares the ${family} world in Russian without answer-bearing fields`, () => {
            const primaryDimension = DEFAULT_CURRICULUM.find(candidate => candidate.family === family)!.primaryDimension;
            const result = generateReasoningItem({ requestId: `instructions-${family}`, seed: `instructions-${family}`, family, partition: "training", semanticsVersion: DEFAULT_SEMANTICS_VERSION, maxAttempts: 32, wallTimeBudgetMs: 1_500, target: { level: 3, primaryDimension, displayedPremises: { min: 1, max: 8 }, responseFormat: "threeWayInference", memoryVisibility: "visible", distractorCount: 0, timePressure: "none" } });
            expect(result.ok).toBeTrue();
            if (!result.ok) return;
            const lines = learnerInstructionsRu(result.item);
            expect(lines.length).toBeGreaterThan(0);
            assertRussianUserFacingText([...lines, renderLearnerQueryRu(result.item), ...result.item.premises.map(premise => renderPremiseRu(premise, result.item.entities))]);
        });
    }
});
