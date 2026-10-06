import { collectCopyStrings, EXPERIMENTAL_COPY_RU, unintendedLatinTokens } from "./experimental-copy";
import { EXPERIMENTAL_UI_RU, FAMILY_LABEL_RU, RESPONSE_FORMAT_LABEL_RU } from "../reasoning-core/rendering/ru-catalog";

describe("experimental Russian UI copy", () => {
    it("contains no unintended English user-facing tokens", () => {
        const visibleStrings = collectCopyStrings({
            local: EXPERIMENTAL_COPY_RU,
            core: EXPERIMENTAL_UI_RU,
            families: FAMILY_LABEL_RU,
            responseFormats: RESPONSE_FORMAT_LABEL_RU,
        });
        expect(visibleStrings.flatMap(unintendedLatinTokens)).toEqual([]);
    });
});
