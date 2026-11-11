// Correctness tests (spec §4.11) for the families ported in phase 1C, with independent brute-force oracles:
// analogies — 2ⁿ colourings / permutations / seatings, and a 0…4 box for the map base; graphs — all
// permutations; connectives — re-classification of both statements by their own family solvers.

import { describe, expect, it } from 'vitest';
import { irredundant } from '../generate';
import { clampPremises } from '../difficulty/ladder';
import { Answer, BinaryOp, DEFAULT_ENGINE_OPTIONS, FamilyId, Item, Plan } from '../core/types';
import { Rng } from '../core/rng';
import { classify, consistent } from '../core/solve';
import { DIRECT, generate, pluginFor } from '../generate';
import { planningParams } from '../difficulty/ladder';
import { emptySchedulerState, nextPlan } from '../difficulty/scheduler';
import { analogySolver } from './analogy';
import { Graph, graphOf, signatures } from './graph';
import { OP_FN } from './binary';

/** Premise counts (clamped to each family's range). */
const LEVELS = [2, 3, 4, 5, 6, 8];
const PER_LEVEL = Number(process.env['ENGINE_TEST_N'] ?? 300);
const ix = (id: string) => Number(id.slice(1));
const mod = (x: number, n: number) => ((x % n) + n) % n;

type R = { kind: string; args: string[]; params?: Record<string, number | string | boolean> };

const visibleText = (html: string) => html.replace(/<[^>]+>/g, '');
const tagsBalanced = (html: string) =>
    (html.match(/<span\b/g) ?? []).length === (html.match(/<\/span>/g) ?? []).length
    && (html.match(/<div\b/g) ?? []).length === (html.match(/<\/div>/g) ?? []).length;

function checkRender(it: Item): void {
    const conc = Array.isArray(it.render.conclusion) ? it.render.conclusion.join('\n') : it.render.conclusion;
    const html = [...it.render.instructions, ...it.render.notes, ...it.render.premises, conc].join('\n');
    expect(html).not.toMatch(/undefined|NaN/);
    expect(tagsBalanced(html)).toBe(true);
}

function stream(family: FamilyId, level: number, count: number, tag: string, format: 'ternary' | 'binary' | 'choice' = 'ternary'): Item[] {
    const pp = planningParams(level, DEFAULT_ENGINE_OPTIONS);
    const direct = DIRECT[family];
    const plugin = direct ? null : pluginFor(family);
    const rng = new Rng(`test:${tag}:${family}:${level}:${format}`);
    let st = emptySchedulerState();
    const out: Item[] = [];
    for (let i = 0; i < count; i++) {
        const r = nextPlan(st, {
            family, format, params: pp,
            cueSpace: direct ? direct.cueSpace(level, format) : plugin!.cueSpace(pp, format),
            lures: direct ? ['none'] : plugin!.supportedLures(pp, DEFAULT_ENGINE_OPTIONS),
        }, rng);
        st = r.state;
        out.push(generate({ family, level, seed: `${tag}:${family}:${level}:${i}`, format, plan: r.plan }));
    }
    return out;
}

// ------------------------------------------------------------------ analogy oracle (independent semantics)

function baseHolds(base: string, r: R, v: number[], n: number): boolean {
    const [a, b, c] = r.args.map(ix);
    const k = Number(r.params?.['k'] ?? 0);
    if (base === 'groups') return r.kind === 'same' ? v[a] === v[b] : v[a] !== v[b];
    if (base === 'orderNum' || base === 'orderTime') return v[a] > v[b];
    if (base === 'linear') {
        switch (r.kind) {
            case 'left': return v[a] < v[b];
            case 'immLeft': return v[b] === v[a] + 1;
            case 'steps': return v[b] - v[a] === k;
            case 'adj': return Math.abs(v[a] - v[b]) === 1;
            case 'notAdj': return Math.abs(v[a] - v[b]) !== 1;
            case 'dist': return Math.abs(v[a] - v[b]) === k + 1;
            default: throw new Error('oracle linear ' + r.kind);
        }
    }
    const d = mod(v[a] - v[b], n);
    switch (r.kind) {
        case 'immLeft': return d === 1;
        case 'immRight': return d === n - 1;
        case 'adj': return d === 1 || d === n - 1;
        case 'notAdj': return d !== 1 && d !== n - 1;
        case 'gap': return Math.min(d, n - d) === k + 1;
        default: throw new Error('oracle circle ' + r.kind + c);
    }
}

