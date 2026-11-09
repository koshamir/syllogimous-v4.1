// Scheduler inside the engine (spec §4.8): pure functions over serializable state.
// Target answers, desired bot opinions (cue) and lures come from INDEPENDENT shuffled bags, which is what
// makes every bot's opinion uninformative about the answer (§2.4).

import { Rng } from '../core/rng';
import { Answer, AnswerFormat, FamilyId, LevelParams, LureType, Plan } from '../core/types';

export interface Bag { sig: string; items: string[] }

export interface FamilySchedState {
    answers: Bag;
    cues: Record<string, Bag>;
    lures: Partial<Record<Answer, Bag>>;
}

export interface SchedulerState {
    families: Partial<Record<FamilyId, FamilySchedState>>;
    /** Last items' families, most recent last (max 2). */
    history: FamilyId[];
    /** Fingerprint window (max FINGERPRINT_WINDOW). */
    fingerprints: string[];
    /** «Сравнение графов»: iso / map alternation counter. */
    graphToggle?: number;
}

export const FINGERPRINT_WINDOW = 50;

export const emptySchedulerState = (): SchedulerState => ({ families: {}, history: [], fingerprints: [] });

function draw(bag: Bag | undefined, sig: string, refill: () => string[], rng: Rng): { bag: Bag; value: string } {
    let b = bag && bag.sig === sig && bag.items.length ? bag : { sig, items: rng.shuffle(refill()) };
    if (!b.items.length) b = { sig, items: rng.shuffle(refill()) };
    const items = b.items.slice();
    const value = items.pop()!;
    return { bag: { sig, items }, value };
}

export function answerBagContents(format: AnswerFormat): Answer[] {
    if (format === 'binary') return [...Array(6)].flatMap(() => ['entailed', 'contradicted'] as Answer[]);
    if (format === 'choice') return [...Array(3)].flatMap(() => ['entailed', 'entailed', 'entailed', 'undetermined'] as Answer[]);
    return [...Array(4)].flatMap(() => ['entailed', 'contradicted', 'undetermined'] as Answer[]);
}

/**
 * Lure bags per class with an EQUAL share of `surface` (otherwise co-occurrence becomes a cue) and a 50/50
 * split of possible/none among the remaining "Unknown" items (so the one-model bot says "Follows" on ~half).
 */
export function lureBagContents(answer: Answer, allowed: readonly LureType[]): LureType[] {
    const has = (l: LureType) => allowed.includes(l);
    const surf: LureType[] = has('surface') ? ['surface', 'surface'] : [];
    const rest = 8 - surf.length;
    const fill = (pattern: LureType[]): LureType[] => Array.from({ length: rest }, (_, i) => pattern[i % pattern.length]);
    if (answer === 'entailed') return [...surf, ...fill(['none'])];
    if (answer === 'undetermined') return [...surf, ...fill(has('possible') ? ['none', 'possible'] : ['none'])];
    const c: LureType[] = ['none'];
    if (has('reversal')) c.push('reversal');
    if (has('nearMiss')) c.push('nearMiss');
    return [...surf, ...fill(c)];
}

export interface PlanRequest {
    family: FamilyId;
    format: AnswerFormat;
    /** cueSpace of the family at these params. */
    cueSpace: Record<string, string[]>;
    /** Lures the family supports at these params. */
    lures: LureType[];
    params: LevelParams;
}

/** Next plan for a family; returns the new state (input is not mutated). */
export function nextPlan(state: SchedulerState, req: PlanRequest, rng: Rng): { state: SchedulerState; plan: Plan } {
    const fs: FamilySchedState = state.families[req.family] ?? { answers: { sig: '', items: [] }, cues: {}, lures: {} };
    const a = draw(fs.answers, req.format, () => answerBagContents(req.format), rng);
    const target = a.value as Answer;
    const cues: Record<string, Bag> = { ...fs.cues };
    const cue: Record<string, string> = {};
    for (const [key, values] of Object.entries(req.cueSpace)) {
        const sig = `${req.format}:${values.join('|')}`;
        const d = draw(cues[key], sig, () => [...values, ...values], rng);
        cues[key] = d.bag;
        cue[key] = d.value;
    }
    if (req.format === 'choice') {
        cue['degU'] = rng.float().toFixed(6);
        cue['fmU'] = rng.float().toFixed(6);
    }
    const lures = { ...fs.lures };
    const lsig = `${req.format}:${req.lures.join('|')}`;
    const l = draw(lures[target], lsig, () => lureBagContents(target, req.lures), rng);
    lures[target] = l.bag;
    const families = { ...state.families, [req.family]: { answers: a.bag, cues, lures } };
    return { state: { ...state, families }, plan: { target, cue, lure: l.value as LureType } };
}

/**
 * Family weights (spec §4.8): w_f = 1 + 0.5·(L_max − L_f)/max(1, L_max − L_min);
 * 0 for the previous item's family (if ≥ 2 enabled), ×0.5 if it was two items back.
 */
export function familyWeights(levels: Partial<Record<FamilyId, number>>, enabled: readonly FamilyId[], history: readonly FamilyId[]): Map<FamilyId, number> {
    const Ls = enabled.map(f => levels[f] ?? 1);
    const lMax = Math.max(...Ls);
    const lMin = Math.min(...Ls);
    const w = new Map<FamilyId, number>();
    for (const f of enabled) {
        let x = 1 + (0.5 * (lMax - (levels[f] ?? 1))) / Math.max(1, lMax - lMin);
        if (enabled.length >= 2 && history[history.length - 1] === f) x = 0;
        else if (enabled.length >= 3 && history[history.length - 2] === f) x *= 0.5;
        w.set(f, x);
    }
    return w;
}

export function pickFamily(levels: Partial<Record<FamilyId, number>>, enabled: readonly FamilyId[], history: readonly FamilyId[], rng: Rng): FamilyId {
    const w = familyWeights(levels, enabled, history);
    const total = [...w.values()].reduce((s, x) => s + x, 0);
    let u = rng.float() * total;
    for (const [f, x] of w) {
        if ((u -= x) < 0) return f;
    }
    return enabled[enabled.length - 1];
}

export function pushHistory(state: SchedulerState, family: FamilyId, fp: string): SchedulerState {
    return {
        ...state,
        history: [...state.history, family].slice(-2),
        fingerprints: [...state.fingerprints, fp].slice(-FINGERPRINT_WINDOW),
    };
}

export const seenFingerprint = (state: SchedulerState, fp: string) => state.fingerprints.includes(fp);
