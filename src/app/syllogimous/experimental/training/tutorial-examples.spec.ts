import { assertRussianUserFacingText } from "../reasoning-core/rendering/russian-validation";
import { verifiedCategoricalTutorialExamples } from "./tutorial-examples";

describe("solver-verified Russian tutorials", () => {
    it("20. keeps every stated answer consistent with the declared semantics", () => {
        const examples = verifiedCategoricalTutorialExamples();
        expect(examples.map(example => example.classification)).toEqual([
            "entailed",
            "underdetermined",
            "entailed",
            "underdetermined",
            "refuted",
        ]);
        expect(examples[1].certificate.queryWitness).toBeDefined();
        expect(examples[1].certificate.negatedQueryWitness).toBeDefined();
        assertRussianUserFacingText(examples.flatMap(example => [
            example.titleRu,
            example.semanticsRu,
            ...example.premiseTextsRu,
            example.queryTextRu,
            example.explanationRu,
        ]));
    });
});
