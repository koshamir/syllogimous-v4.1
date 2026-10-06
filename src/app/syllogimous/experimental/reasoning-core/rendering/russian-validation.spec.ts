import { generateCategoricalItem } from "../generators/categorical-generator";
import { ReasoningItem, ResponseFormat } from "../models/semantic.models";
import { DEFAULT_SEMANTICS_VERSION } from "../models/versions";
import { EXPERIMENTAL_UI_RU, FAMILY_LABEL_RU, RESPONSE_FORMAT_LABEL_RU } from "./ru-catalog";
import { renderPremiseRu, renderQueryRu } from "./russian-renderer";
import { assertRussianUserFacingText, findUnexpectedEnglishTokens } from "./russian-validation";

describe("experimental Russian localization guard", () => {
    it("rejects unintended English words but permits reviewed abbreviations", () => {
        expect(findUnexpectedEnglishTokens("Задание loading").map(value => value.token)).toEqual(["loading"]);
        expect(findUnexpectedEnglishTokens("Экспорт JSON для Syllogimous")).toEqual([]);
    });

    it("covers every static family and response-format label", () => {
        assertRussianUserFacingText([
            ...Object.values(EXPERIMENTAL_UI_RU),
            ...Object.values(FAMILY_LABEL_RU),
            ...Object.values(RESPONSE_FORMAT_LABEL_RU),
        ]);
        expect(Object.keys(RESPONSE_FORMAT_LABEL_RU).length).toBe(8);
    });

    it("renders fixed-seed categorical items without accidental English", () => {
        const formats: ResponseFormat[] = [
            "threeWayInference", "constructSatisfyingModel", "constructCounterexample",
            "identifyMissingRelation", "repairProof", "identifyNecessaryPremise", "updateAfterPremiseChange",
        ];
        const items: ReasoningItem[] = [];
        formats.forEach((format, index) => {
            const result = generateCategoricalItem({
                requestId: `ru-${index}`,
                seed: `ru-${format}-${index}`,
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
            });
            if (result.ok) items.push(result.item);
        });
        expect(items.length).toBe(formats.length);
        assertRussianUserFacingText(items.flatMap(item => [
            ...item.premises.map(premise => renderPremiseRu(premise, item.entities)),
            renderQueryRu(item.query, item.entities),
        ]));
    });
});
