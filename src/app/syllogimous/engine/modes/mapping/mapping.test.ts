// Phase 4 acceptance (spec §8): uniqueness and correctness of correspondences (oracle — permutation enumeration),
// bot gates.

import { describe, expect, it } from 'vitest';
import { MappingPuzzle, TGraph, degreeSequencePick, firstMentionPick, generateMapping, signatureBot, typeBlindSignature, wordPositionPick } from './mapping';

function perms(n: number): number[][] {
    const out: number[][] = [];
    const p = Array.from({ length: n }, (_, i) => i);
    const rec = (k: number) => {
        if (k === n) { out.push(p.slice()); return; }
        for (let i = k; i < n; i++) { [p[k], p[i]] = [p[i], p[k]]; rec(k + 1); [p[k], p[i]] = [p[i], p[k]]; }
    };
    rec(0);
    return out;
}

/** Brute force over vertex permutations and relation-type bijections (symmetric ↔ symmetric). */
function bruteIsos(g1: TGraph, g2: TGraph): number[][] {
    const key = (g: TGraph, f: (v: number) => number, tm: number[]) =>
        new Set(g.edges.map(e => (g.sym[e.t] ? `${tm[e.t]}:${Math.min(f(e.u), f(e.v))}-${Math.max(f(e.u), f(e.v))}` : `${tm[e.t]}:${f(e.u)}>${f(e.v)}`)));
    const target = key(g2, v => v, g2.sym.map((_, i) => i));
    const tms = g1.sym.length === 1 ? [[0]] : [[0, 1], [1, 0]];
    const out: number[][] = [];
    for (const tm of tms) {
        if (!tm.every((t2, t1) => g1.sym[t1] === g2.sym[t2])) continue;
        for (const p of perms(g1.n)) {
            const s = key(g1, v => p[v], tm);
            if (s.size === target.size && [...s].every(x => target.has(x))) out.push(p);
        }
    }
    return out;
}

const LEVELS = [1, 4, 8, 12, 16];

describe('«Отображение структур»', () => {
    it.each(LEVELS)('level %i: unique correspondences (brute force), render', level => {
        for (const kind of ['map', 'anchor', 'iso3'] as const) {
            for (let i = 0; i < 12; i++) {
                const p = generateMapping(level, `m${level}:${kind}:${i}`, { kind });
                const [g1, g2] = p.graphs;
                if (kind === 'iso3') {
                    const ok2 = bruteIsos(g1, p.graphs[1]).length > 0;
                    const ok3 = bruteIsos(g1, p.graphs[2]).length > 0;
                    expect(ok2 !== ok3).toBe(true);
                    expect(p.correct).toBe(ok2 ? 's2' : 's3');
                    expect(typeBlindSignature(p.graphs[1]).sort()).toEqual(typeBlindSignature(p.graphs[2]).sort());
                } else if (g1.n <= 7) {
                    let isos = bruteIsos(g1, g2);
                    if (kind === 'anchor') {
                        const a = p.anchor!;
                        expect(new Set(isos.map(f => f[p.target])).size).toBeGreaterThan(1);
                        isos = isos.filter(f => f[a.x] === a.k);
                    }
                    const images = new Set(isos.map(f => f[p.target]));
                    expect([...images]).toEqual([Number(p.correct.slice(1))]);
                }
                const html = [...p.systems.flatMap(s => s.statements), p.question, ...p.explanation, ...p.options.map(o => o.label)].join('\n');
                expect(html).not.toMatch(/undefined|NaN|\{a\}|\{b\}/);
            }
        }
    });

    it('bots stay at chance', () => {
        for (const level of [6, 10, 14]) {
            let sig = 0;
            let fm = 0;
            let wp = 0;
            let chance = 0;
            let ds = 0;
            const N = 150;
            for (let i = 0; i < N; i++) {
                const p = generateMapping(level, `bot${level}:${i}`, { kind: 'map' });
                sig += signatureBot(p);
                if (firstMentionPick(p) === p.correct) fm++;
                if (wordPositionPick(p) === p.correct) wp++;
                chance += 1 / p.graphs[0].n;
                const q = generateMapping(level, `bot3${level}:${i}`, { kind: 'iso3' });
                if (degreeSequencePick(q) === q.correct) ds++;
            }
            expect(fm / N).toBeLessThanOrEqual(chance / N + 0.08);
            expect(wp / N).toBeLessThanOrEqual(chance / N + 0.08);
            expect(ds / N).toBeLessThanOrEqual(0.6);
            expect(sig / N).toBeLessThanOrEqual(1);
        }
    });

    it('determinism', () => {
        expect(JSON.stringify(generateMapping(9, 'det'))).toBe(JSON.stringify(generateMapping(9, 'det')));
    });
});

export type { MappingPuzzle };
