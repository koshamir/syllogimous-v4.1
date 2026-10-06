import {
    AtomicQuery,
    CategoricalPremise,
    CategoricalQuantifier,
    CategoricalWorld,
    DomainSpec,
    EntityId,
    ExistentialImportPolicy,
} from "../models/semantic.models";

export function negateCategoricalQuantifier(quantifier: CategoricalQuantifier): CategoricalQuantifier {
    switch (quantifier) {
        case "all": return "someNot";
        case "no": return "some";
        case "some": return "no";
        case "someNot": return "all";
    }
}

export function negateCategoricalQuery(query: Extract<AtomicQuery, { kind: "categorical" }>): Extract<AtomicQuery, { kind: "categorical" }> {
    return { ...query, quantifier: negateCategoricalQuantifier(query.quantifier) };
}

function hasClass(mask: number, index: number): boolean {
    return (mask & (1 << index)) !== 0;
}

function propositionHolds(
    quantifier: CategoricalQuantifier,
    subjectIndex: number,
    predicateIndex: number,
    masks: readonly number[],
): boolean {
    switch (quantifier) {
        case "all":
            return masks.every(mask => !hasClass(mask, subjectIndex) || hasClass(mask, predicateIndex));
        case "no":
            return masks.every(mask => !hasClass(mask, subjectIndex) || !hasClass(mask, predicateIndex));
        case "some":
            return masks.some(mask => hasClass(mask, subjectIndex) && hasClass(mask, predicateIndex));
        case "someNot":
            return masks.some(mask => hasClass(mask, subjectIndex) && !hasClass(mask, predicateIndex));
    }
}

export function validateCategoricalWorld(
    world: CategoricalWorld,
    premises: readonly CategoricalPremise[],
    namedClasses: readonly EntityId[],
    policy: ExistentialImportPolicy,
): boolean {
    const classIndex = new Map(namedClasses.map((id, index) => [id, index]));
    if (!world.witnesses.length
        || new Set(world.witnesses.map(witness => witness.id)).size !== world.witnesses.length
        || world.witnesses.some(witness => !witness.id
            || new Set(witness.classes).size !== witness.classes.length
            || witness.classes.some(classId => !classIndex.has(classId)))) {
        return false;
    }
    const masks = world.witnesses.map(witness => witness.classes.reduce((mask, classId) => {
        const index = classIndex.get(classId);
        return index === undefined ? mask : mask | (1 << index);
    }, 0));
    if (policy === "allNamedClassesNonempty" && namedClasses.some((_, index) => !masks.some(mask => hasClass(mask, index)))) {
        return false;
    }
    return premises.every(premise => {
        const subject = classIndex.get(premise.subject);
        const predicate = classIndex.get(premise.predicate);
        return subject !== undefined
            && predicate !== undefined
            && propositionHolds(premise.quantifier, subject, predicate, masks);
    });
}

export interface CategoricalSatResult {
    satisfiable: boolean;
    world?: CategoricalWorld;
    admissibleAtomCount: number;
}

/**
 * Complete decision procedure for unrestricted unary categorical predicates.
 * Universal statements remove membership atoms; each existential obligation
 * needs one remaining atom. No fixed finite universe is used as a proof proxy.
 */
export function solveCategoricalSat(
    premises: readonly CategoricalPremise[],
    domain: Extract<DomainSpec, { kind: "categoricalUnary" }>,
): CategoricalSatResult {
    if (domain.namedClasses.length > 20) {
        throw new Error("The unary atom solver supports at most 20 named classes per item");
    }
    const classIndex = new Map(domain.namedClasses.map((id, index) => [id, index]));
    if (premises.some(premise => !classIndex.has(premise.subject) || !classIndex.has(premise.predicate))) {
        return { satisfiable: false, admissibleAtomCount: 0 };
    }
    const universals = premises.filter(premise => premise.quantifier === "all" || premise.quantifier === "no");
    const atomLimit = 1 << domain.namedClasses.length;
    const admissibleMasks: number[] = [];
    for (let mask = 0; mask < atomLimit; mask++) {
        const allowed = universals.every(premise => {
            const subject = classIndex.get(premise.subject)!;
            const predicate = classIndex.get(premise.predicate)!;
            return propositionHolds(premise.quantifier, subject, predicate, [mask]);
        });
        if (allowed) {
            admissibleMasks.push(mask);
        }
    }

    const obligations: Array<(mask: number) => boolean> = [];
    for (const premise of premises) {
        const subject = classIndex.get(premise.subject)!;
        const predicate = classIndex.get(premise.predicate)!;
        if (premise.quantifier === "some") {
            obligations.push(mask => hasClass(mask, subject) && hasClass(mask, predicate));
        } else if (premise.quantifier === "someNot") {
            obligations.push(mask => hasClass(mask, subject) && !hasClass(mask, predicate));
        }
    }
    if (domain.existentialImport === "allNamedClassesNonempty") {
        for (let index = 0; index < domain.namedClasses.length; index++) {
            obligations.push(mask => hasClass(mask, index));
        }
    }

    const chosenMasks: number[] = [];
    for (const obligation of obligations) {
        const witness = admissibleMasks.find(obligation);
        if (witness === undefined) {
            return { satisfiable: false, admissibleAtomCount: admissibleMasks.length };
        }
        if (!chosenMasks.includes(witness)) {
            chosenMasks.push(witness);
        }
    }

    // First-order domains are nonempty even when every named predicate is empty.
    if (!chosenMasks.length) {
        chosenMasks.push(0);
    }
    const world: CategoricalWorld = {
        kind: "categoricalWorld",
        witnesses: chosenMasks.map((mask, index) => ({
            id: `w${index + 1}`,
            classes: domain.namedClasses.filter((_, classPosition) => hasClass(mask, classPosition)),
        })),
    };
    if (!validateCategoricalWorld(world, premises, domain.namedClasses, domain.existentialImport)) {
        throw new Error("Internal categorical witness validation failed");
    }
    return { satisfiable: true, world, admissibleAtomCount: admissibleMasks.length };
}

export function categoricalQueryAsPremise(
    query: Extract<AtomicQuery, { kind: "categorical" }>,
    id = "__query__",
): CategoricalPremise {
    return {
        kind: "categorical",
        id,
        quantifier: query.quantifier,
        subject: query.subject,
        predicate: query.predicate,
    };
}

export function categoricalConstraintSignature(
    premises: readonly CategoricalPremise[],
    domain: Extract<DomainSpec, { kind: "categoricalUnary" }>,
): string {
    const solved = solveCategoricalSat(premises, domain);
    const existential = premises
        .filter(premise => premise.quantifier === "some" || premise.quantifier === "someNot")
        .map(premise => `${premise.quantifier}:${premise.subject}:${premise.predicate}`)
        .sort();
    return JSON.stringify({ sat: solved.satisfiable, atoms: solved.admissibleAtomCount, existential });
}
