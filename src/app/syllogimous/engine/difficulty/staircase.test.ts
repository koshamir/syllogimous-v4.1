// Phase 2 unit tests (spec §6, acceptance): staircase convergence, scheduler interleaving and weights, migration.

import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { FamilyId } from '../core/types';
import { STAIRCASE, adaptiveSeconds, initialPremises, levelNotice, newFamilyLevel, targetFor, updateLevel } from './staircase';
import { emptySchedulerState, familyWeights, pickFamily } from './scheduler';
import { nextItem } from '../session';

describe('staircase', () => {
    it('a simulated learner P(correct | L) = chance + (1 − chance)/(1 + e^(2(L − θ))) converges to 75 % ± 3 % within 300 items', () => {
        const rng = new Rng('learners');
        const chance = 1 / 3;
        const p = targetFor('ternary', 3);
        expect(p).toBe(0.75);
        let ok = 0;
        let n = 0;
        const learners = 400;
        for (let k = 0; k < learners; k++) {
            const theta = 3.5 + rng.float() * 3;          // the learner's limit, in premises
            let s = newFamilyLevel(2);
            for (let i = 0; i < 300; i++) {
                const pc = chance + (1 - chance) / (1 + Math.exp(2 * (s.level - theta)));
                const correct = rng.chance(pc);
                if (i >= 100) { n++; if (correct) ok++; }
                s = updateLevel(s, correct ? 'ok' : 'err', p, STAIRCASE.defaultStep, [2, 9]);
            }
        }
        expect(Math.abs(ok / n - 0.75)).toBeLessThanOrEqual(0.03);
    });

    it('steps, bounds and targets', () => {
        let s = newFamilyLevel(2);
        s = updateLevel(s, 'ok', 0.75);
        expect(s.level).toBe(2.5);                     // warm-up step 0.5
        for (let i = 0; i < 40; i++) s = updateLevel(s, 'ok', 0.75);
        expect(Math.floor(s.level)).toBe(STAIRCASE.max);   // clamped: the premise count never exceeds the range
        const before = s.level;
        s = updateLevel(s, 'timeout', 0.75, 0.5);
        expect(before - s.level).toBeCloseTo(1.5);     // s·p/(1−p)
        for (let i = 0; i < 40; i++) s = updateLevel(s, 'err', 0.75, 0.25, [3, 6]);
        expect(s.level).toBe(3);
        expect(s.last20.length).toBe(20);
        expect(targetFor('binary', 2)).toBeCloseTo(0.8);
        expect(targetFor('choice', 6)).toBeCloseTo(0.7);
        expect(targetFor('ternary', 3, 0.8)).toBeCloseTo(0.8);
    });

    it('a notice whenever the premise count changes', () => {
        const s = { ...newFamilyLevel(4), level: 4.9 };
        expect(levelNotice(s).notify).toBe(false);
        expect(levelNotice({ ...s, level: 5.1 })).toEqual({ notify: true, from: 4, to: 5 });
        expect(levelNotice({ ...s, level: 3.9 }).notify).toBe(true);
    });

    it('starting premise count: old v5.0 level, old v4.1 training unit, or the family minimum', () => {
        expect(initialPremises([2, 8])).toBe(2);
        expect(initialPremises([2, 8], null, 5)).toBe(5);
        expect(initialPremises([2, 5], null, 20)).toBe(5);
        expect(initialPremises([2, 8], 12)).toBe(4);
        expect(initialPremises([3, 8], 1)).toBe(3);
    });

    it('adaptive timer', () => {
        expect(adaptiveSeconds([], [], 3, 0)).toBe(90);
        expect(adaptiveSeconds([20, 30, 40], [3, 3, 3], 3, 0)).toBe(30);
        expect(adaptiveSeconds([20, 30, 40], [3, 3, 3], 5, 1)).toBe(Math.round(30 * 1.3 + 2));
        expect(adaptiveSeconds([1, 1, 1], [3, 3, 3], 3, 0)).toBe(15);
        expect(adaptiveSeconds([500, 500, 500], [3, 3, 3], 3, 0)).toBe(180);
    });
});

describe('scheduler (session)', () => {
    const FAMS: FamilyId[] = ['groups', 'orderNum', 'linear', 'syllogism'];

    it('never two items of the same family in a row; distribution follows the weights', () => {
        const levels: Partial<Record<FamilyId, number>> = { groups: 1, orderNum: 5, linear: 9, syllogism: 9 };
        const rng = new Rng('weights');
        const counts = new Map<FamilyId, number>();
        let history: FamilyId[] = [];
        const N = 20000;
        for (let i = 0; i < N; i++) {
            const f = pickFamily(levels, FAMS, history, rng);
            expect(f).not.toBe(history[history.length - 1]);
            counts.set(f, (counts.get(f) ?? 0) + 1);
            history = [...history, f].slice(-2);
        }
        // without the "no repeat" rule the weights alone: groups 1.5, orderNum 1.25, linear 1, syllogism 1
        const w = familyWeights(levels, FAMS, []);
        expect(w.get('groups')).toBeCloseTo(1.5);
        expect(w.get('orderNum')).toBeCloseTo(1.25);
        // the least practised family is chosen most often
        expect(counts.get('groups')!).toBeGreaterThan(counts.get('orderNum')!);
        expect(counts.get('orderNum')!).toBeGreaterThan(counts.get('linear')!);
        expect(Math.abs(counts.get('linear')! - counts.get('syllogism')!) / N).toBeLessThan(0.02);
    });

    it('session items: no repeats in a row, formats per family, fingerprints recorded', () => {
        let sched = emptySchedulerState();
        let prev: FamilyId | null = null;
        const enabled: FamilyId[] = ['groups', 'graph', 'binary', 'orderNum'];
        const formats = new Map<string, number>();
        for (let i = 0; i < 80; i++) {
            const r = nextItem({ enabled, levels: { groups: 4, graph: 4, binary: 6, orderNum: 6 }, format: 'ternary', sched, seed: `s:${i}` });
            expect(r.family).not.toBe(prev);
            prev = r.family;
            sched = r.sched;
            formats.set(`${r.family}:${r.item.format}`, (formats.get(`${r.family}:${r.item.format}`) ?? 0) + 1);
            if (r.family === 'binary') expect(r.item.format).toBe('binary');
        }
        expect(formats.get('graph:binary')).toBeGreaterThan(0);
        expect(formats.get('graph:choice')).toBeGreaterThan(0);
        expect(sched.fingerprints.length).toBe(50);
    });
});
