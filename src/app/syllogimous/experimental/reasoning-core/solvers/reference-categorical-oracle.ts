import {
    AtomicQuery,
    CategoricalPremise,
    DomainSpec,
    InferenceClassification,
} from "../models/semantic.models";
import { negateCategoricalQuery } from "../semantics/categorical";

/**
 * Independent, deliberately small reference oracle. Unlike the production
 * admissible-atom procedure, this enumerates concrete finite interpretations.
 */
export function referenceClassifyCategorical(
    premises: readonly CategoricalPremise[],
    query: Extract<AtomicQuery, { kind: "categorical" }>,
    domain: Extract<DomainSpec, { kind: "categoricalUnary" }>,
): InferenceClassification | "inconsistent" {
    if (domain.namedClasses.length > 4) {
        throw new Error("Reference categorical oracle is restricted to four predicates");
    }
    const obligationCount = premises.filter(premise => premise.quantifier === "some" || premise.quantifier === "someNot").length
        + (domain.existentialImport === "allNamedClassesNonempty" ? domain.namedClasses.length : 0)
        + 1;
    const maxIndividuals = Math.max(1, obligationCount);
    let baseSat = false;
    let querySat = false;
    let negatedSat = false;
    for (let size = 1; size <= maxIndividuals && !(querySat && negatedSat); size++) {
        enumerateInterpretations(domain.namedClasses.length, size, masks => {
            if (!interpretationSatisfies(premises, masks, domain)) {
                return true;
            }
            baseSat = true;
            querySat ||= queryHolds(query, masks, domain.namedClasses);
            negatedSat ||= queryHolds(negateCategoricalQuery(query), masks, domain.namedClasses);
            return !(querySat && negatedSat);
        });
    }
    if (!baseSat) return "inconsistent";
    if (!negatedSat) return "entailed";
    if (!querySat) return "refuted";
    return "underdetermined";
}

function enumerateInterpretations(
    classCount: number,
    individualCount: number,
    visit: (masks: number[]) => boolean,
): void {
    const radix = 1 << classCount;
    const masks = new Array<number>(individualCount).fill(0);
    // Unary categorical sentences cannot distinguish individuals with the
    // same membership type. Remove duplicate types and enumerate each concrete
    // interpretation once in increasing mask order (not every permutation).
    const walk = (index: number, minimumMask: number): boolean => {
        if (index === individualCount) return visit([...masks]);
        for (let mask = minimumMask; mask <= radix - (individualCount - index); mask++) {
            masks[index] = mask;
            if (!walk(index + 1, mask + 1)) return false;
        }
        return true;
    };
    walk(0, 0);
}

function queryHolds(
    query: Extract<AtomicQuery, { kind: "categorical" }>,
    masks: readonly number[],
    classes: readonly string[],
): boolean {
    const subject = classes.indexOf(query.subject);
    const predicate = classes.indexOf(query.predicate);
    if (subject < 0 || predicate < 0) return false;
    const has = (mask: number, index: number) => (mask & (1 << index)) !== 0;
    switch (query.quantifier) {
        case "all": return masks.every(mask => !has(mask, subject) || has(mask, predicate));
        case "no": return masks.every(mask => !has(mask, subject) || !has(mask, predicate));
        case "some": return masks.some(mask => has(mask, subject) && has(mask, predicate));
        case "someNot": return masks.some(mask => has(mask, subject) && !has(mask, predicate));
    }
}

function interpretationSatisfies(
    premises: readonly CategoricalPremise[],
    masks: readonly number[],
    domain: Extract<DomainSpec, { kind: "categoricalUnary" }>,
): boolean {
    const nonempty = domain.existentialImport !== "allNamedClassesNonempty"
        || domain.namedClasses.every((_, index) => masks.some(mask => (mask & (1 << index)) !== 0));
    return nonempty && premises.every(premise => queryHolds({
        kind: "categorical",
        quantifier: premise.quantifier,
        subject: premise.subject,
        predicate: premise.predicate,
    }, masks, domain.namedClasses));
}
