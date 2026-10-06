import { degreeMatchedNegativeEdges } from "../generators/graph-generator";
import { coordinateStrategyBot, localInvariantStrategyBot, parityStrategyBot, strictOrderStrategyBot } from "./strategy-bots";

describe("legitimate strategy diagnostics", () => {
    it("parity is valid for binary opposition, not generic difference", () => {
        expect(parityStrategyBot([{ left: "A", right: "B", opposite: true }, { left: "B", right: "C", opposite: true }], "A", "C")).toBeFalse();
    });
    it("order closure abstains on an unforced comparison", () => {
        expect(strictOrderStrategyBot([{ before: "A", after: "B" }, { before: "A", after: "C" }], "B", "C")).toBeNull();
    });
    it("coordinate fluency distinguishes reversed noncommuting operators", () => {
        expect(coordinateStrategyBot([0, 0], ["rotate90", "reflectVertical"])).not.toEqual(coordinateStrategyBot([0, 0], ["reflectVertical", "rotate90"]));
    });
    it("equal degrees do not license an isomorphism answer", () => {
        expect(localInvariantStrategyBot(degreeMatchedNegativeEdges(), ["s0", "s1", "s2", "s3"], ["t0", "t1", "t2", "t3"])).toBeNull();
    });
});
