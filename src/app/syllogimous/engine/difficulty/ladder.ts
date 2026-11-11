// Difficulty (v5.1): the level of an item IS its number of premises. Every premise is part of the reasoning
// (no distractors, no pendants), and everything else that loads relational integration is always on:
// ternary relations, convergent structures, mixed wording, scattered premise order, lures.

import { Rng } from '../core/rng';
import { EngineOptions, FamilyId, LevelParams } from '../core/types';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export const DIFFICULTY = {
    /** Premise counts supported by the engine overall; families narrow the range (PREMISE_RANGE). */
    min: 2,
    max: 8,
    /** Feature level passed to the families: everything a family can do is unlocked. */
    features: 12,
    pTernary: 0.4,
    pConvergent: 0.5,
    negationRate: 0.25,
    metaRate: 0.3,
};

/** Premise counts [min, max] each family can build with every premise necessary. */
export const PREMISE_RANGE: Record<FamilyId, [number, number]> = {
    groups: [2, 8],
    groups3: [2, 7],
    orderNum: [2, 8],
    orderTime: [2, 8],
    linear: [2, 7],
    circular: [2, 5],
    dir2d: [2, 6],
    dir3dSpace: [2, 6],
    dir3dTime: [2, 6],
    syllogism: [2, 6],
    conditional: [2, 6],
    hierarchy: [2, 5],
    perspective: [2, 6],
    analogy: [3, 8],
    // links per network (each network is stated with that many arrows)
    graph: [5, 8],
    binary: [4, 12],
};

export function clampPremises(family: FamilyId, level: number): number {
    const [lo, hi] = PREMISE_RANGE[family];
    return clamp(Math.floor(level), lo, hi);
}

/** Parameters for an item with exactly P premises. Families clamp them afterwards. */
export function ladderAt(P: number, rng: Rng, o: EngineOptions): LevelParams {
    const c = DIFFICULTY;
    return {
        level: c.features,
        premises: P,
        n: P + 1,
        sigmaMin: P,
        sigmaMax: P,
        requireNonLocal: false,
        pTernary: c.pTernary,
        pConvergent: c.pConvergent,
        requireConvergent: P >= 3 && rng.chance(c.pConvergent),
        distractors: 0,
        lureMix: ['none', 'reversal', 'possible', 'nearMiss'],
        order: 'discontinuous',
        negationRate: o.negations ? c.negationRate : 0,
        metaRate: o.metas ? c.metaRate : 0,
        confusableNames: 0,
        carryOverNames: 0,
    };
}

/** Parameters the scheduler uses to choose a plan (query kinds, lures). */
export function planningParams(level: number, o: EngineOptions): LevelParams {
    return ladderAt(clamp(Math.floor(level), c0.min, c0.max), new Rng('planning'), o);
}
const c0 = DIFFICULTY;

export function ladder(level: number, rng: Rng, o: EngineOptions): LevelParams {
    return ladderAt(clamp(Math.floor(level), c0.min, c0.max), rng, o);
}
