import {
    AtomicQuery,
    ConditionalPremise,
    ContainmentPremise,
    InferenceClassification,
    MembershipWorld,
    PremiseNode,
    SemanticCertificate,
} from "../models/semantic.models";
import {
    enumerateMinimalSupports,
    enumerateNonredundantWorldRestrictions,
} from "../certificates/exhaustive-supports";

export type HierarchyPremise = ContainmentPremise | ConditionalPremise;

export function validateHierarchyTyping(
    premises: readonly HierarchyPremise[],
    objectIds: readonly string[],
    classIds: readonly string[],
): string[] {
    const errors: string[] = [];
    const validateContainment = (premise: ContainmentPremise, allowBinding: string | undefined): void => {
        if (premise.relation === "includedIn") {
            if (!classIds.includes(premise.subject) || !classIds.includes(premise.classId)) {
                errors.push(`Включение классов ${premise.id} должно связывать два класса.`);
            }
        } else if (premise.subject !== allowBinding && !objectIds.includes(premise.subject)) {
            errors.push(`Членство ${premise.id} должно начинаться с объекта.`);
        }
        if (!classIds.includes(premise.classId)) {
            errors.push(`В ${premise.id} указан неизвестный класс.`);
        }
    };
    for (const premise of premises) {
        if (premise.kind === "containment") {
            validateContainment(premise, undefined);
        } else {
            if (premise.if.kind !== "containment" || premise.then.kind !== "containment") {
                errors.push(`Условие ${premise.id} выходит за монотонный фрагмент и не будет вычислено.`);
                continue;
            }
            validateContainment(premise.if, premise.bindingId);
            validateContainment(premise.then, premise.bindingId);
            if (premise.if.subject !== premise.bindingId && premise.then.subject !== premise.bindingId) {
                errors.push(`Условие ${premise.id} не использует объявленную связанную переменную.`);
            }
            if (premise.if.contextId !== premise.then.contextId) {
                errors.push(`Условие ${premise.id} не может незаметно переносить правило между контекстами.`);
            }
            if (new Set(premise.exceptEntityIds).size !== premise.exceptEntityIds.length
                || premise.exceptEntityIds.some(entityId => !objectIds.includes(entityId))) {
                errors.push(`Исключения ${premise.id} должны быть уникальными объявленными объектами.`);
            }
        }
    }
    return errors;
}

function membershipKey(objectId: string, classId: string): string {
    return `${objectId}\u0000${classId}`;
}

export function hierarchyContainmentHolds(
    premise: ContainmentPremise,
    memberships: ReadonlySet<string>,
    objectIds: readonly string[],
): boolean {
    if (premise.relation === "memberOf") {
        return memberships.has(membershipKey(premise.subject, premise.classId));
    }
    if (premise.relation === "excludedFrom") {
        return !memberships.has(membershipKey(premise.subject, premise.classId));
    }
    return objectIds.every(objectId =>
        !memberships.has(membershipKey(objectId, premise.subject))
        || memberships.has(membershipKey(objectId, premise.classId)));
}

function instantiate(premise: ContainmentPremise, bindingId: string, objectId: string): ContainmentPremise {
    return {
        ...premise,
        subject: premise.subject === bindingId ? objectId : premise.subject,
    };
}

function hierarchyPremiseHolds(
    premise: HierarchyPremise,
    memberships: ReadonlySet<string>,
    objectIds: readonly string[],
): boolean {
    if (premise.kind === "containment") return hierarchyContainmentHolds(premise, memberships, objectIds);
    const antecedent = premise.if;
    const consequent = premise.then;
    if (antecedent.kind !== "containment" || consequent.kind !== "containment") return false;
    return objectIds.every(objectId => {
        if (premise.exceptEntityIds.includes(objectId)) return true;
        const ifGround = instantiate(antecedent, premise.bindingId, objectId);
        const thenGround = instantiate(consequent, premise.bindingId, objectId);
        return !hierarchyContainmentHolds(ifGround, memberships, objectIds)
            || hierarchyContainmentHolds(thenGround, memberships, objectIds);
    });
}

export function enumerateHierarchyWorlds(
    premises: readonly HierarchyPremise[],
    objectIds: readonly string[],
    classIds: readonly string[],
): MembershipWorld[] {
    const typingErrors = validateHierarchyTyping(premises, objectIds, classIds);
    if (typingErrors.length) throw new Error(typingErrors.join(" "));
    const atoms = objectIds.flatMap(objectId => classIds.map(classId => ({ objectId, classId })));
    if (atoms.length > 20) throw new Error("The bounded hierarchy solver supports at most twenty membership atoms");
    const worlds: MembershipWorld[] = [];
    for (let mask = 0; mask < (1 << atoms.length); mask++) {
        const selected = atoms.filter((_, index) => (mask & (1 << index)) !== 0);
        const membershipSet = new Set(selected.map(entry => membershipKey(entry.objectId, entry.classId)));
        if (premises.every(premise => hierarchyPremiseHolds(premise, membershipSet, objectIds))) {
            worlds.push({ kind: "membershipWorld", memberships: selected });
        }
    }
    return worlds;
}

