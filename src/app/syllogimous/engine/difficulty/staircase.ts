// Weighted staircase (spec §6.3, I7): after a correct answer L += s, after an error or timeout L −= s·p/(1−p).
// The equilibrium accuracy is p. Pure functions over serializable state (stored by the Angular layer).

import { AnswerFormat } from '../core/types';

export type Outcome = 'ok' | 'err' | 'timeout';

export interface FamilyLevel {
    /** Real level 1…20. */
    level: number;
    /** Items answered in this family (regular game). */
    count: number;
    last20: Outcome[];
    /** Integer level at the last notification (toast when it moves by ≥ 2). */
    notified?: number;
}

export const STAIRCASE = {
    min: 1,
    max: 20,
    /** First items of a family use the large step. */
    warmupItems: 15,
    warmupStep: 1.0,
    defaultStep: 0.5,
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

export const newFamilyLevel = (level = 1): FamilyLevel => ({ level, count: 0, last20: [], notified: Math.floor(level) });

export function updateLevel(s: FamilyLevel, outcome: Outcome, p: number, step = STAIRCASE.defaultStep): FamilyLevel {
    const st = s.count < STAIRCASE.warmupItems ? STAIRCASE.warmupStep : step;
    const L = outcome === 'ok' ? s.level + st : s.level - (st * p) / (1 - p);
    return { ...s, level: clamp(L, STAIRCASE.min, STAIRCASE.max), count: s.count + 1, last20: [...s.last20, outcome].slice(-20) };
}

/** Toast only when the integer part moved by 2 or more since the last notification. */
export function levelNotice(s: FamilyLevel): { notify: boolean; from: number; to: number } {
    const from = s.notified ?? 1;
    const to = Math.floor(s.level);
    return { notify: Math.abs(to - from) >= 2, from, to };
}

/** Migration (§6.3): a family's initial level = clamp(premises − 1, 1, 10) from the old training unit, otherwise 1. */
export function migratedLevel(premises?: number | null): number {
    return premises ? clamp(premises - 1, 1, 10) : 1;
}

/**
 * Adaptive timer (§6.4): T = clamp(median RT × (1 + 0.15·(σ − σ̄)) + 2·negations, 15, 180) seconds.
 * `rts` — response times (s) of the last items of the family at level ±2; `sigmas` — their σ (null = "Unknown").
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
