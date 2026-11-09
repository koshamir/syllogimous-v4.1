// Core v5 engine types (spec §4.1). Pure data: no Angular, DOM or storage.

export type EngineVersion = 'v5.0';
export const ENGINE_VERSION: EngineVersion = 'v5.0';

export type FamilyId =
    | 'groups' | 'orderNum' | 'orderTime' | 'syllogism' | 'linear' | 'circular'
    | 'dir2d' | 'dir3dSpace' | 'dir3dTime' | 'graph' | 'analogy' | 'binary'
    | 'groups3' | 'conditional' | 'hierarchy' | 'perspective';        // last 4 — phase 5

/** «Следует» / «Противоречит» / «Неизвестно» */
export type Answer = 'entailed' | 'contradicted' | 'undetermined';
export type AnswerFormat = 'ternary' | 'binary' | 'choice';
export type LureType = 'none' | 'reversal' | 'possible' | 'nearMiss' | 'surface';

/** Strategy card number from Appendix A (1–7). */
export type StrategyTipId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ParamValue = number | string | boolean;

export interface Entity { id: string; name: string }                // id: 'e0'…'e9'
export interface Premise { kind: string; args: string[]; params?: Record<string, ParamValue>; inverted?: boolean }
export interface Query { kind: string; args: string[]; params?: Record<string, ParamValue> }

export interface ItemMetrics {
    entities: number;
    premises: number;
    /** σ — size of the minimal support; null for 'undetermined'. */
    support: number | null;
    /** Indices of support premises (canonical order). */
    supportIdx: number[];
    /** Number of entities in support ∪ conclusion. */
    width: number;
    /** Max arity of support premises (2, 3, 4). */
    arityMax: number;
    /** Support is not a simple chain between the conclusion entities. */
    convergent: boolean;
    /** Conclusion does not follow from premises touching the conclusion entities. */
    nonLocal: boolean;
    /** log2 of the number of models of all premises (capped). */
    modelsLog2: number;
    distractors: number;
    attachedDistractors: number;
    negations: number;
    metas: number;
    /** 0..1 */
    discontinuity: number;
    /** Which constraints were relaxed during generation. */
    relaxations: string[];
}

export interface Explanation {
    /** Which displayed premises to highlight. */
    supportDisplayIdx: number[];
    /** RU: a model where the answer is evident. */
    model?: string;
    /** RU: a second model (for 'undetermined' — where the conclusion differs). */
    altModel?: string;
    /** RU: one line about the lure. */
    lureNote?: string;
    tipId?: StrategyTipId;
}

export interface ItemRender {
    instructions: string[];
    notes: string[];
    premises: string[];
    conclusion: string | string[];
}

export interface Item {
    engineVersion: EngineVersion;
    family: FamilyId;
    level: number;
    seed: string;
    entities: Entity[];
    premises: Premise[];
    query: Query;
    answer: Answer;
    format: AnswerFormat;
    options?: { id: string; label: string }[];
    correctOptionId?: string;              // for 'choice'
    lure: LureType;
    metrics: ItemMetrics;
    /** Permutation of premises for display. */
    displayOrder: number[];
    /** HTML. */
    render: ItemRender;
    explanation: Explanation;
    fingerprint: string;
    /** Extension: the jittered level and σ range the item was generated for (tests, statistics). */
    target?: { level: number; sigmaMin: number; sigmaMax: number };
    /** Extension («Логические связки»): the two statements. */
    parts?: ItemPart[];
    /** Extension («Сравнение графов»): subtype. */
    subtype?: 'iso' | 'map';
}

/** Item before finalize(): no render, explanation or fingerprint yet. */
export type DraftItem = Omit<Item, 'render' | 'explanation' | 'fingerprint' | 'target' | 'parts' | 'subtype'>;

export type PremiseOrderMode = 'random' | 'discontinuous' | 'adversarial';
export type NamePool = 'cyrillic' | 'latin' | 'words' | 'emoji';
export type NameMode = 'byLevel' | 'distinct';

/** Output of the ladder (§4.6) after family clamps. */
export interface LevelParams {
    /** Jittered level L' actually used. */
    level: number;
    n: number;
    sigmaMin: number;
    sigmaMax: number;
    requireNonLocal: boolean;
    pTernary: number;
    pConvergent: number;
    /** Drawn per item from pConvergent. */
    requireConvergent: boolean;
    /**
     * Family extension: build the convergent structure even when the check is waived for this answer class
     * (keeps the structure class-independent). Defaults to requireConvergent.
     */
    convergentStructure?: boolean;
    distractors: number;
    lureMix: LureType[];
    order: PremiseOrderMode;
    negationRate: number;
    metaRate: number;
    confusableNames: number;
    carryOverNames: number;
}

/** Generation plan chosen by the scheduler (§4.8). */
export interface Plan {
    target: Answer;
    /** Desired bot opinions and other stratification keys, drawn independently of the target. */
    cue: Record<string, string>;
    lure: LureType;
}

/** A heuristic strategy that sees only the rendered item (never `answer`). null = abstained (counted as a guess). */
export interface Bot {
    id: string;
    predict(d: DraftItem): Answer | string | null;
    /** false = models a reasoning error but integrates all premises (like oneModel): reported, not gated. */
    gated?: boolean;
}

export interface EngineOptions {
    /** Red "inverted" words enabled. */
    negations: boolean;
    /** Meta-relations enabled. */
    metas: boolean;
    namePool: NamePool;
    nameMode: NameMode;
    /** Enabled families (analogy bases, parts of «Логические связки»). Undefined = all ported families. */
    families?: FamilyId[];
    /** Enabled connectives for «Логические связки». Undefined = all. */
    binaryOps?: BinaryOp[];
}

export type BinaryOp = 'and' | 'nand' | 'or' | 'nor' | 'xor' | 'xnor';
export const BINARY_OPS: BinaryOp[] = ['and', 'nand', 'or', 'nor', 'xor', 'xnor'];

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
    negations: true,
    metas: true,
    namePool: 'cyrillic',
    nameMode: 'byLevel',
};

export interface GenerateSpec {
    family: FamilyId;
    level: number;
    seed: string;
    format: AnswerFormat;
    plan: Plan;
    prevNames?: string[];
    /** Names that must not be used (the other part of a «Логические связки» item). */
    excludeNames?: string[];
    options?: Partial<EngineOptions>;
}

/** One statement of a composite «Логические связки» item. */
export interface ItemPart {
    family: FamilyId;
    /** Indices of this part's premises in Item.premises. */
    premiseIdx: number[];
    query: Query;
    answer: Answer;
    /** Entity index offset of this part (its entities are e{offset}…). */
    offset: number;
    n: number;
    level: number;
    seed: string;
}
