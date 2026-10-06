/**
 * Versioned semantic contract for the experimental mode.
 *
 * Keep this file free of Angular, browser and persistence dependencies.  The
 * literal unions are deliberately closed: adding an operator is a semantics
 * change that must be reviewed and versioned.
 */

export type EntityId = string;
export type ContextId = string;
export type BindingId = string;

export type EntitySort =
    | "person"
    | "object"
    | "class"
    | "interval"
    | "number"
    | "context"
    | "graphNode"
    | "position";

export interface EntitySpec {
    id: EntityId;
    label: string;
    sort: EntitySort;
    grammaticalGender?: "masculine" | "feminine" | "neuter" | "plural";
    features?: Readonly<Record<string, string | number | boolean>>;
}

export type ExistentialImportPolicy =
    | "allNamedClassesNonempty"
    | "emptyClassesAllowed";

export type DomainSpec =
    | {
        kind: "categoricalUnary";
        closure: "unrestrictedUnaryPredicates";
        existentialImport: ExistentialImportPolicy;
        namedClasses: EntityId[];
    }
    | {
        kind: "boundedMembership";
        closure: "listedObjectsAndClassesOnly";
        objectIds: EntityId[];
        classIds: EntityId[];
    }
    | {
        kind: "boundedPositions";
        closure: "closedFiniteDomain";
        size: number;
        cyclic: boolean;
        allowCoincidence: boolean;
    }
    | {
        kind: "boundedIntervals";
        closure: "closedFiniteDomain";
        endpointMin: number;
        endpointMax: number;
    }
    | {
        kind: "exactRationals";
        closure: "listedValuesOnly";
        units: string;
    }
    | {
        kind: "boundedGraph";
        closure: "closedFiniteDomain";
        directed: boolean;
        loopsAllowed: boolean;
        nodeIds: EntityId[];
        relationLabels: string[];
    }
    | {
        kind: "boundedContexts";
        closure: "listedContextsOnly";
        contextIds: ContextId[];
        maxNesting: number;
        frames?: ScopeFrameSpec[];
    }
    | {
        kind: "boundedStructuralMapping";
        closure: "listedStructuresOnly";
        mappingContract: "bijection" | "injectiveHomomorphism" | "homomorphism";
        sourceIds: EntityId[];
        targetIds: EntityId[];
    }
    | {
        kind: "boundedTransformations";
        closure: "listedStatesOnly";
        width: number;
        height: number;
        frame: "fixedAxes";
    }
    | {
        kind: "composite";
        closure: "productOfDeclaredDomains";
        parts: DomainSpec[];
    };

export type CategoricalQuantifier = "all" | "no" | "some" | "someNot";

export interface CategoricalPremise {
    kind: "categorical";
    id: string;
    quantifier: CategoricalQuantifier;
    subject: EntityId;
    predicate: EntityId;
}

export type OrderRelation =
    | "strictLess"
    | "lessOrEqual"
    | "equal"
    | "between"
    | "leftOf"
    | "rightOf"
    | "adjacent"
    | "exactDisplacement"
    | "cyclicClockwise";

export interface OrderPremise {
    kind: "order";
    id: string;
    relation: OrderRelation;
    /** Ordered roles. Between uses [middle, leftBoundary, rightBoundary]. */
    args: EntityId[];
    displacement?: number;
}

export type ContainmentRelation = "memberOf" | "includedIn" | "excludedFrom";

export interface ContainmentPremise {
    kind: "containment";
    id: string;
    relation: ContainmentRelation;
    subject: EntityId;
    classId: EntityId;
    contextId?: ContextId;
}

export interface ConditionalPremise {
    kind: "conditional";
    id: string;
    bindingId: BindingId;
    contextId?: ContextId;
    if: AtomicPremise;
    then: AtomicPremise;
    /** Explicit, monotonic exception: the rule does not apply to these IDs. */
    exceptEntityIds: EntityId[];
}

