import {
    AtomicQuery,
    CategoricalPremise,
    GraphEdgePremise,
    InferenceClassification,
    IntervalPremise,
    OrderPremise,
    PremiseNode,
    RationalPremise,
    ReasoningItem,
    ScopedRelationPremise,
    SemanticCertificate,
} from "../models/semantic.models";
import { REASONING_ITEM_SCHEMA_VERSION, SOLVER_VERSION } from "../models/versions";
import { verifySubmittedWorld } from "../semantics/world-verifier";
import { classifyBoundedIntervals } from "../solvers/bounded-interval-solver";
import { classifyBoundedOrder } from "../solvers/bounded-order-solver";
import { classifyCategorical } from "../solvers/categorical-solver";
import { classifyGraphIsomorphism } from "../solvers/graph-solver";
import { classifyHierarchyQuery } from "../solvers/hierarchy-solver";
import { classifyProportional } from "../solvers/proportional-solver";
import { classifyPropositionQuery } from "../solvers/proposition-solver";
import { classifyScopeFormula } from "../solvers/scope-solver";
import { classifyTransformation } from "../solvers/transformation-solver";
import { reconstructCoupledFrameProblem, solveCoupledFrame } from "../semantics/coupled-frames";

export interface ItemVerificationIssue {
    code:
        | "versionMismatch"
        | "duplicateEntityId"
        | "duplicatePremiseId"
        | "invalidPresentationOrder"
        | "targetMismatch"
        | "ordinaryItemInconsistent"
        | "classificationMismatch"
        | "missingOpposingWitnesses"
        | "invalidQueryWitness"
        | "invalidNegatedQueryWitness"
        | "invalidSupport"
        | "invalidNecessaryPremise"
        | "unsupportedSemanticContract";
    message: string;
}

export interface ReclassificationResult {
    status: "exact" | "unavailable";
    premisesSatisfiable?: boolean;
    classification?: InferenceClassification;
    certificate?: SemanticCertificate;
    reason?: string;
}

export interface ItemVerificationResult {
    valid: boolean;
    issues: ItemVerificationIssue[];
    semanticRecheck: ReclassificationResult;
}

function invert(classification: InferenceClassification): InferenceClassification {
    return classification === "entailed"
        ? "refuted"
        : classification === "refuted"
            ? "entailed"
            : "underdetermined";
}

function atomicQuery(item: ReasoningItem): { query?: AtomicQuery; negated: boolean } {
    if (item.query.kind === "logicalNot") return { query: item.query.operand, negated: true };
    if (item.query.kind === "boolean") return { negated: false };
    return { query: item.query, negated: false };
}

function fromCertificate(certificate: SemanticCertificate, negated = false): ReclassificationResult {
    return {
        status: "exact",
        premisesSatisfiable: certificate.premisesSatisfiable,
        classification: certificate.classification && negated
            ? invert(certificate.classification)
            : certificate.classification,
        certificate,
    };
}

function unavailable(reason: string): ReclassificationResult {
    return { status: "unavailable", reason };
}

/**
 * Re-runs the declared complete solver rather than trusting the certificate.
 * A family that cannot be reconstructed from the public AST is explicitly
 * unavailable; it is never reported as passing.
 */
