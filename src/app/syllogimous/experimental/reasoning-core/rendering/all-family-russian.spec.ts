import { CORE_REASONING_FAMILIES, generateReasoningItem } from "../generators/generator-registry";
import { DEFAULT_SEMANTICS_VERSION } from "../models/versions";
import { RESPONSE_COMPATIBILITY } from "../../training/response-compatibility";
import { renderPremiseRu, renderQueryRu } from "./russian-renderer";
import { assertRussianUserFacingText } from "./russian-validation";

describe("all-family Russian generated surfaces", () => {
    it("covers every supported family/response pair at fixed seeds", () => {
        for (const family of CORE_REASONING_FAMILIES) {
            for (const format of RESPONSE_COMPATIBILITY[family]) {
                const result = generateReasoningItem({
                    requestId: `ru-all-${family}-${format}`,
                    seed: `russian-surface-v1-${family}-${format}`,
                    family,
                    partition: "training",
                    semanticsVersion: DEFAULT_SEMANTICS_VERSION,
                    maxAttempts: 32,
                    wallTimeBudgetMs: 5000,
                    target: {
                        level: 2,
                        primaryDimension: "supportSize",
                        displayedPremises: { min: 1, max: 12 },
                        responseFormat: format,
                        memoryVisibility: "visible",
                        distractorCount: 0,
                        timePressure: "none",
                    },
                });
                expect(result.ok).withContext(`${family}/${format}`).toBeTrue();
                if (!result.ok) continue;
                const item = result.item;
                assertRussianUserFacingText([
                    ...item.entities.map(entity => entity.label),
                    ...item.premises.map(premise => renderPremiseRu(premise, item.entities)),
                    renderQueryRu(item.query, item.entities),
                    item.provenance.adjustmentExplanationRu ?? "",
                ]);
                expect(item.presentation.locale).withContext(`${family}/${format}`).toBe("ru");
            }
        }
    });
});
