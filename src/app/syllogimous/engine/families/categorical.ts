// Classical syllogistics with existential import (every named category is non-empty).
// Port of sylIsConsistent / sylEntails from v4.1 (utils/syllogism.utils.ts) onto bitmasks, plus
// witness-object models for explanations (spec §5.3).

import { Answer } from '../core/types';
import { Vals } from '../core/combinatorics';
import { Rel, idx } from './plugin';

export type Quant = 'all' | 'no' | 'some' | 'some_not';
export const QUANTS: Quant[] = ['all', 'no', 'some', 'some_not'];
export const NEG: Record<Quant, Quant> = { all: 'some_not', no: 'some', some: 'no', some_not: 'all' };

interface Closure { sub: number[]; dis: number[]; terms: number }

function close(rels: readonly Rel[]): Closure | null {
    let terms = 0;
    for (const r of rels) for (const a of r.args) terms |= 1 << idx(a);
    const sub: number[] = [];
    const dis: number[] = [];
    for (let t = 0; t < 31; t++) { sub[t] = 1 << t; dis[t] = 0; }
    for (const r of rels) {
        const a = idx(r.args[0]);
        const b = idx(r.args[1]);
        if (r.kind === 'all') sub[a] |= 1 << b;
        else if (r.kind === 'no') { dis[a] |= 1 << b; dis[b] |= 1 << a; }
    }
    const each = (m: number, f: (t: number) => void) => { for (let t = 0; t < 31; t++) if (m & (1 << t)) f(t); };
    let changed = true;
    while (changed) {
        changed = false;
        each(terms, x => {
            let s = sub[x];
            each(sub[x], y => { s |= sub[y]; });
            if (s !== sub[x]) { sub[x] = s; changed = true; }
        });
    }
    changed = true;
    while (changed) {
        changed = false;
        each(terms, x => {
            let d = dis[x];
            each(sub[x], y => { d |= dis[y]; });          // x ⊆ y, y ∩ z = ∅ ⇒ x ∩ z = ∅
            if (d !== dis[x]) { dis[x] = d; changed = true; }
        });
        each(terms, x => each(dis[x], y => {
            if (!(dis[y] & (1 << x))) { dis[y] |= 1 << x; changed = true; }
        }));
    }
    return { sub, dis, terms };
}

export function catConsistent(rels: readonly Rel[]): boolean {
    const c = close(rels);
    if (!c) return false;
    for (let t = 0; t < 31; t++) if (c.terms & (1 << t) && c.sub[t] & c.dis[t]) return false;   // existential import
    for (const r of rels) {
        const a = idx(r.args[0]);
        const b = idx(r.args[1]);
        if (r.kind === 'some') {
            if ((c.sub[a] | c.sub[b]) & (c.dis[a] | c.dis[b])) return false;
        } else if (r.kind === 'some_not') {
            if (c.sub[a] & (c.dis[a] | (1 << b))) return false;
        }
    }
    return true;
}

export const negRel = (r: Rel): Rel => ({ kind: NEG[r.kind as Quant], args: r.args });

export function catClassify(premises: readonly Rel[], q: Rel): Answer {
    if (!catConsistent(premises)) throw new Error('Inconsistent categorical premises');
    const t = catConsistent([...premises, q]);
    const f = catConsistent([...premises, negRel(q)]);
    return t && f ? 'undetermined' : t ? 'entailed' : 'contradicted';
}

/**
 * Witness model: one object per term, per «некоторые» premise; each object belongs exactly to the upward
 * closure of its seed. Layout: vals[0] = number of objects, vals[1 + i] = bitmask of the terms of object i.
 * Verified by direct substitution; null if the construction fails (the explanation then shows only the support).
 */
export function catModel(premises: readonly Rel[], extra: readonly { rel: Rel; negate?: boolean }[]): Vals | null {
    const rels = [...premises, ...extra.map(e => (e.negate ? negRel(e.rel) : e.rel))];
    if (!catConsistent(rels)) return null;
    const c = close(rels)!;
    const seeds: number[] = [];
    for (let t = 0; t < 31; t++) if (c.terms & (1 << t)) seeds.push(1 << t);
    for (const r of rels) {
        if (r.kind === 'some') seeds.push((1 << idx(r.args[0])) | (1 << idx(r.args[1])));
        if (r.kind === 'some_not') seeds.push(1 << idx(r.args[0]));
    }
    const objs = seeds.map(s => { let m = 0; for (let t = 0; t < 31; t++) if (s & (1 << t)) m |= c.sub[t]; return m; });
    const vals = new Int32Array(1 + objs.length);
    vals[0] = objs.length;
    objs.forEach((o, i) => (vals[1 + i] = o));
    return rels.every(r => holdsCat(r, vals)) ? vals : null;
}

export function holdsCat(r: Rel, vals: ArrayLike<number>): boolean {
    const a = 1 << idx(r.args[0]);
    const b = 1 << idx(r.args[1]);
    const objs = Array.from({ length: vals[0] }, (_, i) => vals[1 + i]);
    switch (r.kind) {
        case 'all': return objs.every(o => !(o & a) || !!(o & b));
        case 'no': return objs.every(o => !(o & a) || !(o & b));
        case 'some': return objs.some(o => !!(o & a) && !!(o & b));
        case 'some_not': return objs.some(o => !!(o & a) && !(o & b));
        default: throw new Error('Unknown quantifier ' + r.kind);
    }
}

/** Proxy for log2(#models): ordered term pairs whose "all"/"some" relations are both undetermined. */
export function catLog2Models(premises: readonly Rel[], n: number): number {
    let free = 0;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        if (a === b) continue;
        const qa: Rel = { kind: 'all', args: ['e' + a, 'e' + b] };
        const qs: Rel = { kind: 'some', args: ['e' + a, 'e' + b] };
        try {
            if (catClassify(premises, qa) === 'undetermined' && catClassify(premises, qs) === 'undetermined') free++;
        } catch { return 0; }
    }
    return Math.min(16, free);
}

/** Woodworth–Sells atmosphere of a premise set. */
export function atmosphere(rels: readonly Rel[]): Quant {
    const negative = rels.some(r => r.kind === 'no' || r.kind === 'some_not');
    const particular = rels.some(r => r.kind === 'some' || r.kind === 'some_not');
    return negative ? (particular ? 'some_not' : 'no') : (particular ? 'some' : 'all');
}
