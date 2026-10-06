import { DEFAULT_CURRICULUM } from "./transparent-scheduler";
import { RESPONSE_COMPATIBILITY, responseFormatSupported } from "./response-compatibility";

describe("response compatibility", () => {
    it("covers ten families and every response format through a valid pairing", () => {
        expect(Object.keys(RESPONSE_COMPATIBILITY).length).toBe(10);
        const formats = new Set(Object.values(RESPONSE_COMPATIBILITY).flat());
        expect(formats.size).toBe(8);
    });

    it("contains no unsupported scheduler request", () => {
        expect(DEFAULT_CURRICULUM.every(candidate => responseFormatSupported(candidate.family, candidate.responseFormat))).toBeTrue();
    });

    it("rejects known invalid pairings", () => {
        expect(responseFormatSupported("proportional", "completeMapping")).toBeFalse();
        expect(responseFormatSupported("transformations", "constructCounterexample")).toBeFalse();
    });
});
