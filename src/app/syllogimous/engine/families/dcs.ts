// Difference-constraint systems for the direction families (spec §5.6).
// Each axis is independent: variables are coordinates, constraints x_a − x_b ≤ c (equalities as two
// inequalities, strict ones via ±1). Floyd–Warshall gives each pair an exact range [lo, hi] (±∞ possible).

import { Rng } from '../core/rng';
import { Answer } from '../core/types';
import { Vals } from '../core/combinatorics';
import { Rel, idx } from './plugin';

export const AXES = ['x', 'y', 'z'] as const;
export type Axis = typeof AXES[number];
/** Per-axis code of a relation "a relative to b": exact difference, 'g' (> 0), 'l' (< 0) or 'a' (anything). */
export type Code = number | 'g' | 'l' | 'a';

export const codeOf = (r: Rel, ax: Axis): Code => {
    const v = r.params?.[ax];
    if (v === undefined || v === null) return 'a';
    return typeof v === 'number' ? v : (v as Code);
};

/** A bound lo ≤ x_a − x_b ≤ hi on one axis (null = unbounded). */
export interface Bound { a: number; b: number; lo: number | null; hi: number | null }

export function codeBound(a: number, b: number, c: Code): Bound | null {
    if (c === 'a') return null;
    if (c === 'g') return { a, b, lo: 1, hi: null };
    if (c === 'l') return { a, b, lo: null, hi: -1 };
    return { a, b, lo: c, hi: c };
}

/** Complement pieces of a code (for "not q"). */
export function complementBounds(a: number, b: number, c: Code): Bound[] {
    if (c === 'a') return [];
    if (c === 'g') return [{ a, b, lo: null, hi: 0 }];
    if (c === 'l') return [{ a, b, lo: 0, hi: null }];
    return [{ a, b, lo: null, hi: c - 1 }, { a, b, lo: c + 1, hi: null }];
}

/** All-pairs shortest paths; d[u*n+v] = upper bound of x_v − x_u. null if inconsistent. */
export function closure(n: number, bounds: readonly Bound[]): Float64Array | null {
    const d = new Float64Array(n * n).fill(Infinity);
    for (let i = 0; i < n; i++) d[i * n + i] = 0;
    for (const b of bounds) {
        if (b.hi !== null) d[b.b * n + b.a] = Math.min(d[b.b * n + b.a], b.hi);      // x_a − x_b ≤ hi
        if (b.lo !== null) d[b.a * n + b.b] = Math.min(d[b.a * n + b.b], -b.lo);     // x_b − x_a ≤ −lo
    }
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
        const dik = d[i * n + k];
        if (dik === Infinity) continue;
        for (let j = 0; j < n; j++) {
            const v = dik + d[k * n + j];
            if (v < d[i * n + j]) d[i * n + j] = v;
        }
    }
    for (let i = 0; i < n; i++) if (d[i * n + i] < 0) return null;
    return d;
}

/** Range of x_a − x_b. */
export function range(d: Float64Array, n: number, a: number, b: number): [number, number] {
    return [-d[a * n + b], d[b * n + a]];
}

/** Verdict of one axis code given the range of the difference. */
export function axisVerdict(c: Code, lo: number, hi: number): Answer {
    if (c === 'a') return 'entailed';
    const [alo, ahi] = c === 'g' ? [1, Infinity] : c === 'l' ? [-Infinity, -1] : [c, c];
    if (lo >= alo && hi <= ahi) return 'entailed';
    if (hi < alo || lo > ahi) return 'contradicted';
    return 'undetermined';
}

export interface DcsWorld { axes: readonly Axis[]; n: number; d: Float64Array[] }

function localIndex(rels: readonly Rel[], n: number, full: boolean): { map: Map<number, number>; m: number } {
    const map = new Map<number, number>();
    if (full) { for (let i = 0; i < n; i++) map.set(i, i); return { map, m: n }; }
    for (const r of rels) for (const a of r.args) if (!map.has(idx(a))) map.set(idx(a), map.size);
    return { map, m: map.size };
}

function boundsFor(rels: readonly Rel[], ax: Axis, map: Map<number, number>): Bound[] {
    const out: Bound[] = [];
    for (const r of rels) {
        const b = codeBound(map.get(idx(r.args[0]))!, map.get(idx(r.args[1]))!, codeOf(r, ax));
        if (b) out.push(b);
    }
    return out;
}

export function dcsConsistent(axes: readonly Axis[], premises: readonly Rel[], n: number): boolean {
    const { map, m } = localIndex(premises, n, true);
    return axes.every(ax => closure(m, boundsFor(premises, ax, map)) !== null);
}

