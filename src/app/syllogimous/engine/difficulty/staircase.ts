// Weighted staircase over the NUMBER OF PREMISES (v5.1): after a correct answer L += s, after an error or
// timeout L −= s·p/(1−p); the item is built with ⌊L⌋ premises, the fraction is progress towards the next one.
// The equilibrium accuracy is p. Pure functions over serializable state (stored by the Angular layer).

import { AnswerFormat } from '../core/types';

export type Outcome = 'ok' | 'err' | 'timeout';

export interface FamilyLevel {
    /** Real level; ⌊level⌋ = premises of the next item. */
    level: number;
    /** Items answered in this family (regular game). */
    count: number;
    last20: Outcome[];
    /** Premise count at the last notification. */
    notified?: number;
}

export const STAIRCASE = {
    /** Default range (families pass their own). */
    min: 2,
    max: 8,
    /** First items of a family use the large step. */
    warmupItems: 8,
    warmupStep: 0.5,
    /** Four correct answers in a row add one premise; one error takes back three of those steps (p = 0.75). */
    defaultStep: 0.25,
    /** Target accuracy for three options. */
    defaultTarget: 0.75,
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** p for this format: three options — target; two — target + 0.05; choice among ≥ 4 — target − 0.05. */
export function targetFor(format: AnswerFormat, options: number, target = STAIRCASE.defaultTarget): number {
    if (format === 'binary' || options === 2) return Math.min(0.95, target + 0.05);
    if (format === 'choice' && options >= 4) return Math.max(0.5, target - 0.05);
    return target;
}

export const newFamilyLevel = (level: number = STAIRCASE.min): FamilyLevel => ({ level, count: 0, last20: [], notified: Math.floor(level) });

export function updateLevel(s: FamilyLevel, outcome: Outcome, p: number, step = STAIRCASE.defaultStep,
    range: readonly [number, number] = [STAIRCASE.min, STAIRCASE.max]): FamilyLevel {
    const st = s.count < STAIRCASE.warmupItems ? Math.max(step, STAIRCASE.warmupStep) : step;
    const L = outcome === 'ok' ? s.level + st : s.level - (st * p) / (1 - p);
    // the top of the range keeps its own fraction so that an error there does not drop a premise at once
    return { ...s, level: clamp(Math.round(L * 1000) / 1000, range[0], range[1] + 0.99), count: s.count + 1, last20: [...s.last20, outcome].slice(-20) };
}

/** Notice whenever the premise count changed since the last notification. */
export function levelNotice(s: FamilyLevel): { notify: boolean; from: number; to: number } {
    const to = Math.floor(s.level);
    const from = s.notified ?? to;
    return { notify: to !== from, from, to };
}

/**
 * Starting premise count of a family: from the old v4.1 training unit (its premise count) or from a v5.0 level
 * (1–2 → 2, 3–9 → 3, 10–14 → 4, 15+ → 5), clamped to the family's range; otherwise the minimum.
 */
export function initialPremises(range: readonly [number, number], oldV5Level?: number | null, oldPremises?: number | null): number {
    if (oldV5Level) return clamp(oldV5Level < 3 ? 2 : oldV5Level < 10 ? 3 : oldV5Level < 15 ? 4 : 5, range[0], range[1]);
    if (oldPremises) return clamp(Math.floor(oldPremises), range[0], range[1]);
    return range[0];
}

/**
 * Adaptive timer: T = clamp(median RT × (1 + 0.15·(σ − σ̄)) + 2·negations, 15, 180) seconds.
 * `rts` — response times (s) of the last items of the family with a close premise count; `sigmas` — their σ.
 */
export function adaptiveSeconds(rts: readonly number[], sigmas: readonly (number | null)[], sigma: number | null, negations: number, fallback = 90): number {
    if (rts.length < 3) return clamp(fallback + 2 * negations, 15, 180);
    const s = rts.slice().sort((a, b) => a - b);
    const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    const known = sigmas.filter((x): x is number => x !== null);
    const mean = known.length ? known.reduce((a, b) => a + b, 0) / known.length : sigma ?? 0;
    const k = sigma === null ? 1 : 1 + 0.15 * (sigma - mean);
    return Math.round(clamp(median * k + 2 * negations, 15, 180));
}
