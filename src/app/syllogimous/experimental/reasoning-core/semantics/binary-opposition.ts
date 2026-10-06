export interface GenericInequality {
    left: string;
    right: string;
}

export interface OppositionRelation {
    left: string;
    right: string;
    relation: "same" | "opposite";
}

/**
 * Generic inequality over 3+ values is intentionally not parity. Returns all
 * models because A≠B and B≠C may allow either A=C or A≠C.
 */
export function enumerateGenericInequalityModels(
    entities: readonly string[],
    constraints: readonly GenericInequality[],
    domainSize: number,
): Array<Record<string, number>> {
    if (!Number.isSafeInteger(domainSize) || domainSize < 2) {
        throw new Error("Generic inequality needs a finite domain of at least two values");
    }
    const models: Array<Record<string, number>> = [];
    const values = new Array<number>(entities.length).fill(0);
    const walk = (index: number): void => {
        if (index === entities.length) {
            const model = Object.fromEntries(entities.map((entity, position) => [entity, values[position]]));
            if (constraints.every(constraint => model[constraint.left] !== model[constraint.right])) models.push(model);
            return;
        }
        for (let value = 0; value < domainSize; value++) {
            values[index] = value;
            walk(index + 1);
        }
    };
    walk(0);
    return models;
}

/** Two-class same/opposite relations are a separate XOR/parity contract. */
export function solveBinaryOpposition(
    entities: readonly string[],
    relations: readonly OppositionRelation[],
): Array<Record<string, 0 | 1>> {
    const models: Array<Record<string, 0 | 1>> = [];
    for (let mask = 0; mask < (1 << entities.length); mask++) {
        const model = Object.fromEntries(entities.map((entity, index) => [entity, ((mask >> index) & 1) as 0 | 1])) as Record<string, 0 | 1>;
        if (relations.every(relation => (model[relation.left] === model[relation.right]) === (relation.relation === "same"))) {
            models.push(model);
        }
    }
    return models;
}
