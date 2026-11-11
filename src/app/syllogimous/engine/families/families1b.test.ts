// Correctness tests (spec §4.11) for the families ported in phase 1B, with independent brute-force oracles:
// syllogisms — occupancy of Venn regions (≤ 4 terms); directions — coordinates in a 0…4 box (n ≤ 4);
// circle — all seatings with e0 at seat 0.

import { describe, expect, it } from 'vitest';
import { irredundant } from '../generate';
import { clampPremises } from '../difficulty/ladder';
import { Answer, DEFAULT_ENGINE_OPTIONS, FamilyId, Item, Plan } from '../core/types';
import { Rng } from '../core/rng';
import { classify, consistent } from '../core/solve';
import { generate, pluginFor } from '../generate';
import { planningParams } from '../difficulty/ladder';
import { emptySchedulerState, nextPlan } from '../difficulty/scheduler';
import { catClassify, catConsistent } from './categorical';
import { dcsClassify } from './dcs';

const FAMILIES: FamilyId[] = ['circular', 'dir2d', 'dir3dSpace', 'dir3dTime', 'syllogism'];
/** Premise counts (clamped to each family's range). */
const LEVELS = [2, 3, 4, 5, 6, 8];
const PER_LEVEL = Number(process.env['ENGINE_TEST_N'] ?? 300);
const ix = (id: string) => Number(id.slice(1));
const mod = (x: number, n: number) => ((x % n) + n) % n;

type R = { kind: string; args: string[]; params?: Record<string, number | string | boolean> };

// ------------------------------------------------------------------ independent oracles

function vennHolds(r: R, occ: number, t: number): boolean {
    const a = ix(r.args[0]);
    const b = ix(r.args[1]);
    let some = false;
    for (let reg = 0; reg < 1 << t; reg++) {
        if (!(occ & (1 << reg))) continue;
        const inA = !!(reg & (1 << a));
        const inB = !!(reg & (1 << b));
        if (r.kind === 'all' && inA && !inB) return false;
        if (r.kind === 'no' && inA && inB) return false;
        if ((r.kind === 'some' && inA && inB) || (r.kind === 'some_not' && inA && !inB)) some = true;
    }
    return r.kind === 'all' || r.kind === 'no' ? true : some;
}

function vennClassify(premises: readonly R[], q: R, t: number): Answer | 'inconsistent' {
    let yes = 0;
    let no = 0;
    for (let occ = 0; occ < 1 << (1 << t); occ++) {
        let nonEmpty = true;
        for (let x = 0; x < t && nonEmpty; x++) {
            let has = false;
            for (let reg = 0; reg < 1 << t; reg++) if (occ & (1 << reg) && reg & (1 << x)) has = true;
            nonEmpty = has;
        }
        if (!nonEmpty || !premises.every(r => vennHolds(r, occ, t))) continue;
        if (vennHolds(q, occ, t)) yes++; else no++;
    }
    if (!yes && !no) return 'inconsistent';
    return yes && no ? 'undetermined' : yes ? 'entailed' : 'contradicted';
}

const AXES = ['x', 'y', 'z'];

function dirHolds(r: R, c: number[][], axes: number): boolean {
    const a = c[ix(r.args[0])];
    const b = c[ix(r.args[1])];
    for (let i = 0; i < axes; i++) {
        const code = r.params?.[AXES[i]];
        const d = a[i] - b[i];
        if (code === undefined || code === 'a') continue;
        if (code === 'g' ? d <= 0 : code === 'l' ? d >= 0 : d !== code) return false;
    }
    return true;
}

function boxClassify(premises: readonly R[], q: R, n: number, axes: number): Answer | 'inconsistent' {
    let yes = 0;
    let no = 0;
    const cells = 5 ** axes;
    const total = cells ** n;
    for (let code = 0; code < total; code++) {
        const c: number[][] = [];
        let x = code;
        for (let e = 0; e < n; e++) {
            let cell = x % cells;
            x = Math.floor(x / cells);
            const v: number[] = [];
            for (let i = 0; i < axes; i++) { v.push(cell % 5); cell = Math.floor(cell / 5); }
            c.push(v);
        }
        if (!premises.every(r => dirHolds(r, c, axes))) continue;
        if (dirHolds(q, c, axes)) yes++; else no++;
        if (yes && no) return 'undetermined';
    }
    if (!yes && !no) return 'inconsistent';
    return yes ? 'entailed' : 'contradicted';
}

