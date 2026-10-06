import {
    AtomicQuery,
    BooleanConstraintPremise,
    InferenceClassification,
    PremiseNode,
    PropositionValuePremise,
    PropositionWorld,
    QueryNode,
    SemanticCertificate,
} from "../models/semantic.models";

type BooleanPremise = BooleanConstraintPremise | PropositionValuePremise;

function propositionIds(premises: readonly BooleanPremise[], query: QueryNode): string[] {
    const ids = new Set<string>();
    for (const premise of premises) {
        if (premise.kind === "booleanConstraint") {
            premise.propositionIds.forEach(id => ids.add(id));
        } else {
            ids.add(premise.propositionId);
        }
    }
    collectQueryIds(query, ids);
    return [...ids].sort();
}

function collectQueryIds(query: QueryNode, ids: Set<string>): void {
    if (query.kind === "proposition") {
        ids.add(query.propositionId);
    } else if (query.kind === "logicalNot") {
        collectAtomicId(query.operand, ids);
    } else if (query.kind === "boolean") {
        collectAtomicId(query.operands[0], ids);
        collectAtomicId(query.operands[1], ids);
    }
}

function collectAtomicId(query: AtomicQuery, ids: Set<string>): void {
    if (query.kind === "proposition") ids.add(query.propositionId);
}

function atomicValue(query: AtomicQuery, values: ReadonlyMap<string, boolean>): boolean {
    if (query.kind !== "proposition") {
        throw new Error(`The proposition solver cannot evaluate ${query.kind}`);
    }
    return values.get(query.propositionId) ?? false;
}

export function evaluateBooleanQuery(query: QueryNode, values: ReadonlyMap<string, boolean>): boolean {
    if (query.kind === "proposition") return atomicValue(query, values);
    if (query.kind === "logicalNot") return !atomicValue(query.operand, values);
    if (query.kind !== "boolean") {
        throw new Error(`The proposition solver cannot evaluate ${query.kind}`);
    }
    const left = atomicValue(query.operands[0], values);
    const right = atomicValue(query.operands[1], values);
    switch (query.operator) {
        case "and": return left && right;
        case "or": return left || right;
        case "exactlyOne": return left !== right;
    }
}

function premiseValue(premise: BooleanPremise, values: ReadonlyMap<string, boolean>): boolean {
    if (premise.kind === "propositionValue") {
        return values.get(premise.propositionId) === premise.value;
    }
    const [left, right] = premise.propositionIds.map(id => values.get(id) ?? false);
    switch (premise.operator) {
        case "exactlyOne": return left !== right;
        case "atLeastOne": return left || right;
        case "notBoth": return !(left && right);
        case "equivalent": return left === right;
    }
}

export function enumeratePropositionWorlds(
    premises: readonly BooleanPremise[],
    query: QueryNode,
): PropositionWorld[] {
    const ids = propositionIds(premises, query);
    if (ids.length > 20) throw new Error("Bounded proposition solver supports at most 20 variables");
    const worlds: PropositionWorld[] = [];
    for (let mask = 0; mask < (1 << ids.length); mask++) {
        const values = new Map(ids.map((id, index) => [id, (mask & (1 << index)) !== 0]));
        if (premises.every(premise => premiseValue(premise, values))) {
            worlds.push({
                kind: "propositionWorld",
                values: ids.map(id => ({ propositionId: id, value: values.get(id)! })),
            });
        }
    }
    return worlds;
}

function valuesFromWorld(world: PropositionWorld): Map<string, boolean> {
    return new Map(world.values.map(entry => [entry.propositionId, entry.value]));
}

export function classifyPropositionQuery(
    rawPremises: readonly PremiseNode[],
    query: QueryNode,
    includeSupports = true,
): SemanticCertificate {
    const premises = rawPremises.filter((premise): premise is BooleanPremise =>
        premise.kind === "booleanConstraint" || premise.kind === "propositionValue");
    if (premises.length !== rawPremises.length) {
        throw new Error("The proposition solver received a non-Boolean premise");
    }
    const worlds = enumeratePropositionWorlds(premises, query);
    if (!worlds.length) {
        return certificate(false, undefined, undefined, undefined, [], [], "unavailable");
    }
    const queryWorld = worlds.find(world => evaluateBooleanQuery(query, valuesFromWorld(world)));
    const negatedWorld = worlds.find(world => !evaluateBooleanQuery(query, valuesFromWorld(world)));
    const classification: InferenceClassification = !negatedWorld
        ? "entailed"
        : !queryWorld
            ? "refuted"
            : "underdetermined";
    const supports = includeSupports && classification !== "underdetermined" && premises.length <= 12
        ? enumerateMinimalBooleanSupports(premises, query, classification)
        : [];
    const necessary = classification === "underdetermined" ? [] : premises.filter((_, deletedIndex) => {
        const reduced = premises.filter((__, index) => index !== deletedIndex);
        return classifyBooleanWithoutSupports(reduced, query) !== classification;
    }).map(premise => premise.id);
    return certificate(
        true,
        classification,
        queryWorld,
        negatedWorld,
        supports,
        necessary,
        includeSupports && classification !== "underdetermined" && premises.length <= 12 ? "exact" : "unavailable",
    );
}

function certificate(
    satisfiable: boolean,
    classification: InferenceClassification | undefined,
    queryWorld: PropositionWorld | undefined,
    negatedWorld: PropositionWorld | undefined,
    supports: Array<{ premiseIds: string[]; minimal: true; status: "exact" }>,
    necessaryPremiseIds: string[],
    supportStatus: "exact" | "unavailable",
): SemanticCertificate {
    return {
        premisesSatisfiable: satisfiable,
        classification,
        solverCompleteness: "boundedComplete",
        finiteDomainAssumptions: ["Перебраны все оценки перечисленных пропозициональных переменных."],
        queryWitness: queryWorld,
        negatedQueryWitness: negatedWorld,
        supports,
        necessaryPremiseIds,
        contrastiveRelevantPremiseIds: [],
        verification: {
            premisesChecked: true,
            witnessesChecked: true,
            supportsChecked: supportStatus,
            independentOracleChecked: null,
        },
    };
}

function classifyBooleanWithoutSupports(
    premises: readonly BooleanPremise[],
    query: QueryNode,
): InferenceClassification | "inconsistent" {
    const worlds = enumeratePropositionWorlds(premises, query);
    if (!worlds.length) return "inconsistent";
    const values = worlds.map(valuesFromWorld);
    const querySat = values.some(world => evaluateBooleanQuery(query, world));
    const negatedSat = values.some(world => !evaluateBooleanQuery(query, world));
    return !negatedSat ? "entailed" : !querySat ? "refuted" : "underdetermined";
}

function enumerateMinimalBooleanSupports(
    premises: readonly BooleanPremise[],
    query: QueryNode,
    target: "entailed" | "refuted",
): Array<{ premiseIds: string[]; minimal: true; status: "exact" }> {
    const found: number[][] = [];
    for (let mask = 0; mask < (1 << premises.length); mask++) {
        const indices = premises.map((_, index) => index).filter(index => (mask & (1 << index)) !== 0);
        if (found.some(existing => existing.every(index => indices.includes(index)))) continue;
        if (classifyBooleanWithoutSupports(indices.map(index => premises[index]), query) === target) {
            found.push(indices);
        }
    }
    return found.map(indices => ({
        premiseIds: indices.map(index => premises[index].id),
        minimal: true,
        status: "exact",
    }));
}
