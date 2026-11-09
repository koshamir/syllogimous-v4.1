import { describe, expect, it } from 'vitest';
import { Rng, streams } from './rng';

const take = (r: Rng, n: number) => Array.from({ length: n }, () => r.float());

describe('Rng', () => {
    it('is deterministic for the same seed', () => {
        expect(take(new Rng('seed-1'), 50)).toEqual(take(new Rng('seed-1'), 50));
    });

    it('differs for different seeds', () => {
        expect(take(new Rng('seed-1'), 10)).not.toEqual(take(new Rng('seed-2'), 10));
    });

    it('matches the reference xmur3+sfc32 sequence (audit-baseline prototype)', () => {
        // Golden values computed with the independent copy in audit-baseline/proto-constructive-order.ts.
        expect(take(new Rng('syllogimous'), 3)).toEqual([0.1282274464610964, 0.39011530485004187, 0.03488970338366926]);
    });

    it('int / pick / chance stay in range', () => {
        const r = new Rng('ranges');
        for (let i = 0; i < 2000; i++) {
            const k = r.int(7);
            expect(Number.isInteger(k) && k >= 0 && k < 7).toBe(true);
            expect(['a', 'b', 'c']).toContain(r.pick(['a', 'b', 'c']));
            expect(typeof r.chance(0.5)).toBe('boolean');
        }
        expect(new Rng('x').chance(0)).toBe(false);
        expect(new Rng('x').chance(1)).toBe(true);
    });

    it('int is roughly uniform', () => {
        const r = new Rng('uniform');
        const counts = [0, 0, 0, 0];
        const N = 40000;
        for (let i = 0; i < N; i++) counts[r.int(4)]++;
        for (const c of counts) expect(Math.abs(c / N - 0.25)).toBeLessThan(0.01);
    });

    it('shuffle is a deterministic permutation', () => {
        const a = new Rng('sh').shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
        const b = new Rng('sh').shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(a).toEqual(b);
        expect([...a].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('fork is independent of parent consumption', () => {
        const p1 = new Rng('parent');
        const p2 = new Rng('parent');
        take(p2, 100);
        expect(take(p1.fork('child'), 10)).toEqual(take(p2.fork('child'), 10));
        expect(take(p1.fork('child'), 10)).not.toEqual(take(p1.fork('other'), 10));
    });

    it('streams are independent: semantic is unaffected by presentation use', () => {
        const s1 = streams('item-42');
        const s2 = streams('item-42');
        take(s2.presentation, 500);
        take(s2.scheduler, 500);
        expect(take(s1.semantic, 20)).toEqual(take(s2.semantic, 20));
        expect(take(s1.semantic, 5)).not.toEqual(take(s1.presentation, 5));
    });

    it('pick throws on an empty array', () => {
        expect(() => new Rng('e').pick([])).toThrow();
    });
});