export function reclassifyReasoningItem(
    item: ReasoningItem,
    premises: readonly PremiseNode[] = item.premises,
): ReclassificationResult {
    const extracted = atomicQuery(item);
    const query = extracted.query;
    try {
        if (item.family === "coupledFrames") {
            return fromCertificate(solveCoupledFrame(reconstructCoupledFrameProblem(item), premises).certificate);
        }
        if (item.domain.kind === "categoricalUnary" && query?.kind === "categorical") {
            const typed = premises.filter((premise): premise is CategoricalPremise => premise.kind === "categorical");
            if (typed.length !== premises.length) return unavailable("Смешанный фрагмент нельзя проверить категориальным решателем.");
            return fromCertificate(classifyCategorical(typed, query, item.domain).certificate, extracted.negated);
        }
        if (item.domain.kind === "boundedPositions" && query?.kind === "order") {
            const typed = premises.filter((premise): premise is OrderPremise => premise.kind === "order");
            if (typed.length !== premises.length) return unavailable("Смешанный фрагмент нельзя проверить решателем порядка.");
            const entityIds = item.entities
                .filter(entity => entity.sort === "position" || entity.sort === "object")
                .map(entity => entity.id);
            const result = classifyBoundedOrder(entityIds, typed, query, item.domain);
            return result.ok
                ? {
                    status: "exact",
                    premisesSatisfiable: true,
                    classification: extracted.negated ? invert(result.classification) : result.classification,
                }
                : result.code === "inconsistentPremises"
                    ? { status: "exact", premisesSatisfiable: false }
                    : unavailable(result.message);
        }
        if (item.domain.kind === "boundedIntervals" && query?.kind === "interval") {
            const typed = premises.filter((premise): premise is IntervalPremise => premise.kind === "interval");
            if (typed.length !== premises.length) return unavailable("Смешанный фрагмент нельзя проверить интервальным решателем.");
            const entityIds = item.entities.filter(entity => entity.sort === "interval").map(entity => entity.id);
            const result = classifyBoundedIntervals(entityIds, typed, query, item.domain);
            return result.ok
                ? {
                    status: "exact",
                    premisesSatisfiable: true,
                    classification: extracted.negated ? invert(result.classification) : result.classification,
                }
                : result.code === "inconsistentPremises"
                    ? { status: "exact", premisesSatisfiable: false }
                    : unavailable(result.message);
        }
        if (item.domain.kind === "exactRationals" && query?.kind === "rational") {
            const typed = premises.filter((premise): premise is RationalPremise => premise.kind === "rational");
            if (typed.length !== premises.length) return unavailable("Смешанный фрагмент нельзя проверить решателем пропорций.");
            const result = classifyProportional(typed, query, item.domain);
            return result.ok
                ? {
                    status: "exact",
                    premisesSatisfiable: true,
                    classification: extracted.negated ? invert(result.classification) : result.classification,
                }
                : result.code === "inconsistentPremises"
                    ? { status: "exact", premisesSatisfiable: false }
                    : unavailable(result.message);
        }
        if (item.domain.kind === "boundedContexts" && query?.kind === "scopedRelation") {
            const scopeDomain = item.domain;
            const typed = premises.filter((premise): premise is ScopedRelationPremise => premise.kind === "scopedRelation");
            if (typed.length !== premises.length) return unavailable("Смешанный фрагмент нельзя проверить решателем области действия.");
            const people = item.entities.filter(entity => entity.sort === "person").map(entity => entity.id);
            const objects = item.entities.filter(entity => entity.sort === "object").map(entity => entity.id);
            if (!scopeDomain.contextIds.includes(query.contextId) || query.nestingDepth > scopeDomain.maxNesting
                || typed.some(premise => !scopeDomain.contextIds.includes(premise.contextId) || premise.nestingDepth > scopeDomain.maxNesting)) {
                return unavailable("Контекст или глубина формулы выходит за объявленный конечный домен.");
            }
            if (item.domain.frames) {
                const entityById = new Map(item.entities.map(entity => [entity.id, entity]));
                if (item.domain.frames.some(frame => !scopeDomain.contextIds.includes(frame.contextId)
                    || entityById.get(frame.contextId)?.sort !== "context" || entityById.get(frame.subjectClass)?.sort !== "class"
                    || entityById.get(frame.objectClass)?.sort !== "class"
                    || [...frame.subjectIds, ...frame.objectIds].some(entityId => {
                        const sort = entityById.get(entityId)?.sort;
                        return sort !== "object" && sort !== "person";
                    }))) return unavailable("Ролевые домены контекста ссылаются на необъявленные или неверно типизированные сущности.");
            }
            return fromCertificate(classifyScopeFormula(
                typed,
                extracted.negated ? { kind: "logicalNot", operand: query } : query,
                people,
                objects,
                item.domain.frames,
            ));
        }
        if (item.family === "hierarchy" && query?.kind === "containment") {
            if (item.domain.kind !== "boundedMembership") return unavailable("Иерархический фрагмент требует явно объявленного конечного домена членства.");
            const objects = item.entities
                .filter(entity => entity.sort === "object" || entity.sort === "person")
                .map(entity => entity.id);
            const classes = item.entities.filter(entity => entity.sort === "class").map(entity => entity.id);
            if (!sameMembers(objects, item.domain.objectIds) || !sameMembers(classes, item.domain.classIds)) {
                return unavailable("Перечисленные объекты и классы не совпадают с конечным доменом членства.");
            }
            return fromCertificate(classifyHierarchyQuery(premises, query, objects, classes), extracted.negated);
        }
        if (item.domain.kind === "boundedGraph"
            && (query?.kind === "graphIsomorphism" || query?.kind === "mappingValidity")) {
            const edges = premises.filter((premise): premise is GraphEdgePremise => premise.kind === "graphEdge");
            if (edges.length !== premises.length) return unavailable("Смешанный фрагмент нельзя проверить графовым решателем.");
            const sources = item.entities.filter(entity => entity.features?.["frame"] === "source").map(entity => entity.id);
            const targets = item.entities.filter(entity => entity.features?.["frame"] === "target").map(entity => entity.id);
            if (query.kind === "mappingValidity") {
                // A fixed candidate mapping is a ground Boolean query. Reuse
                // the world verifier, which validates every labelled edge.
                const value = verifySubmittedWorld(item, { kind: "mappingWorld", pairs: query.pairs });
                const classification: InferenceClassification = value.valid && value.queryHolds
                    ? "entailed"
                    : "refuted";
                return {
                    status: "exact",
                    premisesSatisfiable: true,
                    classification: extracted.negated ? invert(classification) : classification,
                };
            }
            return fromCertificate(classifyGraphIsomorphism(
                edges,
                item.domain,
                sources,
                targets,
                query.mappingContract,
            ), extracted.negated);
        }
        if (item.domain.kind === "boundedTransformations" && query?.kind === "transformationResult") {
            const result = classifyTransformation(query, item.domain);
            return result.ok
                ? {
                    status: "exact",
                    premisesSatisfiable: true,
                    classification: extracted.negated ? invert(result.classification) : result.classification,
                }
                : unavailable(result.message);
        }
        const booleanPremises = premises.every(premise =>
            premise.kind === "booleanConstraint" || premise.kind === "propositionValue");
        if (booleanPremises) return fromCertificate(classifyPropositionQuery(premises, item.query, false));
        return unavailable("Публичный AST этого смешанного фрагмента пока не содержит всех параметров для повторного решения.");
    } catch (error) {
        return unavailable(error instanceof Error ? error.message : "Неизвестная ошибка повторной проверки.");
    }
}

