// Default difficulty ladder (spec §4.6). All numbers live in LADDER_CONFIG so they can be edited in one place.

import { Rng } from '../core/rng';
import { EngineOptions, LevelParams, LureType, PremiseOrderMode } from '../core/types';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export const LADDER_CONFIG = {
    levelMin: 1,
    levelMax: 20,
    /** L' = L + U(jitterLo, jitterHi) */
    jitterLo: -1,
    jitterHi: 0.5,
    n: (L: number) => 3 + Math.floor((L + 1) / 3),
    sigmaMin: (L: number) => (L < 3 ? 2 : L < 10 ? 3 : L < 15 ? 4 : 5),
    sigmaMaxExtra: (L: number) => (L < 3 ? 0 : 1),
    nonLocalFrom: 4,
    pTernary: (L: number) => clamp(0.05 * (L - 2), 0, 0.5),
    pConvergent: (L: number) => clamp(0.1 * (L - 1), 0, 0.8),
    distractors: (L: number) => (L < 3 ? 0 : L < 6 ? 1 : L < 10 ? 2 : 3),
    lureMix: (L: number): LureType[] => {
        const mix: LureType[] = ['none'];
        if (L >= 2) mix.push('reversal');
        if (L >= 3) mix.push('possible');
        if (L >= 5) mix.push('nearMiss');
        if (L >= 8) mix.push('surface');
        return mix;
    },
    /** [p(discontinuous), p(adversarial)] */
    order: (L: number): [number, number] => (L < 6 ? [0, 0] : L < 10 ? [0.5, 0] : [0.7, 0.3]),
    negationRate: (L: number) => (L < 7 ? 0 : Math.min(0.3, 0.05 * (L - 6))),
    metaRate: (L: number) => (L < 10 ? 0 : Math.min(0.3, 0.05 * (L - 9))),
    confusableNames: (L: number) => (L < 8 ? 0 : Math.min(0.5, 0.1 * (L - 7))),
    carryOverNames: (L: number) => (L < 10 ? 0 : Math.min(0.3, 0.1 * (L - 9))),
};

export function jitterLevel(level: number, rng: Rng): number {
    const c = LADDER_CONFIG;
    return clamp(level + c.jitterLo + rng.float() * (c.jitterHi - c.jitterLo), c.levelMin, c.levelMax);
}

/** Ladder parameters at the (already jittered) level L'. Families clamp them afterwards. */
export function ladderAt(L: number, rng: Rng, o: EngineOptions): LevelParams {
    const c = LADDER_CONFIG;
    const sigmaMin = c.sigmaMin(L);
    const pConvergent = c.pConvergent(L);
    const [pDisc, pAdv] = c.order(L);
    const u = rng.float();
    const order: PremiseOrderMode = u < pAdv ? 'adversarial' : u < pAdv + pDisc ? 'discontinuous' : 'random';
    return {
        level: L,
        n: c.n(L),
        sigmaMin,
        sigmaMax: sigmaMin + c.sigmaMaxExtra(L),
        requireNonLocal: L >= c.nonLocalFrom,
        pTernary: c.pTernary(L),
        pConvergent,
        requireConvergent: rng.chance(pConvergent),
        distractors: c.distractors(L),
        lureMix: c.lureMix(L),
        order,
        negationRate: o.negations ? c.negationRate(L) : 0,
        metaRate: o.metas ? c.metaRate(L) : 0,
        confusableNames: c.confusableNames(L),
        carryOverNames: c.carryOverNames(L),
    };
}

/**
 * Parameters the scheduler uses to choose a plan (query kinds, lures): the most conservative level of the
 * jitter range, so that every plan is feasible whatever jitter the generator draws.
 */
export function planningParams(level: number, o: EngineOptions): LevelParams {
    const c = LADDER_CONFIG;
    return ladderAt(clamp(level + c.jitterLo, c.levelMin, c.levelMax), new Rng('planning'), o);
}

/** Jitter + ladder in one call. */
export function ladder(level: number, rng: Rng, o: EngineOptions): LevelParams {
    return ladderAt(jitterLevel(level, rng), rng, o);
}