function analogHolds(base: string, q: R, v: number[], n: number): boolean {
    const [a, b, c, d] = q.args.map(ix);
    let same: boolean;
    if (base === 'groups') same = (v[a] ^ v[b]) === (v[c] ^ v[d]);
    else if (base === 'orderNum' || base === 'orderTime') same = (v[a] > v[b]) === (v[c] > v[d]);
    else if (base === 'linear') same = v[a] - v[b] === v[c] - v[d];
    else same = mod(v[a] - v[b], n) === mod(v[c] - v[d], n);
    return same === (q.params?.['w2'] !== 'diff');
}

/** All assignments: colourings (groups), permutations (order, row), seatings with e0 at seat 0 (circle). */
function analogyOracle(it: Item): Answer | null {
    const base = String(it.query.params?.['b']);
    const n = it.entities.length;
    if (base === 'dir2d' || (base === 'groups' ? n > 12 : n > 8)) return null;
    let yes = 0;
    let no = 0;
    const v = new Array(n).fill(0);
    const visit = () => {
        if (!it.premises.every(r => baseHolds(base, r, v, n))) return;
        if (analogHolds(base, it.query, v, n)) yes++; else no++;
    };
    if (base === 'groups') {
        for (let m = 0; m < 1 << n && !(yes && no); m++) { for (let e = 0; e < n; e++) v[e] = (m >> e) & 1; visit(); }
    } else {
        const used = new Array(n).fill(false);
        const circle = base === 'circular';
        const rec = (e: number) => {
            if (yes && no) return;
            if (e === n) { visit(); return; }
            for (let p = 0; p < n; p++) {
                if (used[p] || (circle && e === 0 && p !== 0)) continue;
                used[p] = true; v[e] = p; rec(e + 1); used[p] = false;
            }
        };
        rec(0);
    }
    if (!yes && !no) throw new Error('oracle: inconsistent');
    return yes && no ? 'undetermined' : yes ? 'entailed' : 'contradicted';
}

/** Map base: coordinates in a 0…4 box (3–4 points, offsets ≤ 1). */
function boxAnalogy(premises: readonly R[], q: R, n: number): Answer | 'inconsistent' {
    let yes = 0;
    let no = 0;
    const total = 25 ** n;
    for (let code = 0; code < total && !(yes && no); code++) {
        const c: number[][] = [];
        let x = code;
        for (let e = 0; e < n; e++) { const cell = x % 25; x = Math.floor(x / 25); c.push([cell % 5, Math.floor(cell / 5)]); }
        const ok = premises.every(r => {
            const a = c[ix(r.args[0])];
            const b = c[ix(r.args[1])];
            return ['x', 'y'].every((ax, i) => {
                const code2 = r.params?.[ax];
                const d = a[i] - b[i];
                return code2 === undefined ? true : code2 === 'g' ? d > 0 : code2 === 'l' ? d < 0 : d === code2;
            });
        });
        if (!ok) continue;
        const [A, B, C, D] = q.args.map(ix);
        const same = c[A][0] - c[B][0] === c[C][0] - c[D][0] && c[A][1] - c[B][1] === c[C][1] - c[D][1];
        if (same === (q.params?.['w2'] !== 'diff')) yes++; else no++;
    }
    if (!yes && !no) return 'inconsistent';
    return yes && no ? 'undetermined' : yes ? 'entailed' : 'contradicted';
}