function seatHolds(r: R, s: number[], n: number): boolean {
    const [a, b, c] = r.args.map(ix);
    const d = mod(s[a] - s[b], n);
    const dist = Math.min(d, n - d);
    switch (r.kind) {
        case 'immLeft': return d === 1;
        case 'immRight': return d === n - 1;
        case 'adj': return dist === 1;
        case 'notAdj': return dist !== 1;
        case 'opposite': return 2 * d === n;
        case 'gap': return dist === Number(r.params?.['k']) + 1;
        case 'between': {
            const x = mod(s[b] - s[a], n);
            const y = mod(s[c] - s[a], n);
            return (x === 1 && y === n - 1) || (x === n - 1 && y === 1);
        }
        default: throw new Error('oracle: ' + r.kind);
    }
}

function seatClassify(premises: readonly R[], q: R, n: number): Answer {
    let yes = 0;
    let no = 0;
    const s = new Array(n).fill(-1);
    const used = new Array(n).fill(false);
    s[0] = 0;
    used[0] = true;
    const rec = (e: number): void => {
        if (yes && no) return;
        if (e === n) {
            if (!premises.every(r => seatHolds(r, s, n))) return;
            if (seatHolds(q, s, n)) yes++; else no++;
            return;
        }
        for (let v = 1; v < n; v++) if (!used[v]) { used[v] = true; s[e] = v; rec(e + 1); used[v] = false; }
    };
    rec(1);
    return yes && no ? 'undetermined' : yes ? 'entailed' : 'contradicted';
}

/** Oracle answer for small items, null when the item is too large for brute force. */
function oracle(it: Item): Answer | null {
    const n = it.entities.length;
    if (it.family === 'syllogism') return n <= 4 ? (vennClassify(it.premises, it.query, n) as Answer) : null;
    if (it.family === 'circular') return n <= 8 ? seatClassify(it.premises, it.query, n) : null;
    const axes = it.family === 'dir2d' ? 2 : 3;
    const small = it.premises.every(r => AXES.slice(0, axes).every(a => typeof r.params?.[a] !== 'number' || Math.abs(r.params[a] as number) <= 1));
    return n <= (axes === 2 ? 4 : 3) && small ? (boxClassify(it.premises, it.query, n, axes) as Answer) : null;
}

// ------------------------------------------------------------------ item streams

function stream(family: FamilyId, level: number, count: number, tag: string): Item[] {
    const plugin = pluginFor(family);
    const pp = planningParams(level, DEFAULT_ENGINE_OPTIONS);
    const rng = new Rng(`test:${tag}:${family}:${level}`);
    let st = emptySchedulerState();
    const out: Item[] = [];
    for (let i = 0; i < count; i++) {
        const r = nextPlan(st, { family, format: 'ternary', params: pp, cueSpace: plugin.cueSpace(pp, 'ternary'), lures: plugin.supportedLures(pp, DEFAULT_ENGINE_OPTIONS) }, rng);
        st = r.state;
        out.push(generate({ family, level, seed: `${tag}:${family}:${level}:${i}`, format: 'ternary', plan: r.plan }));
    }
    return out;
}

const visibleText = (html: string) => html.replace(/<[^>]+>/g, '');
const spansBalanced = (html: string) => (html.match(/<span\b/g) ?? []).length === (html.match(/<\/span>/g) ?? []).length;

describe.each(FAMILIES)('%s', family => {
    const plugin = pluginFor(family);
    it.each(LEVELS)('level %i: answers, σ, statedDirectly, render, non-locality, oracle', level => {
        let oracleChecked = 0;
        for (const it of stream(family, level, PER_LEVEL, 'fx')) {
            const n = it.entities.length;
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
            const html = [...it.render.instructions, ...it.render.notes, ...it.render.premises, String(it.render.conclusion)].join('\n');
            expect(html).not.toMatch(/undefined|NaN/);
            expect(spansBalanced(html)).toBe(true);
            const mentioned = new Set(it.premises.flatMap(r => r.args));
            if (!pluginFor(it.family).fixedWorld) for (const e of it.entities) expect(mentioned.has(e.id)).toBe(true);
            if (oracleChecked < 40) {
                const o = oracle(it);
                if (o) { expect(o).toBe(it.answer); oracleChecked++; }
            }
        }
    });

    it('determinism: same seed → identical item', () => {
        const plan: Plan = { target: 'entailed', cue: {}, lure: 'none' };
        for (const level of [3, 11]) {
            expect(JSON.stringify(generate({ family, level, seed: 'det', format: 'ternary', plan })))
                .toBe(JSON.stringify(generate({ family, level, seed: 'det', format: 'ternary', plan })));
        }
    });
});

