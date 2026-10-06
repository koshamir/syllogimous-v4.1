import { structuralFingerprint } from "../certificates/canonical";
import { generateCategoricalItem } from "../generators/categorical-generator";
import { CategoricalPremise, ComplexityTarget, DomainSpec, EntitySpec } from "../models/semantic.models";
import { DEFAULT_SEMANTICS_VERSION, EMPTY_CLASS_SEMANTICS_VERSION } from "../models/versions";
import { enumerateGenericInequalityModels, solveBinaryOpposition } from "../semantics/binary-opposition";
import { negateCategoricalQuantifier, solveCategoricalSat, validateCategoricalWorld } from "../semantics/categorical";
import { classifyCategorical } from "./categorical-solver";
import { classifyPropositionQuery } from "./proposition-solver";
import { referenceClassifyCategorical } from "./reference-categorical-oracle";

const entities: EntitySpec[] = ["A", "B", "C"].map(id => ({ id, label: id, sort: "class" }));
const nonemptyDomain: Extract<DomainSpec, { kind: "categoricalUnary" }> = {
    kind: "categoricalUnary",
    closure: "unrestrictedUnaryPredicates",
    existentialImport: "allNamedClassesNonempty",
    namedClasses: ["A", "B", "C"],
};
const emptyAllowedDomain: Extract<DomainSpec, { kind: "categoricalUnary" }> = {
    ...nonemptyDomain,
    existentialImport: "emptyClassesAllowed",
};
const p = (id: string, quantifier: CategoricalPremise["quantifier"], subject: string, predicate: string): CategoricalPremise => ({
    kind: "categorical", id, quantifier, subject, predicate,
});

