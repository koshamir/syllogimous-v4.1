import { compareRational, multiplyRational, rational } from "./rational";

describe("exact rational boundary contracts", () => {
    it("normalises negative denominators before comparing", () => {
        expect(compareRational({ numerator: 1, denominator: -2 }, rational(0))).toBe(-1);
    });
    it("keeps large safe integer cross products exact", () => {
        const n = Number.MAX_SAFE_INTEGER;
        expect(compareRational({ numerator: n, denominator: n - 1 }, { numerator: n - 1, denominator: n - 2 })).toBe(-1);
    });
    it("cancels large factors before multiplying and rejects unrepresentable results", () => {
        const n = Number.MAX_SAFE_INTEGER;
        expect(multiplyRational(rational(n, 2), rational(2, n))).toEqual(rational(1));
        expect(() => multiplyRational(rational(n), rational(2))).toThrow();
        expect(() => compareRational({ numerator: 1, denominator: 0 }, rational(1))).toThrow();
    });
});