export type IntervalRelation =
    | "before"
    | "after"
    | "overlaps"
    | "during"
    | "starts"
    | "finishes"
    | "equals";

export interface IntervalPremise {
    kind: "interval";
    id: string;
    relation: IntervalRelation;
    left: EntityId;
    right: EntityId;
}

export interface RationalValue {
    numerator: number;
    denominator: number;
}

export type RationalRelation = "ratioEqual" | "ratioLess" | "ratioGreater" | "scaledBy";

export interface RationalPremise {
    kind: "rational";
    id: string;
    relation: RationalRelation;
    left: RationalValue;
    right: RationalValue;
    result?: RationalValue;
    units: string;
}

export interface GraphEdgePremise {
    kind: "graphEdge";
    id: string;
    graphId: "source" | "target";
    from: EntityId;
    to: EntityId;
    relationLabel: string;
}

export interface MappingPairPremise {
    kind: "mappingPair";
    id: string;
    source: EntityId;
    target: EntityId;
}

export type TransformOperator =
    | "rotate90"
    | "rotate180"
    | "rotate270"
    | "reflectHorizontal"
    | "reflectVertical";

export interface TransformationPremise {
    kind: "transformation";
    id: string;
    operator: TransformOperator;
    inputState: EntityId;
    outputState: EntityId;
    order: number;
}

export type ScopeRelation = "reads" | "precedes" | "sees" | "signalsTo";

export interface ScopeFrameSpec {
    contextId: ContextId;
    relation: ScopeRelation;
    subjectClass: EntityId;
    objectClass: EntityId;
    subjectIds: EntityId[];
    objectIds: EntityId[];
}

export interface ScopedRelationPremise {
    kind: "scopedRelation";
    id: string;
    contextId: ContextId;
    subjectBindingId: BindingId;
    objectBindingId: BindingId;
    /** Outer-to-inner order; binding IDs make capture impossible during renaming. */
    quantifierOrder: [BindingId, BindingId];
    subjectQuantifier: "every" | "some";
    objectQuantifier: "every" | "some";
    subjectClass: EntityId;
    objectClass: EntityId;
    relation: ScopeRelation;
    nestingDepth: number;
}

export interface BooleanConstraintPremise {
    kind: "booleanConstraint";
    id: string;
    operator: "exactlyOne" | "atLeastOne" | "notBoth" | "equivalent";
    propositionIds: [string, string];
}

export interface PropositionValuePremise {
    kind: "propositionValue";
    id: string;
    propositionId: string;
    value: boolean;
}

export interface BridgePremise {
    kind: "bridge";
    id: string;
    bridgeType:
        | "membershipSelectsOrder"
        | "temporalSelectsTransformation"
        | "mappingSelectsQuantity";
    fromEntity: EntityId;
    toEntity: EntityId;
    componentFamilies: [ReasoningFamily, ReasoningFamily];
}

export type AtomicPremise =
    | CategoricalPremise
    | OrderPremise
    | ContainmentPremise
    | IntervalPremise
    | RationalPremise
    | GraphEdgePremise
    | MappingPairPremise
    | TransformationPremise
    | ScopedRelationPremise
    | PropositionValuePremise
    | BridgePremise;

export type PremiseNode = AtomicPremise | ConditionalPremise | BooleanConstraintPremise;

export type AtomicQuery =
    | { kind: "categorical"; quantifier: CategoricalQuantifier; subject: EntityId; predicate: EntityId }
    | { kind: "order"; relation: OrderRelation; args: EntityId[]; displacement?: number }
    | { kind: "containment"; relation: ContainmentRelation; subject: EntityId; classId: EntityId; contextId?: ContextId }
    | { kind: "interval"; relation: IntervalRelation; left: EntityId; right: EntityId }
    | { kind: "rational"; relation: RationalRelation; left: RationalValue; right: RationalValue; result?: RationalValue; units: string }
    | { kind: "proposition"; propositionId: string }
    | { kind: "scopedRelation"; contextId: ContextId; subjectBindingId: BindingId; objectBindingId: BindingId; quantifierOrder: [BindingId, BindingId]; subjectQuantifier: "every" | "some"; objectQuantifier: "every" | "some"; subjectClass: EntityId; objectClass: EntityId; relation: ScopeRelation; nestingDepth: number }
    | { kind: "transformationResult"; initialPoint: [number, number]; operators: TransformOperator[]; expectedPoint: [number, number] }
    | { kind: "graphIsomorphism"; mappingContract: "bijection" | "injectiveHomomorphism" | "homomorphism" }
    | { kind: "mappingValidity"; pairs: Array<{ source: EntityId; target: EntityId }>; mappingContract: "bijection" | "injectiveHomomorphism" | "homomorphism" };

