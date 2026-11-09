// Finite-domain constraint search (exhaustive with pruning) and small combinatorics helpers.
// Every family solver is built on `search`: variables are entities, values are positions / colours.
// A constraint is checked at the moment its last variable is assigned (spec §4.2).

import { Rng } from './rng';

export type Vals = Int32Array;

export interface Cons {
    /** Local variable indices the test reads. */
    vars: number[];
    test(v: Vals): boolean;
}

export interface Csp {
    nVars: number;
    /** Values are 0 … domain-1. */
    domain: number;
    /** All variables take pairwise different values (positions). */
    allDiff: boolean;
    /** Symmetry breaking: the first variable of the search order is fixed to 0 (groups: global colour flip). */
    fixFirst?: boolean;
    cons: Cons[];
}

export interface SearchOptions {
    /** Explicit variable order (must be a permutation of 0..nVars-1). */
    order?: number[];
    /** Random value order (world sampling). */
    rng?: Rng;
}

function greedyOrder(csp: Csp): number[] {
    const n = csp.nVars;
    const adj: number[][] = Array.from({ length: n }, () => []);
    const deg = new Array(n).fill(0);
    for (const c of csp.cons) {
        for (const v of c.vars) {
            deg[v]++;
            for (const w of c.vars) if (w !== v) adj[v].push(w);
        }
    }
    const order: number[] = [];
    const placed = new Uint8Array(n);
    const link = new Array(n).fill(0);
    for (let step = 0; step < n; step++) {
        let best = -1;
        for (let v = 0; v < n; v++) {
            if (placed[v]) continue;
            if (best < 0 || link[v] > link[best] || (link[v] === link[best] && deg[v] > deg[best])) best = v;
        }
        placed[best] = 1;
        order.push(best);
        for (const w of adj[best]) link[w]++;
    }
    return order;
}

/**
 * Depth-first search over assignments. `onModel` returns true to stop.
 * Returns true if the search was stopped by `onModel`.
 */
export function search(csp: Csp, onModel: (v: Vals) => boolean, opts: SearchOptions = {}): boolean {
    const n = csp.nVars;
    const vals = new Int32Array(n).fill(-1);
    if (n === 0) {
        for (const c of csp.cons) if (!c.test(vals)) return false;
        return onModel(vals);
    }
    const order = opts.order ?? greedyOrder(csp);
    const posOf = new Int32Array(n);
    order.forEach((v, i) => (posOf[v] = i));
    const buckets: Cons[][] = order.map(() => []);
    for (const c of csp.cons) {
        let last = 0;
        for (const v of c.vars) if (posOf[v] > last) last = posOf[v];
        buckets[last].push(c);
    }
    const used = new Uint8Array(csp.domain);
    const domainVals = Array.from({ length: csp.domain }, (_, i) => i);
    const rng = opts.rng;

    const rec = (i: number): boolean => {
        if (i === n) return onModel(vals);
        const v = order[i];
        const vs = i === 0 && csp.fixFirst ? [0] : rng ? rng.shuffle(domainVals.slice()) : domainVals;
        const bucket = buckets[i];
        for (let k = 0; k < vs.length; k++) {
            const val = vs[k];
            if (csp.allDiff && used[val]) continue;
            vals[v] = val;
            let ok = true;
            for (let j = 0; j < bucket.length; j++) {
                if (!bucket[j].test(vals)) { ok = false; break; }
            }
            if (!ok) continue;
            if (csp.allDiff) used[val] = 1;
            const stop = rec(i + 1);
            if (csp.allDiff) used[val] = 0;
            if (stop) return true;
        }
        vals[v] = -1;
        return false;
    };
    return rec(0);
}

export function satisfiable(csp: Csp): boolean {
    return search(csp, () => true);
}

/** First model (copy) or null. */
export function firstModel(csp: Csp, opts: SearchOptions = {}): Vals | null {
    let found: Vals | null = null;
    search(csp, v => { found = v.slice(); return true; }, opts);
    return found;
}

/** All models up to `cap` (copies). */
export function allModels(csp: Csp, cap: number): Vals[] {
    const out: Vals[] = [];
    search(csp, v => { out.push(v.slice()); return out.length >= cap; });
    return out;
}

export function countModels(csp: Csp, cap: number): number {
    let c = 0;
    search(csp, () => ++c >= cap);
    return c;
}

/** Calls fn for every k-subset of [0, n) in lexicographic order; fn returns true to stop. */
export function forEachCombination(n: number, k: number, fn: (idx: number[]) => boolean): boolean {
    if (k > n || k < 0) return false;
    const idx = Array.from({ length: k }, (_, i) => i);
    for (;;) {
        if (fn(idx)) return true;
        let i = k - 1;
        while (i >= 0 && idx[i] === n - k + i) i--;
        if (i < 0) return false;
        idx[i]++;
        for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }
}

export function permutations<T>(a: readonly T[]): T[][] {
    if (a.length <= 1) return [a.slice()];
    const out: T[][] = [];
    a.forEach((x, i) => {
        for (const rest of permutations([...a.slice(0, i), ...a.slice(i + 1)])) out.push([x, ...rest]);
    });
    return out;
}
