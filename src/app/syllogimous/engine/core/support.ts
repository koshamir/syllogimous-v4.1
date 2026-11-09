// Minimal support σ, non-locality and convergence (spec §4.4).

import { Answer, Premise, Query } from './types';
import { forEachCombination } from './combinatorics';
import { classifySubset, subsetProves } from './solve';
import { Rel, SolverPlugin, idx } from '../families/plugin';

/** Bit used for the "frame" pseudo-entity: unary absolute facts (end, pos, extreme) all touch it. */
const FRAME = 1 << 30;

export function entityMask(r: Rel): number {
    let m = 0;
    for (const a of r.args) m |= 1 << idx(a);
    if (r.args.length === 1) m |= FRAME;
    return m;
}

/** Premises in the hypergraph components that contain at least one query entity. */
export function componentOf(premises: readonly Rel[], q: Rel): number[] {
    const masks = premises.map(entityMask);
    let reach = 0;
    for (const a of q.args) reach |= 1 << idx(a);
    const inC = new Uint8Array(premises.length);
    let changed = true;
    while (changed) {
        changed = false;
        for (let i = 0; i < masks.length; i++) {
            if (!inC[i] && (masks[i] & reach)) { inC[i] = 1; reach |= masks[i]; changed = true; }
        }
    }
    const out: number[] = [];
    for (let i = 0; i < masks.length; i++) if (inC[i]) out.push(i);
    return out;
}

/** Is the union of these premises connected and does it contain all query entities? */
function connectsQuery(masks: readonly number[], sel: readonly number[], qMask: number): boolean {
    let reach = masks[sel[0]];
    const used = new Uint8Array(sel.length);
    used[0] = 1;
    let left = sel.length - 1;
    let changed = true;
    while (left > 0 && changed) {
        changed = false;
        for (let i = 1; i < sel.length; i++) {
            if (!used[i] && (masks[sel[i]] & reach)) { used[i] = 1; reach |= masks[sel[i]]; left--; changed = true; }
        }
    }
    return left === 0 && (reach & qMask) === qMask;
}

export interface SupportResult { size: number; idx: number[] }

/**
 * Smallest subset S with S ⊨ q (entailed) or S ⊨ ¬q (contradicted), searched by sizes 1…sigmaMax.
 * Only premises in the query's component are considered; a candidate subset must be connected and touch
 * every query entity (true for all families: absolute facts connect through the frame node).
 */
export function minimalSupport(plugin: SolverPlugin, premises: readonly Premise[], q: Query, answer: Answer, sigmaMax: number, nFull: number): SupportResult | null {
    if (answer === 'undetermined') return null;
    const comp = plugin.packed ? premises.map((_, i) => i) : componentOf(premises, q);
    const masks = premises.map(entityMask);
    let qMask = 0;
    for (const a of q.args) qMask |= 1 << idx(a);
    let found: number[] | null = null;
    for (let s = 1; s <= Math.min(sigmaMax, comp.length) && !found; s++) {
        forEachCombination(comp.length, s, sel => {
            const chosen = sel.map(i => comp[i]);
            if (plugin.packed) {
                // a packed world: the support may be disconnected (others occupy places), but it must mention
                // every query entity unless it holds an absolute fact — pinning all other n − 1 people to free
                // an unmentioned one needs far more than σ ≤ 5 premises
                let m = 0;
                for (const i of chosen) m |= masks[i];
                if ((m & qMask) !== qMask && !(m & FRAME)) return false;
            } else if (!connectsQuery(masks, chosen, qMask)) return false;
            if (subsetProves(plugin, chosen.map(i => premises[i]), q, answer, nFull)) { found = chosen.slice(); return true; }
            return false;
        });
    }
    return found ? { size: (found as number[]).length, idx: found } : null;
}

/** Premises mentioning at least one query entity. */
export function touchingQuery(premises: readonly Rel[], q: Rel): number[] {
    const qs = new Set(q.args);
    const out: number[] = [];
    premises.forEach((p, i) => { if (p.args.some(a => qs.has(a))) out.push(i); });
    return out;
}

/** classify() on the premises touching a conclusion entity. */
export function myopicAnswer(plugin: SolverPlugin, premises: readonly Rel[], q: Rel, nFull: number): Answer {
    const sub = touchingQuery(premises, q).map(i => premises[i]);
    return classifySubset(plugin, sub, q, nFull);
}

/** Convergence (§4.4): S is NOT a simple binary chain between conclusion entities. */
export function isConvergent(S: readonly Rel[], q: Rel): boolean {
    if (S.some(p => p.args.length !== 2)) return true;
    const deg = new Map<string, number>();
    for (const p of S) for (const a of p.args) deg.set(a, (deg.get(a) ?? 0) + 1);
    for (const d of deg.values()) if (d >= 3) return true;
    if (deg.size !== S.length + 1) return true;       // a cycle or a disconnected piece
    const ends = [...deg.entries()].filter(([, d]) => d === 1).map(([e]) => e);
    if (ends.length !== 2) return true;
    return !(q.args.includes(ends[0]) && q.args.includes(ends[1]));
}

/** Shortest path length (in premises) between two entities in the premise hypergraph; Infinity if none. */
export function hyperDistance(premises: readonly Rel[], a: string, b: string): number {
    if (a === b) return 0;
    let frontier = new Set([a]);
    const seen = new Set([a]);
    for (let d = 1; d <= premises.length; d++) {
        const next = new Set<string>();
        for (const p of premises) {
            if (!p.args.some(x => frontier.has(x))) continue;
            for (const x of p.args) {
                if (x === b) return d;
                if (!seen.has(x)) { seen.add(x); next.add(x); }
            }
        }
        if (next.size === 0) return Infinity;
        frontier = next;
    }
    return Infinity;
}

export { classifySubset };