describe('analogy', () => {
    const plugin = pluginFor('analogy');
    it.each(LEVELS)('level %i: answers, σ, statedDirectly, render, non-locality, oracle', level => {
        let oracleChecked = 0;
        const bases = new Set<string>();
        for (const it of stream('analogy', level, PER_LEVEL, 'fx')) {
            const n = it.entities.length;
            bases.add(String(it.query.params?.['b']));
            expect(consistent(plugin, it.premises, n)).toBe(true);
            expect(classify(plugin, it.premises, it.query, n)).toBe(it.answer);
            expect(it.premises.length).toBe(clampPremises(it.family, level));
            if (it.answer !== 'undetermined') {
                expect(it.metrics.support).not.toBeNull();
                // v5.1: every premise is necessary — the support is the whole item
                expect(it.metrics.support).toBe(it.premises.length);
                expect(irredundant(pluginFor(it.family), it.premises, it.query, it.answer, it.entities.length)).toBe(true);
            } else {
                expect(it.metrics.support).toBeNull();
            }
            expect(plugin.statedDirectly(it.query, it.premises)).toBe(false);
            checkRender(it);
            expect(it.render.instructions.some(s => s.startsWith('«Как»'))).toBe(true);
            if (oracleChecked < 60) {
                const o = analogyOracle(it);
                if (o) { expect(o).toBe(it.answer); oracleChecked++; }
            }
        }
        if (level <= 8) expect(oracleChecked).toBeGreaterThan(10);
        expect(bases.size).toBeGreaterThanOrEqual(level > 6 ? 4 : 5);
    });

    it('determinism: same seed → identical item', () => {
        for (const base of ['groups', 'linear', 'dir2d']) {
            const plan: Plan = { target: 'entailed', cue: { base, w2: 'same' }, lure: 'none' };
            for (const level of [3, 6]) {
                expect(JSON.stringify(generate({ family: 'analogy', level, seed: 'det', format: 'ternary', plan })))
                    .toBe(JSON.stringify(generate({ family: 'analogy', level, seed: 'det', format: 'ternary', plan })));
            }
        }
    });

    it('map-base solver = coordinates in a 0…4 box (random small premise sets)', () => {
        const rng = new Rng('ana-dir');
        const codes: (string | number)[] = ['g', 'l', -1, 0, 1];
        let checked = 0;
        for (let i = 0; i < 250; i++) {
            const n = 4;
            const pick = () => { const a = rng.int(n); let b = rng.int(n); while (b === a) b = rng.int(n); return ['e' + a, 'e' + b]; };
            const rel = (): R => ({ kind: 'dir', args: pick(), params: { b: 'dir2d', t: 'qual', x: rng.pick(codes), y: rng.pick(codes) } });
            const prem = Array.from({ length: 2 + rng.int(2) }, rel);
            const perm = rng.shuffle([0, 1, 2, 3]).map(e => 'e' + e);
            const q: R = { kind: 'analog', args: perm, params: { b: 'dir2d', w2: rng.chance(0.5) ? 'same' : 'diff' } };
            const o = boxAnalogy(prem, q, n);
            let s: string;
            try { s = analogySolver.classify(prem, q, n, true); } catch { s = 'inconsistent'; }
            expect(s).toBe(o);
            checked++;
        }
        expect(checked).toBe(250);
    });
});

// ------------------------------------------------------------------ graph oracle

function permutations(n: number): number[][] {
    const out: number[][] = [];
    const p = Array.from({ length: n }, (_, i) => i);
    const rec = (k: number) => {
        if (k === n) { out.push(p.slice()); return; }
        for (let i = k; i < n; i++) { [p[k], p[i]] = [p[i], p[k]]; rec(k + 1); [p[k], p[i]] = [p[i], p[k]]; }
    };
    rec(0);
    return out;
}

const edgeSet = (g: Graph, f: (v: number) => number) =>
    new Set(g.edges.map(e => (e.mut ? `m${Math.min(f(e.u), f(e.v))}-${Math.max(f(e.u), f(e.v))}` : `d${f(e.u)}-${f(e.v)}`)));

/** All bijections that map the first network onto the second (brute force). */
function bruteIsos(g1: Graph, g2: Graph): number[][] {
    const target = edgeSet(g2, v => v);
    return permutations(g1.n).filter(p => {
        const s = edgeSet(g1, v => p[v]);
        return s.size === target.size && [...s].every(x => target.has(x));
    });
}