/** Exact classification: follows iff every axis follows; contradicts iff some axis contradicts. */
export function dcsClassify(axes: readonly Axis[], premises: readonly Rel[], q: Rel, n: number, full: boolean): Answer {
    const { map, m } = localIndex([...premises, q], n, full);
    const qa = map.get(idx(q.args[0]))!;
    const qb = map.get(idx(q.args[1]))!;
    let any: Answer = 'entailed';
    const verdicts: Answer[] = [];
    for (const ax of axes) {
        const d = closure(m, boundsFor(premises, ax, map));
        if (!d) throw new Error('Inconsistent direction premises');
        const [lo, hi] = range(d, m, qa, qb);
        verdicts.push(axisVerdict(codeOf(q, ax), lo, hi));
    }
    if (verdicts.includes('contradicted')) any = 'contradicted';
    else if (verdicts.includes('undetermined')) any = 'undetermined';
    return any;
}

/** Concrete coordinates (layout vals[e*3 + axis]) consistent with all bounds; values kept close to 0. */
export function dcsSample(axes: readonly Axis[], n: number, perAxis: readonly Bound[][], rng?: Rng, order?: readonly number[]): Vals | null {
    const vals = new Int32Array(n * 3);
    const ord = order ?? Array.from({ length: n }, (_, i) => i);
    for (let ai = 0; ai < axes.length; ai++) {
        const axisIdx = AXES.indexOf(axes[ai]);
        const d = closure(n, perAxis[ai]);
        if (!d) return null;
        const assigned: number[] = [];
        for (const v of ord) {
            let lo = -Infinity;
            let hi = Infinity;
            for (const u of assigned) {
                const xu = vals[u * 3 + axisIdx];
                lo = Math.max(lo, xu - d[v * n + u]);
                hi = Math.min(hi, xu + d[u * n + v]);
            }
            let x: number;
            if (rng) {
                if (lo > -Infinity && hi < Infinity) x = lo + rng.int(Math.min(hi - lo, 3) + 1);
                else if (lo > -Infinity) x = lo + rng.int(3);
                else if (hi < Infinity) x = hi - rng.int(3);
                else x = rng.int(5) - 2;
            } else {
                x = Math.max(lo, Math.min(hi, 0));
            }
            vals[v * 3 + axisIdx] = x;
            assigned.push(v);
        }
    }
    return vals;
}

export function dcsBounds(axes: readonly Axis[], premises: readonly Rel[]): Bound[][] {
    const map = new Map<number, number>();
    for (let i = 0; i < 64; i++) map.set(i, i);
    return axes.map(ax => boundsFor(premises, ax, map));
}

/** Model of premises + extra (positive or negated) relations; negation tries each axis / complement piece. */
export function dcsModel(axes: readonly Axis[], premises: readonly Rel[], extra: readonly { rel: Rel; negate?: boolean }[], n: number, rng?: Rng): Vals | null {
    const base = dcsBounds(axes, premises);
    const pos = extra.filter(e => !e.negate).map(e => e.rel);
    const posB = dcsBounds(axes, pos);
    const perAxis = axes.map((_, i) => [...base[i], ...posB[i]]);
    const neg = extra.filter(e => e.negate).map(e => e.rel);
    if (!neg.length) return dcsSample(axes, n, perAxis, rng);
    // only one negated relation is ever needed (explanations)
    const r = neg[0];
    const a = idx(r.args[0]);
    const b = idx(r.args[1]);
    for (let i = 0; i < axes.length; i++) {
        for (const piece of complementBounds(a, b, codeOf(r, axes[i]))) {
            const pa = perAxis.map((bs, j) => (j === i ? [...bs, piece] : bs));
            const m = dcsSample(axes, n, pa, rng);
            if (m) return m;
        }
    }
    return null;
}

/** Proxy for log2(#models) (infinite model space): number of (pair, axis) differences that are not fixed. */
export function dcsLog2Models(axes: readonly Axis[], premises: readonly Rel[], n: number): number {
    const base = dcsBounds(axes, premises);
    let free = 0;
    base.forEach(bs => {
        const d = closure(n, bs);
        if (!d) return;
        for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
            const [lo, hi] = range(d, n, a, b);
            if (lo !== hi) free++;
        }
    });
    return Math.min(16, free);
}

export function holdsDir(axes: readonly Axis[], r: Rel, vals: ArrayLike<number>): boolean {
    const a = idx(r.args[0]);
    const b = idx(r.args[1]);
    return axes.every(ax => {
        const i = AXES.indexOf(ax);
        const diff = vals[a * 3 + i] - vals[b * 3 + i];
        const c = codeOf(r, ax);
        return c === 'a' || (c === 'g' ? diff > 0 : c === 'l' ? diff < 0 : diff === c);
    });
}