export type QueryNode =
    | AtomicQuery
    | { kind: "logicalNot"; operand: AtomicQuery }
    | { kind: "boolean"; operator: "and" | "or" | "exactlyOne"; operands: [AtomicQuery, AtomicQuery] };

export type InferenceClassification = "entailed" | "refuted" | "underdetermined";

export type ResponseFormat =
    | "threeWayInference"
    | "constructSatisfyingModel"
    | "constructCounterexample"
    | "completeMapping"
    | "identifyMissingRelation"
    | "repairProof"
    | "identifyNecessaryPremise"
    | "updateAfterPremiseChange";

export type ResponseSpec =
    | { kind: "threeWayInference"; choices: InferenceClassification[] }
    | { kind: "constructSatisfyingModel"; editableEntityIds: EntityId[] }
    | { kind: "constructCounterexample"; editableEntityIds: EntityId[] }
    | { kind: "completeMapping"; sourceIds: EntityId[]; targetIds: EntityId[]; contract: "bijection" | "injectiveHomomorphism" | "homomorphism" }
    | { kind: "identifyMissingRelation"; choices: string[]; expectedRelation: string }
    | { kind: "repairProof"; candidatePremiseIds: string[] }
    | { kind: "identifyNecessaryPremise"; candidatePremiseIds: string[] }
    | { kind: "updateAfterPremiseChange"; changePremiseId: string; choices: InferenceClassification[] };

export type ReasoningFamily =
    | "categorical"
    | "order"
    | "hierarchy"
    | "analogy"
    | "coupledFrames"
    | "proportional"
    | "temporalIntervals"
    | "contextScope"
    | "graphStructure"
    | "transformations";

export interface ComplexityTarget {
    level: 1 | 2 | 3 | 4 | 5;
    primaryDimension:
        | "supportSize"
        | "branching"
        | "scopeDepth"
        | "bindingInterference"
        | "liveFrontier"
        | "transformComposition"
        | "crossFrameBridges";
    displayedPremises: { min: number; max: number };
    responseFormat: ResponseFormat;
    memoryVisibility: "visible" | "sequential" | "memoryLoaded";
    distractorCount: number;
    timePressure: "none" | "measured" | "limited";
    /** Optional intrinsic bounds; unavailable metrics cannot satisfy a bound. */
    metricBounds?: Partial<Record<ComplexityTarget["primaryDimension"], { min: number; max: number }>>;
}

export type MetricStatus = "exact" | "approximate" | "unavailable";

export interface ComplexityCertificate {
    displayedPremises: number;
    atomicConstraints: number;
    embeddedClauses: number;
    entityCount: number;
    maxRelationArity: number;
    relationalOrder: number;
    minimalSupportSize: number | null;
    distinctMinimalSupports: number | null;
    supportStatus: MetricStatus;
    shortestProofDepth: number | null;
    proofDepthStatus: MetricStatus;
    branchingCount: number;
    reconvergentJoinCount: number;
    maxScopeNesting: number;
    bindingInterference: number;
    roleOverlap: number;
    estimatedLiveFrontier: number | null;
    liveFrontierStatus: MetricStatus;
    strategyLanguage: string;
    admissibleModelCount: number | null;
    modelCountStatus: MetricStatus;
    modelCountDomainNote: string;
    transformationComposition: number;
    noncommutative: boolean;
    crossFrameBridgeCount: number;
    everyMinimalSupportRequiresBridge: boolean | null;
    bridgeNecessityStatus: MetricStatus;
    format: ResponseFormat;
    memoryVisibility: "visible" | "sequential" | "memoryLoaded";
    distractorCount: number;
    timePressure: "none" | "measured" | "limited";
    novelty: "new" | "review" | "transfer";
    priorExposureCount: number;
}

