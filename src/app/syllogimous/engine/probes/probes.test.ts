// Phase 7: transfer probes — the Latin-square complexity is what an independent check says, series answers follow
// their rule, the graph target has a unique image, sessions are deterministic per date and balanced.

import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { generateProbeSession } from './session';
import { latinSquares, relationalComplexity } from './lst';
import { isomorphisms } from '../families/graph';

describe('transfer probes', () => {
    it('576 Latin squares of order 4', () => {
        const sq = latinSquares();
        expect(sq.length).toBe(576);
        for (const s of sq.slice(0, 50)) for (let r = 0; r < 4; r++) {
            expect(new Set(s.slice(r * 4, r * 4 + 4)).size).toBe(4);
            expect(new Set([0, 1, 2, 3].map(k => s[k * 4 + r])).size).toBe(4);
        }
    });

    it('sessions: deterministic, balanced, answers correct', () => {
        const a = generateProbeSession('2026-11-01');
        expect(JSON.stringify(a)).toBe(JSON.stringify(generateProbeSession('2026-11-01')));
        expect(a.lst.length).toBe(10);
        expect(a.series.length).toBe(8);
        expect(a.graph.length).toBe(8);
        expect(a.lst.map(i => i.complexity).sort().join('')).toBe('1112222333');
        for (const it of a.lst) {
            const visible = new Map<number, number>();
            it.grid.forEach((v, i) => { if (v >= 0) visible.set(i, v); });
            // the full visible set determines the target: every consistent square has the answer there
            const sols = latinSquares().filter(s => [...visible].every(([c, v]) => s[c] === v));
            expect(new Set(sols.map(s => s[it.target]))).toEqual(new Set([it.answer]));
            expect(relationalComplexity(visible, it.target)).toBe(it.complexity);
        }
        for (const s of a.series) {
            const x = [...s.shown, s.answer];
            if (s.kind === 'arith') expect(x[6] - x[5]).toBe(x[1] - x[0]);
            if (s.kind === 'geom') expect(x[6] * x[4]).toBe(x[5] * x[5]);
            if (s.kind === 'fib') expect(x[6]).toBe(x[5] + x[4]);
            if (s.kind === 'interleaved') expect(x[6] - x[4]).toBe(x[2] - x[0]);
            if (s.kind === 'second') expect(x[6] - 2 * x[5] + x[4]).toBe(x[2] - 2 * x[1] + x[0]);
        }
        for (const g of a.graph) {
            expect(new Set(isomorphisms(g.g1, g.g2).map(f => f[g.target]))).toEqual(new Set([g.answer]));
        }
    });

    it('different dates give different forms', () => {
        const a = generateProbeSession('2026-11-01');
        const b = generateProbeSession('2026-11-15');
        expect(JSON.stringify(a.lst)).not.toBe(JSON.stringify(b.lst));
        void new Rng('x');
    });
});
