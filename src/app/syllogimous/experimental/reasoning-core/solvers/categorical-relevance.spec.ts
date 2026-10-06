import { CategoricalPremise, DomainSpec } from "../models/semantic.models";
import { classifyCategorical } from "./categorical-solver";

describe("categorical semantic world restriction", () => {
    const domain: Extract<DomainSpec, { kind: "categoricalUnary" }> = {
        kind: "categoricalUnary", closure: "unrestrictedUnaryPredicates",
        namedClasses: ["A", "B", "C"], existentialImport: "emptyClassesAllowed",
    };
    const some = (id: string): CategoricalPremise => ({ kind: "categorical", id, quantifier: "some", subject: "A", predicate: "B" });
    const query = { kind: "categorical" as const, quantifier: "some" as const, subject: "A", predicate: "C" };
    it("does not call deletion of duplicate existentials nonredundant", () => {
        const result = classifyCategorical([some("one"), some("duplicate")], query, domain);
        expect(result.classification).toBe("underdetermined");
        expect(result.certificate.contrastiveRelevantPremiseIds).toEqual([]);
        expect(result.certificate.necessaryPremiseIds).toEqual([]);
    });
    it("certifies an existential restriction only when its negation has a deletion witness", () => {
        const result = classifyCategorical([some("one")], query, domain);
        expect(result.certificate.contrastiveRelevantPremiseIds).toEqual(["one"]);
    });
});
