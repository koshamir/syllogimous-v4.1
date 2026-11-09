// Exact solvers over small enumerated world sets (phase 5 families): every world is listed once per size, each
// relation gets a cached bitset of the worlds where it holds, and classification is a bitwise AND.
// Subsets are always solved over the full world set (supportDomain 'full' — exact for every phase 5 family).

import { Rng } from '../core/rng';
import { Vals } from '../core/combinatorics';
import { Answer } from '../core/types';
import { Bits, allBits, and, andInto, forEachBit, popcount } from '../modes/builder/worlds';
import { CustomSolver, Rel, idx } from './plugin';

export interface EnumSpace {
    n: number;
    W: number;
    /** values[w * n + e] */
    values: Int8Array;
    /** Number of values per entity (for the preferred model). */
    card: number;
}

export type EvalRel = (rel: Rel, v: ArrayLike<number>, n: number) => boolean;

export interface EnumKit {
    space(n: number): EnumSpace;
    bits(rel: Rel, n: number): Bits;
    custom: CustomSolver;
    /** "First model that comes to mind": entities in first-mention order take the smallest value still possible. */
    preferred(premises: readonly Rel[], n: number): Vals;
    world(w: number, n: number): Vals;
    holdsIn(rel: Rel, v: Vals, n: number): boolean;
}

const relKeyOf = (r: Rel) => `${r.kind}|${r.args.join(',')}|${JSON.stringify(r.params ?? {}, ['k', 'p', 's', 'a', 'b', 'q', 'pol', 'pa', 'pb', 'form'])}`;

export function makeEnumKit(enumerate: (n: number) => number[][], evalRel: EvalRel): EnumKit {
    const spaces = new Map<number, EnumSpace>();
    const bitCache = new Map<number, Map<string, Bits>>();
    const factCache = new Map<number, Bits[][]>();

    const space = (n: number): EnumSpace => {
        let s = spaces.get(n);
        if (!s) {
            const rows = enumerate(n);
            const values = new Int8Array(rows.length * n);
            let card = 0;
            rows.forEach((r, w) => r.forEach((x, e) => { values[w * n + e] = x; card = Math.max(card, x + 1); }));
            s = { n, W: rows.length, values, card };
            spaces.set(n, s);
        }
        return s;
    };

    const world = (w: number, n: number): Vals => {
        const s = space(n);
        return Int32Array.from(s.values.subarray(w * n, w * n + n));
    };

    const bits = (rel: Rel, n: number): Bits => {
        let m = bitCache.get(n);
        if (!m) { m = new Map(); bitCache.set(n, m); }
        const key = relKeyOf(rel);
        let b = m.get(key);
        if (!b) {
            const s = space(n);
            b = new Uint32Array((s.W + 31) >>> 5);
            const view = new Int32Array(n);
            for (let w = 0; w < s.W; w++) {
                for (let e = 0; e < n; e++) view[e] = s.values[w * n + e];
                if (evalRel(rel, view, n)) b[w >>> 5] |= 1 << (w & 31);
            }
            m.set(key, b);
        }
        return b;
    };

    const factBits = (n: number): Bits[][] => {
        let f = factCache.get(n);
        if (!f) {
            const s = space(n);
            f = Array.from({ length: n }, (_, e) => Array.from({ length: s.card }, (_, v) => {
                const b = new Uint32Array((s.W + 31) >>> 5);
                for (let w = 0; w < s.W; w++) if (s.values[w * n + e] === v) b[w >>> 5] |= 1 << (w & 31);
                return b;
            }));
            factCache.set(n, f);
        }
        return f;
    };

    const modelsOf = (premises: readonly Rel[], n: number): Bits => {
        const M = allBits(space(n).W);
        for (const r of premises) andInto(M, bits(r, n));
        return M;
    };

    const neg = (b: Bits, W: number): Bits => {
        const out = new Uint32Array(b.length);
        for (let i = 0; i < b.length; i++) out[i] = ~b[i];
        const extra = b.length * 32 - W;
        if (extra) out[out.length - 1] &= 0xffffffff >>> extra;
        return out;
    };

    const custom: CustomSolver = {
        classify(premises, q, n): Answer {
            const M = modelsOf(premises, n);
            const qb = bits(q, n);
            const t = popcount(and(M, qb)) > 0;
            const f = popcount(and(M, neg(qb, space(n).W))) > 0;
            if (!t && !f) throw new Error('Inconsistent premises');
            return t && f ? 'undetermined' : t ? 'entailed' : 'contradicted';
        },
        consistent: (premises, n) => popcount(modelsOf(premises, n)) > 0,
        model(premises, extra, n, rng?: Rng) {
            const M = modelsOf(premises, n);
            for (const x of extra) andInto(M, x.negate ? neg(bits(x.rel, n), space(n).W) : bits(x.rel, n));
            const k = popcount(M);
            if (!k) return null;
            const pick = rng ? rng.int(k) : 0;
            let i = 0;
            let found = -1;
            forEachBit(M, w => { if (i++ === pick) { found = w; return true; } return false; });
            return world(found, n);
        },
        log2Models: (premises, n) => Math.log2(Math.max(1, popcount(modelsOf(premises, n)))),
    };

    const preferred = (premises: readonly Rel[], n: number): Vals => {
        const M = modelsOf(premises, n);
        if (!popcount(M)) throw new Error('Inconsistent premises (preferred model)');
        const order: number[] = [];
        for (const r of premises) for (const a of r.args) if (!order.includes(idx(a))) order.push(idx(a));
        for (let i = 0; i < n; i++) if (!order.includes(i)) order.push(i);
        const fb = factBits(n);
        for (const e of order) {
            for (let v = 0; v < fb[e].length; v++) {
                const next = and(M, fb[e][v]);
                if (popcount(next)) { M.set(next); break; }
            }
        }
        let w0 = -1;
        forEachBit(M, w => { w0 = w; return true; });
        return world(w0, n);
    };

    const holdsIn = (rel: Rel, v: Vals, n: number) => evalRel(rel, v, n);

    return { space, bits, custom, preferred, world, holdsIn };
}

/** Restricted growth strings with values < k (set partitions into ≤ k unlabeled blocks). */
export function partitions(n: number, k: number): number[][] {
    const out: number[][] = [];
    const a = new Array(n).fill(0);
    const rec = (i: number, mx: number) => {
        if (i === n) { out.push(a.slice()); return; }
        for (let v = 0; v <= Math.min(mx + 1, k - 1); v++) { a[i] = v; rec(i + 1, Math.max(mx, v)); }
    };
    if (n) { a[0] = 0; rec(1, 0); }
    return out;
}

export const evalIdx = (r: Rel) => r.args.map(idx);
