import {
    DomainSpec,
    EntitySpec,
    GenerationRequest,
    PremiseNode,
    QueryNode,
    ReasoningFamily,
    ReasoningItem,
    ResponseSpec,
    SemanticCertificate,
} from "../models/semantic.models";
import {
    GENERATOR_VERSION,
    REASONING_ITEM_SCHEMA_VERSION,
    SOLVER_VERSION,
} from "../models/versions";
import { structuralFingerprint, stableHash } from "../certificates/canonical";
import { withMeasuredComplexity } from "../complexity/complexity";

export interface StructuralItemParts {
    family: ReasoningFamily;
    componentFamilies: ReasoningFamily[];
    structureFamily: string;
    domain: DomainSpec;
    entities: EntitySpec[];
    premises: PremiseNode[];
    query: QueryNode;
    responseSpec: ResponseSpec;
    semanticCertificate: SemanticCertificate;
    attempt: number;
    startedAt: number;
    now: () => number;
    premiseOrder?: string[];
    labelVariant?: number;
    scaffolds?: ReasoningItem["presentation"]["scaffolds"];
    fingerprint?: string;
}

export function buildStructuralItem(
    request: GenerationRequest,
    parts: StructuralItemParts,
): ReasoningItem {
    if (!parts.semanticCertificate.premisesSatisfiable || !parts.semanticCertificate.classification) {
        throw new Error("Ordinary inference generation requires satisfiable premises and a verified classification");
    }
    const fingerprint = parts.fingerprint
        ?? structuralFingerprint(parts.entities, parts.premises, parts.query, parts.domain);
    const elapsedMs = parts.now() - parts.startedAt;
    return withMeasuredComplexity({
        id: `ri-${stableHash(`${request.seed}:${parts.structureFamily}:${fingerprint}`)}`,
        schemaVersion: REASONING_ITEM_SCHEMA_VERSION,
        generatorVersion: GENERATOR_VERSION,
        semanticsVersion: request.semanticsVersion,
        solverVersion: SOLVER_VERSION,
        seed: request.seed,
        family: parts.family,
        componentFamilies: parts.componentFamilies,
        structureFamily: parts.structureFamily,
        grammarPartition: request.partition,
        domain: parts.domain,
        entities: parts.entities,
        premises: parts.premises,
        query: parts.query,
        responseSpec: parts.responseSpec,
        targetComplexity: request.target,
        semanticCertificate: parts.semanticCertificate,
        structuralFingerprint: fingerprint,
        presentation: {
            locale: "ru",
            premiseOrder: parts.premiseOrder ?? parts.premises.map(premise => premise.id),
            labelVariant: parts.labelVariant ?? 0,
            stableAnswerOrder: ["entailed", "refuted", "underdetermined"],
            negationCue: "textAndSymbol",
            scaffolds: parts.scaffolds ?? (request.target.level <= 2 ? ["roleLabels", "workspace"] : ["workspace"]),
        },
        provenance: {
            semanticSeed: `${request.seed}::semantic`,
            presentationSeed: `${request.seed}::presentation`,
            schedulerSeed: `${request.seed}::scheduler`,
            attempt: parts.attempt,
            maxAttempts: request.maxAttempts,
            elapsedMs,
            wallTimeBudgetMs: request.wallTimeBudgetMs,
            requestedTarget: request.target,
            appliedTarget: request.target,
            generatedAt: Date.now(),
        },
    });
}