describe('solvers against brute force on random small premise sets', () => {
    it('syllogistic closure = Venn regions (3–4 terms)', () => {
        const rng = new Rng('venn');
        const Q = ['all', 'no', 'some', 'some_not'];
        let checked = 0;
        for (let i = 0; i < 1500; i++) {
            const t = 3 + rng.int(2);
            const pick = () => { const a = rng.int(t); let b = rng.int(t); while (b === a) b = rng.int(t); return ['e' + a, 'e' + b]; };
            const prem: R[] = Array.from({ length: 1 + rng.int(4) }, () => ({ kind: rng.pick(Q), args: pick() }));
            const q: R = { kind: rng.pick(Q), args: pick() };
            if (new Set([...prem, q].flatMap(r => r.args)).size !== t) continue;
            const o = vennClassify(prem, q, t);
            const s = catConsistent(prem) ? catClassify(prem, q) : 'inconsistent';
            expect(s).toBe(o);
            checked++;
        }
        expect(checked).toBeGreaterThan(800);
    });

    it('difference constraints = coordinates in a 0…4 box (2D, 3 points, steps ≤ 1)', () => {
        const rng = new Rng('dcs');
        const codes: (string | number)[] = ['g', 'l', 'a', -1, 0, 1];
        let checked = 0;
        for (let i = 0; i < 400; i++) {
            const pick = () => { const a = rng.int(3); let b = rng.int(3); while (b === a) b = rng.int(3); return ['e' + a, 'e' + b]; };
            const rel = (): R => ({ kind: 'dir', args: pick(), params: { x: rng.pick(codes), y: rng.pick(codes) } });
            const prem = [rel(), rel()];
            const q = rel();
            const o = boxClassify(prem, q, 3, 2);
            let s: string;
            try { s = dcsClassify(['x', 'y'], prem, q, 3, true); } catch { s = 'inconsistent'; }
            // with offsets ≤ 1 between 3 points every pattern of the plane fits into the 5×5 box
            expect(s).toBe(o);
            checked++;
        }
        expect(checked).toBe(400);
    });

    it('circle solver = all seatings (5–6 seats)', () => {
        const rng = new Rng('circle');
        const plugin = pluginFor('circular');
        let checked = 0;
        for (let i = 0; i < 300; i++) {
            const n = 5 + rng.int(2);
            const world = [0, ...rng.shuffle(Array.from({ length: n - 1 }, (_, j) => j + 1))];
            const rel = (): R => {
                const a = rng.int(n);
                let b = rng.int(n);
                while (b === a) b = rng.int(n);
                const d = mod(world[a] - world[b], n);
                const dist = Math.min(d, n - d);
                const kinds: R[] = [
                    { kind: 'gap', args: ['e' + a, 'e' + b], params: { k: dist - 1 } },
                    { kind: dist === 1 ? 'adj' : 'notAdj', args: ['e' + a, 'e' + b] },
                ];
                if (d === 1) kinds.push({ kind: 'immLeft', args: ['e' + a, 'e' + b] });
                if (d === n - 1) kinds.push({ kind: 'immRight', args: ['e' + a, 'e' + b] });
                return rng.pick(kinds);
            };
            const prem = Array.from({ length: 2 + rng.int(3) }, rel);
            const q = rel();
            if (rng.chance(0.5)) q.params = { k: Number(q.params?.['k'] ?? 0) + 1 };
            if (new Set([...prem, q].flatMap(r => r.args)).size < 2) continue;
            const o = seatClassify(prem, q, n);
            expect(classify(plugin, prem, q, n)).toBe(o);
            checked++;
        }
        expect(checked).toBeGreaterThan(250);
    });
});
