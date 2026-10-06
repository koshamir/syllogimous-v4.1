import { AtomicQuery, BindingId, ContextScopeWorld, ScopeFrameSpec, ScopeSemanticWorld, ScopeWorld, ScopedRelationPremise } from "../models/semantic.models";

type ScopedQuery = Extract<AtomicQuery, { kind: "scopedRelation" }>;

export function validateBindings(statement: ScopedQuery | ScopedRelationPremise): string[] {
    const errors: string[] = [];
    if (statement.subjectBindingId === statement.objectBindingId) {
        errors.push("Связанные переменные субъекта и объекта должны иметь разные идентификаторы.");
    }
    const expected = new Set([statement.subjectBindingId, statement.objectBindingId]);
    if (statement.quantifierOrder.length !== 2
        || new Set(statement.quantifierOrder).size !== 2
        || statement.quantifierOrder.some(binding => !expected.has(binding))) {
        errors.push("Порядок кванторов должен содержать обе связанные переменные ровно по одному разу.");
    }
    if (statement.nestingDepth !== statement.quantifierOrder.length) {
        errors.push("Глубина области действия должна совпадать с числом явно упорядоченных кванторов.");
    }
    return errors;
}

/**
 * Binding IDs are AST identities, not display variable names.  Reusing one ID
 * in separate nodes is rejected so an alpha-renaming pass cannot capture it.
 */
export function validateUniqueBindings(
    statements: readonly (ScopedQuery | ScopedRelationPremise)[],
): string[] {
    const owners = new Map<BindingId, number>();
    const errors: string[] = [];
    statements.forEach((statement, statementIndex) => {
        for (const binding of [statement.subjectBindingId, statement.objectBindingId]) {
            const previous = owners.get(binding);
            if (previous !== undefined && previous !== statementIndex) {
                errors.push(`Идентификатор связанной переменной «${binding}» повторно использован в другой формуле.`);
            } else {
                owners.set(binding, statementIndex);
            }
        }
    });
    return errors;
}

export function alphaRenameBinding<T extends ScopedQuery | ScopedRelationPremise>(
    statement: T,
    oldBindingId: BindingId,
    newBindingId: BindingId,
): T {
    if (oldBindingId !== statement.subjectBindingId && oldBindingId !== statement.objectBindingId) {
        throw new Error(`Связанная переменная «${oldBindingId}» отсутствует в формуле.`);
    }
    const other = oldBindingId === statement.subjectBindingId
        ? statement.objectBindingId
        : statement.subjectBindingId;
    if (newBindingId === other) {
        throw new Error(`Переименование в «${newBindingId}» привело бы к захвату переменной.`);
    }
    return {
        ...statement,
        subjectBindingId: statement.subjectBindingId === oldBindingId ? newBindingId : statement.subjectBindingId,
        objectBindingId: statement.objectBindingId === oldBindingId ? newBindingId : statement.objectBindingId,
        quantifierOrder: statement.quantifierOrder.map(binding =>
            binding === oldBindingId ? newBindingId : binding) as [BindingId, BindingId],
    };
}

export function evaluateScopedRelation(
    statement: ScopedQuery | ScopedRelationPremise,
    world: ScopeSemanticWorld,
): boolean {
    const errors = validateBindings(statement);
    if (errors.length) throw new Error(errors.join(" "));
    const frame = world.kind === "contextScopeWorld"
        ? world.frames.find(candidate => candidate.contextId === statement.contextId && candidate.relation === statement.relation
            && candidate.subjectClass === statement.subjectClass && candidate.objectClass === statement.objectClass)
        : undefined;
    if (world.kind === "contextScopeWorld" && !frame) return false;
    if (world.kind === "scopeWorld" && statement.contextId !== world.contextId) return false;
    const pairs = frame ? frame.relationPairs : (world as ScopeWorld).relationPairs;
    const subjectIds = frame ? frame.subjectIds : (world as ScopeWorld).people;
    const objectIds = frame ? frame.objectIds : (world as ScopeWorld).objects;
    const relation = new Set(pairs.map(([subject, object]) => `${subject}\u0000${object}`));
    const domains = new Map<BindingId, string[]>([
        [statement.subjectBindingId, subjectIds],
        [statement.objectBindingId, objectIds],
    ]);
    const quantifiers = new Map<BindingId, "every" | "some">([
        [statement.subjectBindingId, statement.subjectQuantifier],
        [statement.objectBindingId, statement.objectQuantifier],
    ]);
    const assignment = new Map<BindingId, string>();
    const evaluateAt = (depth: number): boolean => {
        if (depth === statement.quantifierOrder.length) {
            const subject = assignment.get(statement.subjectBindingId)!;
            const object = assignment.get(statement.objectBindingId)!;
            return relation.has(`${subject}\u0000${object}`);
        }
        const binding = statement.quantifierOrder[depth];
        const values = domains.get(binding)!;
        const quantify = quantifiers.get(binding)!;
        const results = values.map(value => {
            assignment.set(binding, value);
            return evaluateAt(depth + 1);
        });
        assignment.delete(binding);
        return quantify === "every" ? results.every(Boolean) : results.some(Boolean);
    };
    return evaluateAt(0);
}

/** Exhaustive product of separate context/relation tables with declared roles. */
export function enumerateContextScopeWorlds(frames: readonly ScopeFrameSpec[]): ContextScopeWorld[] {
    const keys = frames.map(frame => `${frame.contextId}\u0000${frame.relation}`);
    if (!frames.length || new Set(keys).size !== keys.length
        || frames.some(frame => !frame.subjectIds.length || !frame.objectIds.length
            || new Set(frame.subjectIds).size !== frame.subjectIds.length || new Set(frame.objectIds).size !== frame.objectIds.length)) {
        throw new Error("Контексты отношений и их ролевые домены должны быть явно заданы без повторений.");
    }
    const atomCount = frames.reduce((count, frame) => count + frame.subjectIds.length * frame.objectIds.length, 0);
    if (atomCount > 12) throw new Error("Полный многоконтекстный поиск ограничен 12 возможными связями (4096 мирами).");
    let worlds: ContextScopeWorld[] = [{ kind: "contextScopeWorld", frames: [] }];
    for (const frame of frames) {
        const tables = enumerateScopeWorlds(frame.contextId, frame.subjectIds, frame.objectIds);
        worlds = worlds.flatMap(world => tables.map(table => ({
            kind: "contextScopeWorld" as const,
            frames: [...world.frames, { ...frame, subjectIds: [...frame.subjectIds], objectIds: [...frame.objectIds], relationPairs: table.relationPairs }],
        })));
    }
    return worlds;
}

export function enumerateScopeWorlds(
    contextId: string,
    people: readonly string[],
    objects: readonly string[],
): ScopeWorld[] {
    const possiblePairs = people.flatMap(person => objects.map(object => [person, object] as [string, string]));
    if (possiblePairs.length > 16) throw new Error("Scope reference solver is limited to sixteen possible relation pairs");
    const worlds: ScopeWorld[] = [];
    for (let mask = 0; mask < (1 << possiblePairs.length); mask++) {
        worlds.push({
            kind: "scopeWorld",
            contextId,
            people: [...people],
            objects: [...objects],
            relationPairs: possiblePairs.filter((_, index) => (mask & (1 << index)) !== 0),
        });
    }
    return worlds;
}