describe('graph', () => {
    it.each(LEVELS)('level %i: iso answers by brute force, same degree signatures, render', level => {
        let checked = 0;
        for (const it of stream('graph', level, Math.min(PER_LEVEL, 120), 'gi', 'binary')) {
            const g1 = graphOf(it, 1);
            const g2 = graphOf(it, 2);
            expect([...signatures(g1)].sort()).toEqual([...signatures(g2)].sort());
            expect(g1.edges.filter(e => e.mut).length).toBe(g2.edges.filter(e => e.mut).length);
            if (g1.n <= 7) {
                expect(bruteIsos(g1, g2).length > 0 ? 'entailed' : 'contradicted').toBe(it.answer);
                checked++;
            }
            expect(it.correctOptionId).toBe(it.answer === 'entailed' ? 'true' : 'false');
            checkRender(it);
        }
        if (level <= 12) expect(checked).toBeGreaterThan(0);
    });

    it.each(LEVELS)('level %i: map target has a unique image under all isomorphisms', level => {
        let checked = 0;
        for (const it of stream('graph', level, Math.min(PER_LEVEL, 120), 'gm', 'choice')) {
            const g1 = graphOf(it, 1);
            const g2 = graphOf(it, 2);
            const x = ix(it.query.args[0]);
            const sig = signatures(g1);
            const cls = sig.filter(s => s === sig[x]).length;
            expect([1, 2]).toContain(cls);
            expect(it.options!.map(o => o.id)).toContain(it.correctOptionId);
            expect(it.options!.length).toBe(g1.n);
            if (g1.n <= 7) {
                const images = new Set(bruteIsos(g1, g2).map(p => p[x]));
                expect([...images]).toEqual([ix(it.correctOptionId!) - g1.n]);
                checked++;
            }
            checkRender(it);
        }
        if (level <= 12) expect(checked).toBeGreaterThan(0);
    });

    it('determinism', () => {
        for (const format of ['binary', 'choice'] as const) {
            const plan: Plan = { target: 'contradicted', cue: {}, lure: 'none' };
            expect(JSON.stringify(generate({ family: 'graph', level: 9, seed: 'det', format, plan })))
                .toBe(JSON.stringify(generate({ family: 'graph', level: 9, seed: 'det', format, plan })));
        }
    });
});

// ------------------------------------------------------------------ connectives

describe('binary', () => {
    it.each(LEVELS)('level %i: both statements re-classified, truth table, disjoint names, render', level => {
        const ops = new Set<string>();
        for (const it of stream('binary', level, Math.min(PER_LEVEL, 150), 'bx', 'binary')) {
            const parts = it.parts!;
            expect(parts.length).toBe(2);
            const truth: boolean[] = [];
            for (const p of parts) {
                const plugin = pluginFor(p.family);
                const back = (id: string) => 'e' + (ix(id) - p.offset);
                const prem = p.premiseIdx.map(i => ({ ...it.premises[i], args: it.premises[i].args.map(back) }));
                const q = { ...p.query, args: p.query.args.map(back) };
                expect(classify(plugin, prem, q, p.n)).toBe(p.answer);
                expect(p.answer).not.toBe('undetermined');
                truth.push(p.answer === 'entailed');
            }
            if (parts[0].family !== parts[1].family) expect(parts[0].family).not.toBe(parts[1].family);
            const op = String(it.query.params?.['op']) as BinaryOp;
            ops.add(op);
            expect(OP_FN[op](truth[0], truth[1])).toBe(it.answer === 'entailed');
            const names = it.entities.map(e => e.name);
            expect(new Set(names).size).toBe(names.length);
            expect(it.format).toBe('binary');
            checkRender(it);
        }
        expect(ops.size).toBe(6);
    });

    it('determinism', () => {
        const plan: Plan = { target: 'entailed', cue: { op: 'xor' }, lure: 'none' };
        expect(JSON.stringify(generate({ family: 'binary', level: 8, seed: 'det', format: 'binary', plan })))
            .toBe(JSON.stringify(generate({ family: 'binary', level: 8, seed: 'det', format: 'binary', plan })));
    });
});
