// Hand-written fixtures: «между», restricted support domains, σ / non-locality / convergence, names, scheduler.

import { describe, expect, it } from 'vitest';
import { classify, classifySubset } from './solve';
import { isConvergent, minimalSupport, myopicAnswer } from './support';
import { Premise, Query } from './types';
import { lineSolver } from '../families/line';
import { groupsPlugin } from '../families/groups';
import { confusable, getCyrillicPool, isAllowedPseudoWord, pickNames } from './names';
import { Rng } from './rng';
import { answerBagContents, familyWeights, lureBagContents } from '../difficulty/scheduler';
import { NAME_BLOCKLIST } from './names.blocklist';

const R = (kind: string, ...a: (number | Record<string, number | string>)[]): Premise => {
    const params = typeof a[a.length - 1] === 'object' ? (a.pop() as Record<string, number | string>) : undefined;
    return params ? { kind, args: (a as number[]).map(i => 'e' + i), params } : { kind, args: (a as number[]).map(i => 'e' + i) };
};

const order = lineSolver('orderNum');
const linear = lineSolver('linear');

describe('«между» semantics (order)', () => {
    it('between alone does not orient', () => {
        const P = [R('between', 1, 0, 2)];                       // e1 between e0 and e2
        expect(classify(order, P, R('gt', 1, 0), 3)).toBe('undetermined');
        expect(classify(order, P, R('gt', 2, 0), 3)).toBe('undetermined');
        expect(classify(order, P, R('between', 0, 1, 2), 3)).toBe('contradicted');
    });
    it('between + one comparison orients the triple', () => {
        const P = [R('between', 1, 0, 2), R('gt', 0, 1)];       // e0 > e1, e1 between → e2 < e1
        expect(classify(order, P, R('gt', 1, 2), 3)).toBe('entailed');
        expect(classify(order, P, R('gt', 2, 0), 3)).toBe('contradicted');
    });
    it('between chain needs one orientation for the whole run', () => {
        const P = [R('between', 1, 0, 2), R('between', 2, 1, 3)];
        expect(classify(order, P, R('gt', 3, 0), 4)).toBe('undetermined');
        expect(classify(order, [...P, R('gt', 2, 1)], R('gt', 3, 0), 4)).toBe('entailed');
    });
});

describe('restricted support domain', () => {
    it('order: a subset is solved on its own entities (relative relations)', () => {
        expect(classifySubset(order, [R('gt', 0, 1), R('gt', 1, 2)], R('gt', 0, 2), 6)).toBe('entailed');
    });
    it('order: positional facts use injection into all n positions', () => {
        // e0 is the largest of 5 ⇒ e0 > e3 even though e3 is not mentioned elsewhere
        expect(classifySubset(order, [R('extreme', 0, { side: 'max' })], R('gt', 0, 3), 5)).toBe('entailed');
    });
    it('linear: «сразу слева» chains fix distances; ends are absolute', () => {
        const P = [R('immLeft', 0, 1), R('immLeft', 1, 2)];
        expect(classify(linear, P, R('steps', 0, 2, { k: 2 }), 3)).toBe('entailed');
        expect(classify(linear, P, R('end', 1), 3)).toBe('contradicted');
        expect(classify(linear, [R('left', 0, 1)], R('adj', 0, 1), 4)).toBe('undetermined');
        expect(classify(linear, [R('dist', 0, 1, { k: 1 })], R('adj', 0, 1), 4)).toBe('contradicted');
    });
    it('linear: «Из A, B и C посередине стоит B» does not mean adjacency', () => {
        expect(classify(linear, [R('between', 1, 0, 2)], R('adj', 0, 1), 5)).toBe('undetermined');
    });
});

