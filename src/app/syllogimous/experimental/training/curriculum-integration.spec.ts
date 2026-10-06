import { generateReasoningItem } from "../reasoning-core/generators/generator-registry";
import { DEFAULT_SEMANTICS_VERSION } from "../reasoning-core/models/versions";
import { DEFAULT_CURRICULUM } from "./transparent-scheduler";

describe("experimental curriculum integration", () => {
    for (const candidate of DEFAULT_CURRICULUM) {
        it(`generates ${candidate.family}/${candidate.responseFormat} within a bounded seed search`, () => {
            let matched = false;
            for (let seedIndex = 0; seedIndex < 20 && !matched; seedIndex++) {
                const result = generateReasoningItem({
                    requestId: `curriculum-${candidate.family}-${candidate.responseFormat}-${seedIndex}`,
                    seed: `curriculum-fixture-${candidate.family}-${candidate.responseFormat}-${seedIndex}`,
                    family: candidate.family,
                    partition: "training",
                    semanticsVersion: DEFAULT_SEMANTICS_VERSION,
                    maxAttempts: 32,
                    wallTimeBudgetMs: 1_500,
                    target: {
                        level: candidate.level,
                        primaryDimension: candidate.primaryDimension,
                        displayedPremises: candidate.displayedPremises,
                        responseFormat: candidate.responseFormat,
                        memoryVisibility: "visible",
                        distractorCount: 0,
                        timePressure: "none",
                    },
                });
                matched = result.ok && result.item.responseSpec.kind === candidate.responseFormat;
            }
            expect(matched).withContext("Не найдено совместимое задание для строки учебного плана.").toBeTrue();
        });
    }
});
