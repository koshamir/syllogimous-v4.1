// Family plugin contract (spec §4.2, adapted — see docs/V5_NOTES.md «Отступления»).

import { Csp, Vals } from '../core/combinatorics';
import { Rng } from '../core/rng';
import {
    Answer, AnswerFormat, Bot, DraftItem, EngineOptions, FamilyId, ItemRender, LevelParams,
    LureType, ParamValue, Plan, Premise, Query,
} from '../core/types';

export interface Rel { kind: string; args: string[]; params?: Record<string, ParamValue> }

export interface DomainSpec { size: number; allDiff: boolean; fixFirst?: boolean }

/**
 * Families whose worlds are not small finite assignments (directions: unbounded integer coordinates;
 * syllogisms: sets) provide their own exact solver. The generic functions in core/solve.ts dispatch to it.
 */
export interface CustomSolver {
    /** Exact classification. `full` = whole item; false = premise subset (family's restricted-domain rule). Throws if inconsistent. */
    classify(premises: readonly Rel[], q: Rel, n: number, full: boolean): Answer;
    consistent(premises: readonly Rel[], n: number): boolean;
    /** A model of premises + extra constraints in the family's value layout, or null. */
    model(premises: readonly Rel[], extra: readonly { rel: Rel; negate?: boolean }[], n: number, rng?: Rng): Vals | null;
    /** log2 of the number of models, or a documented proxy for infinite / huge model spaces. */
    log2Models(premises: readonly Rel[], n: number): number;
}

/** What the generic solvers (classify, models, support) need from a family. */
export interface SolverPlugin {
    supportDomain: 'restricted' | 'full';
    custom?: CustomSolver;
    /**
     * Packed worlds (n people on n places): entities of other premise components still occupy places, so a
     * minimal support may be disconnected — the support search must not restrict itself to the query component.
     */
    packed?: boolean;
    /** The world has a fixed size: entities that no premise mentions still exist (no renumbering). */
    fixedWorld?: boolean;
    /** Premises of this family are not queryable relations: skip the "follows from the others" check. */
    skipRedundancyCheck?: boolean;
    /** Domain for a constraint set over `nLocal` entities of an item with `nFull` entities. */
    domain(rels: readonly Rel[], nLocal: number, nFull: number, full: boolean): DomainSpec;
    /** Test of one relation; `vars[i]` is the local variable of `rel.args[i]`; `size` — domain size. */
    compile(rel: Rel, vars: number[], size: number): (v: Vals) => boolean;
}

/** Everything a family hands to the pipeline after construction. */
export interface Construction<W> {
    world: W;
    premises: Premise[];
    /** Candidate conclusions, intended first. */
    queries: Query[];
    /** Entities in the item (ids e0…e{n-1}). */
    n: number;
}

export interface LureContext {
    premises: Premise[];
    query: Query;
    answer: Answer;
    n: number;
}

/** Choice-format item spec produced by a family that supports `choice`. */
export interface ChoiceConstruction {
    premises: Premise[];
    n: number;
    /** Query with kind 'rankAt'. */
    query: Query;
    answer: Answer;           // 'entailed' (unique entity) or 'undetermined'
    correctOptionId: string;  // entity id or 'none'
}

export interface FamilyPlugin<W = unknown> extends SolverPlugin {
    id: FamilyId;
    formats: AnswerFormat[];
    limits: { minEntities: number; maxEntities: number };
    /** Family clamps of the ladder output (§4.6: "each family clamps them by its limits and allowed values"). */
    adjust(p: LevelParams, o: EngineOptions, plan: Plan): LevelParams;
    /** Stratification keys and their values (drawn independently of the target). */
    cueSpace(p: LevelParams, format: AnswerFormat, o?: Partial<EngineOptions>): Record<string, string[]>;
    /** Lure labels that follow from the construction and are not matched against the plan (see syllogism). */
    uncontrolledLures?: LureType[];
    /** Lures this family can realise at these params (subset of lureMix). */
    supportedLures(p: LevelParams, o: EngineOptions): LureType[];
    /** Builds premises constructively for `plan` (world + premises + intended queries). null = attempt failed. */
    construct(rng: Rng, p: LevelParams, plan: Plan, o: EngineOptions): Construction<W> | null;
    /** Choice format («Кто k-й…?»), optional. */
    constructChoice?(rng: Rng, p: LevelParams, plan: Plan, o: EngineOptions): ChoiceConstruction | null;
    statedDirectly(q: Query, premises: readonly Premise[]): boolean;
    lureOf(ctx: LureContext): LureType;
    /** "First model that comes to mind": values per entity index. */
    preferredModel(premises: readonly Premise[], n: number): Vals;
    /** Does the cue profile hold for this candidate (bots' opinions etc.)? */
    cueMatches(cue: Record<string, string>, premises: readonly Premise[], q: Query, n: number): boolean;
    /** Compact Russian model description (values per entity index). */
    describe(vals: Vals, names: readonly string[], query?: Query): string;
    /** Russian HTML. `rng` — presentation stream. */
    render(d: DraftItem, rng: Rng): ItemRender;
    /** Chooses wording variants / inversions on premises and query (presentation). */
    decorate(d: DraftItem, rng: Rng, p: LevelParams): void;
    /** Relations that may carry a red inversion. */
    invertible(kind: string): boolean;
    bots: Bot[];
    features(d: DraftItem): Record<string, number>;
}

export type AnyPlugin = FamilyPlugin<unknown>;

export function idx(id: string): number {
    return +id.slice(1);
}

export function eid(i: number): string {
    return 'e' + i;
}

export type { Csp };