describe("required semantic fixtures", () => {
    it("1. entails All(A,C) through All(A,B), All(B,C)", () => {
        const premises = [p("p1", "all", "A", "B"), p("p2", "all", "B", "C")];
        const query = { kind: "categorical" as const, quantifier: "all" as const, subject: "A", predicate: "C" };
        const result = classifyCategorical(premises, query, nonemptyDomain);
        expect(result.classification).toBe("entailed");
        expect(result.certificate.supports.map(support => support.premiseIds)).toContain(["p1", "p2"]);
    });

    it("2. entails No(A,C) through inclusion and exclusion", () => {
        const premises = [p("p1", "all", "A", "B"), p("p2", "no", "B", "C")];
        const query = { kind: "categorical" as const, quantifier: "no" as const, subject: "A", predicate: "C" };
        expect(classifyCategorical(premises, query, nonemptyDomain).classification).toBe("entailed");
    });

    it("3. leaves Some(A,C) unknown and validates opposing models", () => {
        const premises = [p("p1", "all", "A", "B"), p("p2", "some", "B", "C")];
        const query = { kind: "categorical" as const, quantifier: "some" as const, subject: "A", predicate: "C" };
        const result = classifyCategorical(premises, query, nonemptyDomain);
        expect(result.classification).toBe("underdetermined");
        expect(validateCategoricalWorld(result.certificate.queryWitness as never, premises, nonemptyDomain.namedClasses, nonemptyDomain.existentialImport)).toBeTrue();
        expect(validateCategoricalWorld(result.certificate.negatedQueryWitness as never, premises, nonemptyDomain.namedClasses, nonemptyDomain.existentialImport)).toBeTrue();
    });

    it("4. makes All(A,B) and No(A,B) policy-dependent", () => {
        const premises = [p("p1", "all", "A", "B"), p("p2", "no", "A", "B")];
        expect(solveCategoricalSat(premises, nonemptyDomain).satisfiable).toBeFalse();
        const empty = solveCategoricalSat(premises, emptyAllowedDomain);
        expect(empty.satisfiable).toBeTrue();
        expect(empty.world?.witnesses.some(witness => witness.classes.includes("A"))).toBeFalse();
    });

    it("5. changes All(A,B) => Some(A,B) with existential policy", () => {
        const premises = [p("p1", "all", "A", "B")];
        const query = { kind: "categorical" as const, quantifier: "some" as const, subject: "A", predicate: "B" };
        expect(classifyCategorical(premises, query, nonemptyDomain).classification).toBe("entailed");
        expect(classifyCategorical(premises, query, emptyAllowedDomain).classification).toBe("underdetermined");
        expect(nonemptyDomain.namedClasses).toContain("B");
        expect(nonemptyDomain.closure).toBe("unrestrictedUnaryPredicates");
    });

    it("6. distinguishes logical negation forms", () => {
        expect(negateCategoricalQuantifier("all")).toBe("someNot");
        expect(negateCategoricalQuantifier("no")).toBe("some");
        expect(negateCategoricalQuantifier("some")).toBe("no");
        expect(negateCategoricalQuantifier("someNot")).toBe("all");
    });

    it("7. keeps generic inequality separate from two-class opposition", () => {
        const inequality = enumerateGenericInequalityModels(["A", "B", "C"], [
            { left: "A", right: "B" }, { left: "B", right: "C" },
        ], 3);
        expect(inequality.some(model => model["A"] === model["C"])).toBeTrue();
        expect(inequality.some(model => model["A"] !== model["C"])).toBeTrue();
        const opposition = solveBinaryOpposition(["A", "B", "C"], [
            { left: "A", right: "B", relation: "opposite" },
            { left: "B", right: "C", relation: "opposite" },
        ]);
        expect(opposition.every(model => model["A"] === model["C"])).toBeTrue();
    });

    it("8. evaluates dependent Boolean queries in the same world", () => {
        const premises = [{ kind: "booleanConstraint" as const, id: "xor", operator: "exactlyOne" as const, propositionIds: ["P", "Q"] as [string, string] }];
        const prop = (propositionId: string) => ({ kind: "proposition" as const, propositionId });
        expect(classifyPropositionQuery(premises, prop("P")).classification).toBe("underdetermined");
        expect(classifyPropositionQuery(premises, prop("Q")).classification).toBe("underdetermined");
        expect(classifyPropositionQuery(premises, { kind: "boolean", operator: "or", operands: [prop("P"), prop("Q")] }).classification).toBe("entailed");
        expect(classifyPropositionQuery(premises, { kind: "boolean", operator: "and", operands: [prop("P"), prop("Q")] }).classification).toBe("refuted");
    });

    it("15. deletion tests determinate necessity without mislabelling unknown items", () => {
        const premises = [p("p1", "all", "A", "B"), p("p2", "all", "B", "C")];
        const query = { kind: "categorical" as const, quantifier: "all" as const, subject: "A", predicate: "C" };
        const entailed = classifyCategorical(premises, query, nonemptyDomain).certificate;
        expect(entailed.necessaryPremiseIds.sort()).toEqual(["p1", "p2"]);
        const unknown = classifyCategorical([p("u1", "all", "A", "B")], query, nonemptyDomain).certificate;
        expect(unknown.classification).toBe("underdetermined");
        expect(unknown.necessaryPremiseIds).toEqual([]);
        expect(unknown.contrastiveRelevantPremiseIds).toContain("u1");
    });

    it("cross-checks every small quantifier pair with the independent oracle", () => {
        const quantifiers: CategoricalPremise["quantifier"][] = ["all", "no", "some", "someNot"];
        for (const first of quantifiers) for (const second of quantifiers) for (const queryQuantifier of quantifiers) {
            const premises = [p("p1", first, "A", "B"), p("p2", second, "B", "C")];
            const query = { kind: "categorical" as const, quantifier: queryQuantifier, subject: "A", predicate: "C" };
            const production = classifyCategorical(premises, query, emptyAllowedDomain);
            const reference = referenceClassifyCategorical(premises, query, emptyAllowedDomain);
            expect(production.certificate.premisesSatisfiable ? production.classification : "inconsistent").withContext(`${first},${second} => ${queryQuantifier}`).toBe(reference);
        }
    });

    it("keeps fingerprints invariant under renaming and premise permutation", () => {
        const premises = [p("p1", "all", "A", "B"), p("p2", "no", "B", "C")];
        const query = { kind: "categorical" as const, quantifier: "no" as const, subject: "A", predicate: "C" };
        const first = structuralFingerprint(entities, premises, query, nonemptyDomain);
        const renamedEntities: EntitySpec[] = ["X", "Y", "Z"].map(id => ({ id, label: `метка-${id}`, sort: "class" }));
        const renamedPremises = [p("other2", "no", "Y", "Z"), p("other1", "all", "X", "Y")];
        const renamedDomain = { ...nonemptyDomain, namedClasses: ["Z", "X", "Y"] };
        const second = structuralFingerprint(renamedEntities, renamedPremises, { ...query, subject: "X", predicate: "Z" }, renamedDomain);
        expect(second).toBe(first);
    });

    it("rejects inconsistent ordinary generation before rendering", () => {
        const target: ComplexityTarget = {
            level: 1,
            primaryDimension: "supportSize",
            displayedPremises: { min: 2, max: 6 },
            responseFormat: "threeWayInference",
            memoryVisibility: "visible",
            distractorCount: 0,
            timePressure: "none",
        };
        const generated = generateCategoricalItem({
            requestId: "fixture",
            seed: "fixture-inconsistent-guard",
            family: "categorical",
            partition: "training",
            target,
            semanticsVersion: DEFAULT_SEMANTICS_VERSION,
            maxAttempts: 20,
            wallTimeBudgetMs: 1000,
        });
        expect(generated.ok).toBeTrue();
        if (generated.ok) expect(generated.item.semanticCertificate.premisesSatisfiable).toBeTrue();
    });

    it("keeps alternate-semantics provenance separate", () => {
        expect(DEFAULT_SEMANTICS_VERSION).not.toBe(EMPTY_CLASS_SEMANTICS_VERSION);
    });
});