describe('σ, non-locality, convergence', () => {
    it('simple chain: σ = 3, non-local, not convergent', () => {
        const P = [R('gt', 0, 1), R('gt', 1, 2), R('gt', 2, 3), R('gt', 4, 0)];
        const q: Query = R('gt', 0, 3);
        const S = minimalSupport(order, P, q, 'entailed', 5, 5)!;
        expect(S.size).toBe(3);
        expect(S.idx.sort()).toEqual([0, 1, 2]);
        expect(myopicAnswer(order, P, q, 5)).toBe('undetermined');
        expect(isConvergent(S.idx.map(i => P[i]), q)).toBe(false);
    });
    it('a «между» in the support makes it convergent', () => {
        // e0 < e1 < e2 (между + one comparison), e2 < e3 < e4
        const P = [R('between', 1, 0, 2), R('gt', 2, 1), R('gt', 3, 2), R('gt', 4, 3)];
        const q: Query = R('gt', 0, 4);
        expect(classify(order, P, q, 5)).toBe('contradicted');
        const S = minimalSupport(order, P, q, 'contradicted', 5, 5)!;
        expect(isConvergent(S.idx.map(i => P[i]), q)).toBe(true);
    });
    it('groups: parity along a path, meta-relations', () => {
        const P = [R('same', 0, 1), R('opp', 1, 2), R('opp', 2, 3)];
        expect(classify(groupsPlugin, P, R('same', 0, 3), 5)).toBe('entailed');
        expect(classify(groupsPlugin, P, R('same', 0, 4), 5)).toBe('undetermined');
        const M = [...P, R('meta', 0, 4, 2, 3, { rel: 'same' })];   // (0~4) like (2~3) = opposite
        expect(classify(groupsPlugin, M, R('opp', 0, 4), 5)).toBe('entailed');
    });
});

describe('names', () => {
    it('Cyrillic CVC pool excludes blocklisted words and spelling violations', () => {
        const pool = getCyrillicPool();
        expect(pool.length).toBeGreaterThan(1500);
        for (const w of pool) {
            expect(isAllowedPseudoWord(w)).toBe(true);
            expect(NAME_BLOCKLIST.has(w)).toBe(false);
            expect(w).not.toMatch(/ЖЫ|ШЫ|ЧЯ|ЧЮ|ЖЯ|ШЯ|ЖЮ|ШЮ|ГЫ|КЫ|ХЫ|ЦЮ|ЦЯ/);
        }
        for (const w of ['ВОЛ', 'ДОМ', 'КОТ', 'ХЕР', 'ЖОП', 'БОГ']) expect(pool.includes(w)).toBe(false);
    });
    it('distinct mode: different first letters', () => {
        for (let i = 0; i < 50; i++) {
            const { names } = pickNames(new Rng('n' + i), { n: 9, pool: 'cyrillic', mode: 'distinct', pConfusable: 1, pCarryOver: 1, prevNames: ['БАЛ'] });
            expect(new Set(names.map(x => x[0])).size).toBe(9);
        }
    });
    it('confusable mode plants a confusable pair; carry-over reuses previous names', () => {
        const r = pickNames(new Rng('c'), { n: 6, pool: 'cyrillic', mode: 'byLevel', pConfusable: 1, pCarryOver: 1, prevNames: ['ДЕК', 'ЗУМ'] });
        expect(r.confusable).toBe(true);
        expect(r.carriedOver).toBeGreaterThan(0);
        expect(r.names.some((a, i) => r.names.some((b, j) => i !== j && confusable(a, b)))).toBe(true);
    });
});

describe('scheduler bags', () => {
    it('answer bags are balanced', () => {
        const t = answerBagContents('ternary');
        expect(t.filter(a => a === 'undetermined').length).toBe(4);
        expect(answerBagContents('binary').filter(a => a === 'entailed').length).toBe(6);
        expect(answerBagContents('choice').filter(a => a === 'undetermined').length / 12).toBe(0.25);
    });
    it('surface share is equal across classes; possible/none split for Unknown', () => {
        const mix = ['none', 'reversal', 'possible', 'nearMiss', 'surface'] as const;
        for (const a of ['entailed', 'contradicted', 'undetermined'] as const) {
            const bag = lureBagContents(a, [...mix]);
            expect(bag.length).toBe(8);
            expect(bag.filter(l => l === 'surface').length).toBe(2);
        }
        const u = lureBagContents('undetermined', [...mix]);
        expect(u.filter(l => l === 'possible').length).toBe(u.filter(l => l === 'none').length);
    });
    it('family weights: previous family excluded, lagging families preferred', () => {
        const w = familyWeights({ groups: 10, orderNum: 2, linear: 6 }, ['groups', 'orderNum', 'linear'], ['linear']);
        expect(w.get('linear')).toBe(0);
        expect(w.get('orderNum')!).toBeGreaterThan(w.get('groups')!);
    });
});