export function classifyHierarchyQuery(
    rawPremises: readonly PremiseNode[],
    query: Extract<AtomicQuery, { kind: "containment" }>,
    objectIds: readonly string[],
    classIds: readonly string[],
): SemanticCertificate {
    const premises = rawPremises.filter((premise): premise is HierarchyPremise =>
        premise.kind === "containment" || premise.kind === "conditional");
    if (premises.length !== rawPremises.length) throw new Error("Hierarchy solver received an unsupported premise");
    const worlds = enumerateHierarchyWorlds(premises, objectIds, classIds);
    if (!worlds.length) return hierarchyCertificate(
        false,
        undefined,
        undefined,
        undefined,
        objectIds,
        classIds,
        [],
        [],
        [],
        "unavailable",
    );
    const queryAsPremise: ContainmentPremise = { ...query, id: "__query__" };
    const holds = (world: MembershipWorld) => hierarchyContainmentHolds(
        queryAsPremise,
        new Set(world.memberships.map(entry => membershipKey(entry.objectId, entry.classId))),
        objectIds,
    );
    const queryWorld = worlds.find(holds);
    const negatedWorld = worlds.find(world => !holds(world));
    const classification: InferenceClassification = !negatedWorld ? "entailed" : !queryWorld ? "refuted" : "underdetermined";
    const classifySubset = (subset: readonly HierarchyPremise[]) => {
        const subsetWorlds = enumerateHierarchyWorlds(subset, objectIds, classIds);
        const someQuery = subsetWorlds.some(holds);
        const someNegated = subsetWorlds.some(world => !holds(world));
        return {
            satisfiable: subsetWorlds.length > 0,
            classification: !subsetWorlds.length
                ? undefined
                : !someNegated
                    ? "entailed" as const
                    : !someQuery
                        ? "refuted" as const
                        : "underdetermined" as const,
        };
    };
    const supportAnalysis = enumerateMinimalSupports(premises, classification, classifySubset);
    const relevance = classification === "underdetermined"
        ? enumerateNonredundantWorldRestrictions(
            premises,
            subset => enumerateHierarchyWorlds(subset, objectIds, classIds),
            hierarchyWorldKey,
        )
        : { premiseIds: [] as string[], status: "exact" as const };
    return hierarchyCertificate(
        true,
        classification,
        queryWorld,
        negatedWorld,
        objectIds,
        classIds,
        supportAnalysis.supports,
        supportAnalysis.necessaryPremiseIds,
        relevance.premiseIds,
        supportAnalysis.status,
    );
}

export function validateHierarchyWorld(
    world: MembershipWorld,
    premises: readonly HierarchyPremise[],
    objectIds: readonly string[],
    classIds: readonly string[],
): { valid: boolean; messageRu?: string } {
    const allowedObjects = new Set(objectIds);
    const allowedClasses = new Set(classIds);
    if (world.memberships.some(entry => !allowedObjects.has(entry.objectId) || !allowedClasses.has(entry.classId))) {
        return { valid: false, messageRu: "Модель содержит необъявленный объект или класс." };
    }
    const keys = world.memberships.map(entry => membershipKey(entry.objectId, entry.classId));
    if (new Set(keys).size !== keys.length) {
        return { valid: false, messageRu: "Одно и то же членство указано более одного раза." };
    }
    const membershipSet = new Set(keys);
    const failed = premises.find(premise => !hierarchyPremiseHolds(premise, membershipSet, objectIds));
    return failed
        ? { valid: false, messageRu: `Нарушена посылка «${failed.id}».` }
        : { valid: true };
}

function hierarchyWorldKey(world: MembershipWorld): string {
    return world.memberships
        .map(entry => membershipKey(entry.objectId, entry.classId))
        .sort()
        .join("|");
}

function hierarchyCertificate(
    satisfiable: boolean,
    classification: InferenceClassification | undefined,
    queryWorld: MembershipWorld | undefined,
    negatedWorld: MembershipWorld | undefined,
    objectIds: readonly string[],
    classIds: readonly string[],
    supports: SemanticCertificate["supports"] = [],
    necessaryPremiseIds: string[] = [],
    contrastiveRelevantPremiseIds: string[] = [],
    supportStatus: SemanticCertificate["verification"]["supportsChecked"] = "unavailable",
): SemanticCertificate {
    return {
        premisesSatisfiable: satisfiable,
        classification,
        solverCompleteness: "boundedComplete",
        finiteDomainAssumptions: [`Перебраны все варианты членства ${objectIds.length} перечисленных объектов в ${classIds.length} перечисленных классах.`],
        queryWitness: queryWorld,
        negatedQueryWitness: negatedWorld,
        supports,
        necessaryPremiseIds,
        contrastiveRelevantPremiseIds,
        verification: {
            premisesChecked: true,
            witnessesChecked: true,
            supportsChecked: supportStatus,
            independentOracleChecked: null,
        },
    };
}
