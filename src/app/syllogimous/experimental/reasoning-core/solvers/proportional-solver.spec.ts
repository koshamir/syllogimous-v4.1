import { AtomicQuery, DomainSpec, RationalPremise } from "../models/semantic.models";
import { evaluateRationalAtom } from "../semantics/proportional";
import { rational } from "../semantics/rational";
import { classifyProportional } from "./proportional-solver";

describe("exact proportional semantics", () => {
    const domain: Extract<DomainSpec, { kind: "exactRationals" }> = {
        kind: "exactRationals",
        closure: "listedValuesOnly",
        units: "доля",
    };

    it("evaluates scaling by exact rational cross-products", () => {
        const query: Extract<AtomicQuery, { kind: "rational" }> = {
            kind: "rational",
            relation: "scaledBy",
            left: rational(2, 3),
            right: rational(9, 4),
            result: rational(3, 2),
            units: "доля",
        };

        const result = classifyProportional([], query, domain);
        expect(result.ok).toBeTrue();
        if (result.ok) expect(result.classification).toBe("entailed");
    });

    it("retains exact ordering when cross-products exceed safe-number precision", () => {
        const result = evaluateRationalAtom({
            kind: "rational",
            relation: "ratioGreater",
            left: { numerator: Number.MAX_SAFE_INTEGER, denominator: Number.MAX_SAFE_INTEGER - 1 },
            right: rational(1),
            units: "доля",
        }, domain);

        expect(result.ok && result.holds).toBeTrue();
    });

    it("rejects a zero denominator instead of producing an oracle label", () => {
        expect(() => rational(1, 0)).toThrowError();
        const result = evaluateRationalAtom({
            kind: "rational",
            relation: "ratioEqual",
            left: { numerator: 1, denominator: 0 },
            right: rational(1),
            units: "доля",
        }, domain);

        expect(result.ok).toBeFalse();
        if (!result.ok) expect(result.code).toBe("zeroDenominator");
    });

    it("rejects false ground premises as inconsistent and refutes a false ground query", () => {
        const falsePremise: RationalPremise = {
            kind: "rational",
            id: "p1",
            relation: "ratioLess",
            left: rational(2),
            right: rational(1),
            units: "доля",
        };
        const trueQuery: Extract<AtomicQuery, { kind: "rational" }> = {
            kind: "rational",
            relation: "ratioEqual",
            left: rational(1, 2),
            right: rational(2, 4),
            units: "доля",
        };
        const falseQuery: Extract<AtomicQuery, { kind: "rational" }> = {
            ...trueQuery,
            right: rational(3, 4),
        };

        const inconsistent = classifyProportional([falsePremise], trueQuery, domain);
        expect(inconsistent.ok).toBeFalse();
        if (!inconsistent.ok) expect(inconsistent.code).toBe("inconsistentPremises");
        const refuted = classifyProportional([], falseQuery, domain);
        expect(refuted.ok).toBeTrue();
        if (refuted.ok) expect(refuted.classification).toBe("refuted");
    });
});
