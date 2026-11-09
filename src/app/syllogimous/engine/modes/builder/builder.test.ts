// Phase 3 acceptance (spec §7.6): uniqueness, minimality, trace consistency, level targets, the "clues one at a
// time" bot ≤ 10 % at L ≥ 5, generation p95 ≤ 400 ms (Node).

import { describe, expect, it } from 'vitest';
import { BuilderPuzzle, builderTarget, checkBuilder, clueBits, generateBuilder, oneAtATimeBot, wsOf } from './builder';
import { holds } from './clues';
import { allBits, and, andInto, bitsOf, popcount, val } from './worlds';

const LEVELS = [1, 3, 5, 8, 12, 16, 19];
const PER = Number(process.env['BUILDER_TEST_N'] ?? 40);

function worldsLeft(p: BuilderPuzzle, skip = -1): number {
    const ws = wsOf(p);
    let M = allBits(ws.W);
    if (p.fixed) M = and(M, bitsOf(ws, w => val(ws, w, p.fixed!.e) === p.fixed!.v));
    p.clues.forEach((c, i) => { if (i !== skip) andInto(M, bitsOf(ws, w => holds(ws, w, c))); });
    return popcount(M);
}

describe('«Конструктор»', () => {
    it.each(LEVELS)('level %i: unique solution, minimal clues, consistent trace, targets', level => {
        const t = builderTarget(level);
        for (let i = 0; i < PER; i++) {
            const p = generateBuilder(level, `t${level}:${i}`, { variant: 'build' });
            const ws = wsOf(p);
            expect(worldsLeft(p)).toBe(1);
            expect(checkBuilder(p, p.solution).correct).toBe(p.n);
            expect(checkBuilder(p, p.solution).violated).toEqual([]);
            // every clue is needed, except declared distractors
            p.clues.forEach((c, k) => {
                if (!c.distractor) expect(worldsLeft(p, k)).toBeGreaterThan(1);
            });
            expect(p.clues.filter(c => c.distractor).length).toBeGreaterThanOrEqual(t.distractors[0]);
            // the trace only states true facts, uses the clues it names, and ends with everything known
            const known = new Set<string>();
            if (p.fixed) known.add(`${p.fixed.e}:0`);
            for (const s of p.trace) {
                for (const f of s.facts) {
                    expect(p.solution[f.e * p.attrs + f.a]).toBe(f.v);
                    known.add(`${f.e}:${f.a}`);
                }
                if (!s.hypothesis) {
                    // those clues + the facts known before the step force the new facts
                    let M = allBits(ws.W);
                    for (const i2 of s.clues) andInto(M, clueBits(ws, p.clues[i2]));
                    for (const f of s.facts) expect(popcount(M)).toBeGreaterThan(0);
                }
                expect(s.text).toMatch(/^Шаг \d+\./);
            }
            expect(known.size).toBe(p.n * p.attrs);
            if (!p.relaxations.length) {
                expect(p.metrics.maxK).toBeGreaterThanOrEqual(t.maxK[0]);
                expect(p.metrics.maxK).toBeLessThanOrEqual(t.maxK[1]);
                expect(p.metrics.entryK).toBeGreaterThanOrEqual(t.entryKMin);
                if (!t.hypothesis) expect(p.metrics.caseSplit).toBe(false);
            }
            const html = [...p.instructions, ...p.clues.map(c => c.text), ...p.trace.map(s => s.text)].join('\n');
            expect(html).not.toMatch(/undefined|NaN/);
            expect(html.replace(/<[^>]+>/g, '')).not.toMatch(/[A-Za-z]/);
        }
    });

    it('relaxations are rare', () => {
        let r = 0;
        let n = 0;
        for (const level of LEVELS) for (let i = 0; i < PER; i++) { n++; if (generateBuilder(level, `r${level}:${i}`, { variant: 'build' }).relaxations.length) r++; }
        expect(r / n).toBeLessThanOrEqual(0.1);
    });

    it('the "clues one at a time" bot solves ≤ 10 % at L ≥ 5', () => {
        for (const level of [5, 8, 12, 16]) {
            let s = 0;
            for (let i = 0; i < PER; i++) s += oneAtATimeBot(generateBuilder(level, `bot${level}:${i}`, { variant: 'build' }));
            expect(s / PER).toBeLessThanOrEqual(0.1);
        }
    });

    it('mustBe: exactly one statement must be true; count: the number of arrangements', () => {
        for (const level of [3, 8, 14]) {
            for (let i = 0; i < 15; i++) {
                const m = generateBuilder(level, `mb${level}:${i}`, { variant: 'mustBe' });
                expect(m.mustBe!.options.length).toBe(4);
                expect(m.metrics.worlds).toBeGreaterThan(1);
                const c = generateBuilder(level, `ct${level}:${i}`, { variant: 'count' });
                expect(worldsLeft(c)).toBe(c.count!.worlds);
                expect(c.count!.correct).toBe(Math.min(4, c.count!.worlds) - 1);
            }
        }
    });

    it('determinism and generation time (p95 ≤ 400 ms)', () => {
        expect(JSON.stringify(generateBuilder(9, 'det'))).toBe(JSON.stringify(generateBuilder(9, 'det')));
        const times: number[] = [];
        for (const level of LEVELS) for (let i = 0; i < 30; i++) {
            const t0 = performance.now();
            generateBuilder(level, `time${level}:${i}`);
            times.push(performance.now() - t0);
        }
        times.sort((a, b) => a - b);
        expect(times[Math.floor(times.length * 0.95)]).toBeLessThanOrEqual(400);
    });
});