export interface CategoricalWorld {
    kind: "categoricalWorld";
    /** Each entry is one nonempty admissible membership atom/witness. */
    witnesses: Array<{ id: string; classes: EntityId[] }>;
}

export interface PositionWorld {
    kind: "positionWorld";
    positions: Array<{ entityId: EntityId; value: number }>;
}

export interface IntervalWorld {
    kind: "intervalWorld";
    intervals: Array<{ entityId: EntityId; start: number; end: number }>;
}

export interface PropositionWorld {
    kind: "propositionWorld";
    values: Array<{ propositionId: string; value: boolean }>;
}

export interface MappingWorld {
    kind: "mappingWorld";
    pairs: Array<{ source: EntityId; target: EntityId }>;
}

export interface TransformWorld {
    kind: "transformWorld";
    initialPoint: [number, number];
    finalPoint: [number, number];
}

export interface ScopeWorld {
    kind: "scopeWorld";
    contextId: ContextId;
    people: EntityId[];
    objects: EntityId[];
    relationPairs: Array<[EntityId, EntityId]>;
}

export interface ScopeRelationFrameWorld {
    contextId: ContextId;
    relation: ScopeRelation;
    subjectClass: EntityId;
    objectClass: EntityId;
    subjectIds: EntityId[];
    objectIds: EntityId[];
    relationPairs: Array<[EntityId, EntityId]>;
}

export interface ContextScopeWorld {
    kind: "contextScopeWorld";
    frames: ScopeRelationFrameWorld[];
}

export type ScopeSemanticWorld = ScopeWorld | ContextScopeWorld;

export interface MembershipWorld {
    kind: "membershipWorld";
    memberships: Array<{ objectId: EntityId; classId: EntityId }>;
}

/** Public, reproducible parameters of a shared-world coupled inference. */
export type CoupledFrameSpec =
    | {
        kind: "membershipOrder";
        componentFamilies: ["hierarchy", "order"];
        objectIds: EntityId[];
        classId: EntityId;
        focusTargetId: EntityId;
        positionDomain: Extract<DomainSpec, { kind: "boundedPositions" }>;
        queryPropositionId: string;
    }
    | {
        kind: "temporalSpatial";
        componentFamilies: ["temporalIntervals", "transformations"];
        intervalIds: EntityId[];
        intervalDomain: Extract<DomainSpec, { kind: "boundedIntervals" }>;
        transformDomain: Extract<DomainSpec, { kind: "boundedTransformations" }>;
        initialPoint: [number, number];
        expectedPoint: [number, number];
        recipeOperators: TransformOperator[];
        activationPremiseId: string;
        recipePremiseId: string;
        queryPropositionId: string;
    }
    | {
        kind: "mappingQuantity";
        componentFamilies: ["analogy", "proportional"];
        sourceIds: EntityId[];
        targetIds: EntityId[];
        selectedSourceRoleId: EntityId;
        threshold: RationalValue;
        quantityCandidates: RationalValue[];
        quantityFacts: Array<{ premiseId: string; targetId: EntityId }>;
        quantityEntities: Array<{ entityId: EntityId; targetId: EntityId }>;
        queryPropositionId: string;
    };

export interface MembershipOrderWorld {
    kind: "membershipOrderWorld";
    memberObjectIds: EntityId[];
    positions: Array<{ entityId: EntityId; value: number }>;
    focusObjectId: EntityId;
}

export interface TemporalSpatialWorld {
    kind: "temporalSpatialWorld";
    intervals: Array<{ entityId: EntityId; start: number; end: number }>;
    recipeOperator: TransformOperator;
    outputPoint: [number, number];
}