function duplicate(values: readonly string[]): string | undefined {
    const seen = new Set<string>();
    return values.find(value => seen.has(value) || !seen.add(value));
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length
        && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function verifyWitness(
    item: ReasoningItem,
    witness: NonNullable<SemanticCertificate["queryWitness"]>,
    expected: boolean,
): boolean {
    const result = verifySubmittedWorld(item, witness);
    return result.valid && result.queryHolds === expected;
}

export function verifyReasoningItem(item: ReasoningItem): ItemVerificationResult {
    const issues: ItemVerificationIssue[] = [];
    if (item.schemaVersion !== REASONING_ITEM_SCHEMA_VERSION || item.solverVersion !== SOLVER_VERSION) {
        issues.push({ code: "versionMismatch", message: "Версия объекта или решателя не совпадает с текущим контрактом." });
    }
    const duplicateEntity = duplicate(item.entities.map(entity => entity.id));
    if (duplicateEntity) issues.push({ code: "duplicateEntityId", message: `Повторяется идентификатор сущности «${duplicateEntity}».` });
    const duplicatePremise = duplicate(item.premises.map(premise => premise.id));
    if (duplicatePremise) issues.push({ code: "duplicatePremiseId", message: `Повторяется идентификатор посылки «${duplicatePremise}».` });
    if (!sameMembers(item.presentation.premiseOrder, item.premises.map(premise => premise.id))) {
        issues.push({ code: "invalidPresentationOrder", message: "Порядок показа не является перестановкой посылок." });
    }
    if (item.premises.length < item.targetComplexity.displayedPremises.min
        || item.premises.length > item.targetComplexity.displayedPremises.max
        || item.measuredComplexity.displayedPremises !== item.premises.length) {
        issues.push({ code: "targetMismatch", message: "Фактическое число посылок не соответствует объявленной цели." });
    }
    if (!item.semanticCertificate.premisesSatisfiable || !item.semanticCertificate.classification) {
        issues.push({ code: "ordinaryItemInconsistent", message: "Обычное задание с противоречивыми посылками нельзя показывать." });
    }

    const semanticRecheck = reclassifyReasoningItem(item);
    if ((item.family === "coupledFrames" || item.family === "hierarchy" || item.family === "contextScope") && semanticRecheck.status !== "exact") {
        issues.push({ code: "unsupportedSemanticContract", message: "Семантический контракт нельзя полностью восстановить и проверить; задание нельзя показывать." });
    }
    if (semanticRecheck.status === "exact"
        && (semanticRecheck.premisesSatisfiable !== true
            || semanticRecheck.classification !== item.semanticCertificate.classification)) {
        issues.push({ code: "classificationMismatch", message: "Повторное решение не подтверждает семантический сертификат." });
    }

    const classification = item.semanticCertificate.classification;
    const queryWitness = item.semanticCertificate.queryWitness;
    const negatedWitness = item.semanticCertificate.negatedQueryWitness;
    if (classification === "underdetermined" && (!queryWitness || !negatedWitness)) {
        issues.push({ code: "missingOpposingWitnesses", message: "Для неопределённого вывода нужны две противоположные модели." });
    }
    if (queryWitness && !verifyWitness(item, queryWitness, true)) {
        issues.push({ code: "invalidQueryWitness", message: "Модель, в которой вывод верен, не прошла повторную проверку." });
    }
    if (negatedWitness && !verifyWitness(item, negatedWitness, false)) {
        issues.push({ code: "invalidNegatedQueryWitness", message: "Контрмодель не прошла повторную проверку." });
    }

    const premiseById = new Map(item.premises.map(premise => [premise.id, premise]));
    for (const support of item.semanticCertificate.supports.filter(candidate =>
        candidate.status === "exact" && semanticRecheck.status === "exact")) {
        const subset = support.premiseIds.map(id => premiseById.get(id)).filter((value): value is PremiseNode => !!value);
        const result = reclassifyReasoningItem(item, subset);
        const minimal = support.premiseIds.every(id => {
            const reduced = subset.filter(premise => premise.id !== id);
            const reducedResult = reclassifyReasoningItem(item, reduced);
            return reducedResult.status === "exact" && reducedResult.classification !== classification;
        });
        if (subset.length !== support.premiseIds.length
            || result.status !== "exact"
            || result.classification !== classification
            || !minimal) {
            issues.push({ code: "invalidSupport", message: `Опора [${support.premiseIds.join(", ")}] не подтверждена полным повторным решением.` });
        }
    }
    for (const necessaryId of semanticRecheck.status === "exact"
        ? item.semanticCertificate.necessaryPremiseIds
        : []) {
        const result = reclassifyReasoningItem(item, item.premises.filter(premise => premise.id !== necessaryId));
        if (!premiseById.has(necessaryId)
            || result.status !== "exact"
            || result.classification === classification) {
            issues.push({ code: "invalidNecessaryPremise", message: `Необходимость посылки «${necessaryId}» не подтверждена удалением.` });
        }
    }
    return { valid: issues.length === 0, issues, semanticRecheck };
}