export interface MappingQuantityWorld {
    kind: "mappingQuantityWorld";
    mapping: Array<{ source: EntityId; target: EntityId }>;
    quantities: Array<{ targetId: EntityId; value: RationalValue }>;
    selectedTargetId: EntityId;
}

export type CoupledFrameWorld = MembershipOrderWorld | TemporalSpatialWorld | MappingQuantityWorld;

export type SemanticWorld =
    | CategoricalWorld
    | PositionWorld
    | IntervalWorld
    | PropositionWorld
    | MappingWorld
    | TransformWorld
    | ScopeWorld
    | ContextScopeWorld
    | MembershipWorld
    | CoupledFrameWorld;

export interface VerifiedSupport {
    premiseIds: string[];
    minimal: boolean;
    status: MetricStatus;
}

export interface SemanticCertificate {
    premisesSatisfiable: boolean;
    classification?: InferenceClassification;
    solverCompleteness: "completeForDeclaredFragment" | "boundedComplete" | "incomplete";
    finiteDomainAssumptions: string[];
    queryWitness?: SemanticWorld;
    negatedQueryWitness?: SemanticWorld;
    supports: VerifiedSupport[];
    necessaryPremiseIds: string[];
    contrastiveRelevantPremiseIds: string[];
    verification: {
        premisesChecked: boolean;
        witnessesChecked: boolean;
        supportsChecked: MetricStatus;
        independentOracleChecked: boolean | null;
    };
}

export interface PresentationSpec {
    locale: "ru";
    premiseOrder: string[];
    labelVariant: number;
    stableAnswerOrder: InferenceClassification[];
    negationCue: "textAndSymbol";
    scaffolds: Array<"roleLabels" | "partialGraph" | "workedFirstStep" | "workspace">;
    /** Necessary domain and role conventions, displayed before solving. */
    instructionsRu?: string[];
}

export interface GenerationProvenance {
    semanticSeed: string;
    presentationSeed: string;
    schedulerSeed: string;
    attempt: number;
    maxAttempts: number;
    elapsedMs: number;
    wallTimeBudgetMs: number;
    requestedTarget: ComplexityTarget;
    appliedTarget: ComplexityTarget;
    adjustmentExplanationRu?: string;
    generatedAt: number;
}

export interface ReasoningItem {
    id: string;
    schemaVersion: number;
    generatorVersion: string;
    semanticsVersion: string;
    solverVersion: string;
    seed: string;
    family: ReasoningFamily;
    componentFamilies: ReasoningFamily[];
    structureFamily: string;
    grammarPartition: "training" | "development" | "assessment";
    domain: DomainSpec;
    entities: EntitySpec[];
    premises: PremiseNode[];
    query: QueryNode;
    responseSpec: ResponseSpec;
    targetComplexity: ComplexityTarget;
    measuredComplexity: ComplexityCertificate;
    semanticCertificate: SemanticCertificate;
    structuralFingerprint: string;
    presentation: PresentationSpec;
    provenance: GenerationProvenance;
    coupledFrameSpec?: CoupledFrameSpec;
}

export type GenerationFailureCode =
    | "cancelled"
    | "timeout"
    | "attemptBudgetExceeded"
    | "unsatisfiablePremises"
    | "targetMismatch"
    | "shortcutRisk"
    | "unsupportedTarget"
    | "internalValidationError";

export type GenerationResult =
    | { ok: true; item: ReasoningItem }
    | {
        ok: false;
        code: GenerationFailureCode;
        messageRu: string;
        attempts: number;
        elapsedMs: number;
        recoverable: boolean;
    };

export interface GenerationRequest {
    requestId: string;
    seed: string;
    family: ReasoningFamily;
    partition: "training" | "development" | "assessment";
    target: ComplexityTarget;
    semanticsVersion: string;
    maxAttempts: number;
    wallTimeBudgetMs: number;
}
