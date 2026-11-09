// «Аналогии» (spec §5.9). Query: «Отношение A к B такое же, как отношение C к D?» over a base world:
// groups — same/different side; order — sign; row — side AND distance; circle — clockwise distance;
// map — displacement vector.
//
// Construction (world first): each pair is joined by its own chain of exact links (σ ≥ 2 per pair, neither
// pair stated directly); the target answer is realised by the world (which pair relation equals which).
// "Unknown" uses the SAME structure with one chain link cut and re-attached elsewhere with the same kind, so
// premise-kind counts and the degrees of the four conclusion entities never reveal the class. The wording
// («такое же» / «отличается») and the base come from independent bags (stratification base × wording × answer).
//
// Every premise carries the hidden param `b` (base), so the custom solver can dispatch on any premise subset.

import { Rng } from '../core/rng';
import { Vals } from '../core/combinatorics';
import { classify as cspClassify, classifySubset, consistent as cspConsistent, log2Models as cspLog2, modelWith } from '../core/solve';
import { Answer, AnswerFormat, Bot, DraftItem, EngineOptions, FamilyId, LevelParams, LureType, Plan, Premise, Query } from '../core/types';
import { describeAnalogy, renderAnalogy } from '../render/ru/analogy';
import { Bound, closure, codeBound, codeOf, dcsConsistent, dcsLog2Models, dcsSample, range } from './dcs';
import { preferredDir } from './direction';
import { LADDER_CONFIG } from '../difficulty/ladder';
import { groupsPlugin } from './groups';
import { linearPlugin, orderNumPlugin, orderTimePlugin } from './order';
import { circularPlugin } from './circular';
import { dir2dPlugin } from './direction';
import { AnyPlugin, Construction, CustomSolver, FamilyPlugin, LureContext, Rel, SolverPlugin, eid, idx } from './plugin';

export type AnaBase = 'groups' | 'orderNum' | 'orderTime' | 'linear' | 'circular' | 'dir2d';
export const ANALOGY_BASES: AnaBase[] = ['groups', 'orderNum', 'orderTime', 'linear', 'circular', 'dir2d'];

const BASE_PLUGIN: Record<AnaBase, AnyPlugin> = {
    groups: groupsPlugin as AnyPlugin,
    orderNum: orderNumPlugin as AnyPlugin,
    orderTime: orderTimePlugin as AnyPlugin,
    linear: linearPlugin as AnyPlugin,
    circular: circularPlugin as AnyPlugin,
    dir2d: dir2dPlugin as AnyPlugin,
};

/** Entity caps per base (exhaustive solvers: permutations for the row and the table). */
const MAX_N: Record<AnaBase, number> = { groups: 12, orderNum: 11, orderTime: 11, linear: 10, circular: 9, dir2d: 12 };
const DIR_AXES = ['x', 'y'] as const;

const mod = (x: number, n: number) => ((x % n) + n) % n;

export const baseOfQuery = (q: Rel): AnaBase => String(q.params?.['b'] ?? 'groups') as AnaBase;
const baseOf = (rels: readonly Rel[], q?: Rel): AnaBase => {
    if (q?.params?.['b']) return baseOfQuery(q);
    for (const r of rels) if (r.params?.['b']) return String(r.params['b']) as AnaBase;
    return 'groups';
};
export const wordingOf = (q: Rel): 'same' | 'diff' => (q.params?.['w2'] === 'diff' ? 'diff' : 'same');

/** Are the two pair relations equal in this assignment? (dir2d: layout vals[e*3 + axis]) */
export function analogSame(base: AnaBase, v: ArrayLike<number>, a: number, b: number, c: number, d: number, size: number): boolean {
    switch (base) {
        case 'groups': return (v[a] ^ v[b]) === (v[c] ^ v[d]);
        case 'orderNum':
        case 'orderTime': return Math.sign(v[a] - v[b]) === Math.sign(v[c] - v[d]);
        case 'linear': return v[a] - v[b] === v[c] - v[d];
        case 'circular': return mod(v[a] - v[b], size) === mod(v[c] - v[d], size);
        case 'dir2d':
            return v[a * 3] - v[b * 3] === v[c * 3] - v[d * 3] && v[a * 3 + 1] - v[b * 3 + 1] === v[c * 3 + 1] - v[d * 3 + 1];
    }
}

function compileAnalog(rel: Rel, vars: number[], size: number): (v: Vals) => boolean {
    const base = baseOfQuery(rel);
    const same = wordingOf(rel) === 'same';
    const [a, b, c, d] = vars;
    return v => analogSame(base, v, a, b, c, d, size) === same;
}

const wrapped = new Map<AnaBase, SolverPlugin>();
/** The base family's finite-domain solver extended with the 4-ary analogy relation. */
function cspFor(base: AnaBase): SolverPlugin {
    let s = wrapped.get(base);
    if (!s) {
        const bp = BASE_PLUGIN[base];
        s = {
            supportDomain: 'restricted',
            packed: bp.packed,
            domain: bp.domain,
            compile: (rel, vars, size) => (rel.kind === 'analog' ? compileAnalog(rel, vars, size) : bp.compile(rel, vars, size)),
        };
        wrapped.set(base, s);
    }
    return s;
}

// ---------------------------------------------------------------- exact special cases

/** Order bases with «больше» premises only: a sign pattern is realisable iff the graph stays acyclic (relative ranks). */
function acyclic(nodes: number, edges: readonly [number, number][]): boolean {
    const indeg = new Int32Array(nodes);
    const out: number[][] = Array.from({ length: nodes }, () => []);
    for (const [u, v] of edges) { out[u].push(v); indeg[v]++; }
    const st: number[] = [];
    for (let i = 0; i < nodes; i++) if (!indeg[i]) st.push(i);
    let seen = 0;
    while (st.length) {
        const u = st.pop()!;
        seen++;
        for (const v of out[u]) if (--indeg[v] === 0) st.push(v);
    }
    return seen === nodes;
}

function orderFast(premises: readonly Rel[], q: Rel): Answer | null {
    if (!premises.every(r => r.kind === 'gt')) return null;
    let nodes = 0;
    for (const r of [...premises, q]) for (const a of r.args) nodes = Math.max(nodes, idx(a) + 1);
    const base: [number, number][] = premises.map(r => [idx(r.args[0]), idx(r.args[1])]);
    if (!acyclic(nodes, base)) throw new Error('Inconsistent premises');
    const [A, B, C, D] = q.args.map(idx);
    const ok = (extra: [number, number][]) => acyclic(nodes, [...base, ...extra]);
    const canSame = ok([[A, B], [C, D]]) || ok([[B, A], [D, C]]);
    const canDiff = ok([[A, B], [D, C]]) || ok([[B, A], [C, D]]);
    return verdict(wordingOf(q), canSame, canDiff);
}

function verdict(w: 'same' | 'diff', canSame: boolean, canDiff: boolean): Answer {
    const canT = w === 'same' ? canSame : canDiff;
    const canF = w === 'same' ? canDiff : canSame;
    if (!canT && !canF) throw new Error('Inconsistent premises');
    return canT && canF ? 'undetermined' : canT ? 'entailed' : 'contradicted';
}

/** Map base: per axis, difference constraints; the four-variable equality is decided by enumerating x_A − x_B. */
interface AxisPoss { eq: number | null; neq: [number, number] | null }

function axisBounds(rels: readonly Rel[], ax: 'x' | 'y', map: Map<number, number>): Bound[] {
    const out: Bound[] = [];
    for (const r of rels) {
        if (r.kind !== 'dir') continue;
        const b = codeBound(map.get(idx(r.args[0]))!, map.get(idx(r.args[1]))!, codeOf(r, ax));
        if (b) out.push(b);
    }
    return out;
}

function axisPossibilities(bounds: readonly Bound[], m: number, A: number, B: number, C: number, D: number): AxisPoss | null {
    const base = closure(m, bounds);
    if (!base) return null;
    let W = 2;
    for (const b of bounds) W += Math.abs(b.lo ?? 0) + Math.abs(b.hi ?? 0);
    const [lo0, hi0] = range(base, m, A, B);
    const from = Math.max(-W, lo0);
    const to = Math.min(W, hi0);
    let eq: number | null = null;
    let neq: [number, number] | null = null;
    for (let u = from; u <= to && (eq === null || neq === null); u++) {
        const d = closure(m, [...bounds, { a: A, b: B, lo: u, hi: u }]);
        if (!d) continue;
        const [lo, hi] = range(d, m, C, D);
        if (eq === null && lo <= u && u <= hi) eq = u;
        if (neq === null && !(lo === u && hi === u)) {
            const v = u + 1 <= hi ? u + 1 : u - 1 >= lo ? u - 1 : lo !== u ? lo : hi;
            neq = [u, v];
        }
    }
    return { eq, neq };
}

function dirLocal(rels: readonly Rel[], n: number, full: boolean): { map: Map<number, number>; m: number } {
    const map = new Map<number, number>();
    if (full) { for (let i = 0; i < n; i++) map.set(i, i); return { map, m: n }; }
    for (const r of rels) for (const a of r.args) if (!map.has(idx(a))) map.set(idx(a), map.size);
    return { map, m: map.size };
}

function dirPoss(premises: readonly Rel[], q: Rel, n: number, full: boolean): AxisPoss[] {
    const { map, m } = dirLocal([...premises, q], n, full);
    const [A, B, C, D] = q.args.map(a => map.get(idx(a))!);
    return DIR_AXES.map(ax => {
        const p = axisPossibilities(axisBounds(premises, ax, map), m, A, B, C, D);
        if (!p) throw new Error('Inconsistent direction premises');
        return p;
    });
}

function dirClassify(premises: readonly Rel[], q: Rel, n: number, full: boolean): Answer {
    const ps = dirPoss(premises, q, n, full);
    return verdict(wordingOf(q), ps.every(p => p.eq !== null), ps.some(p => p.neq !== null));
}

function dirModel(premises: readonly Rel[], extra: readonly { rel: Rel; negate?: boolean }[], n: number, rng?: Rng): Vals | null {
    const map = new Map<number, number>();
    for (let i = 0; i < 64; i++) map.set(i, i);
    const perAxis = DIR_AXES.map(ax => axisBounds(premises, ax, map));
    const e = extra.find(x => x.rel.kind === 'analog');
    if (!e) return dcsSample(DIR_AXES, n, perAxis, rng);
    const wantSame = (wordingOf(e.rel) === 'same') !== !!e.negate;
    const ps = dirPoss(premises, e.rel, n, true);
    const [A, B, C, D] = e.rel.args.map(idx);
    const fix = (i: number, u: number, v: number) => {
        perAxis[i] = [...perAxis[i], { a: A, b: B, lo: u, hi: u }, { a: C, b: D, lo: v, hi: v }];
    };
    if (wantSame) {
        if (ps.some(p => p.eq === null)) return null;
        ps.forEach((p, i) => fix(i, p.eq!, p.eq!));
    } else {
        const i = ps.findIndex(p => p.neq !== null);
        if (i < 0) return null;
        fix(i, ps[i].neq![0], ps[i].neq![1]);
    }
    return dcsSample(DIR_AXES, n, perAxis, rng);
}

// ---------------------------------------------------------------- custom solver (dispatch on the base)

const custom: CustomSolver = {
    classify(premises, q, n, full) {
        const base = baseOf(premises, q);
        if (base === 'dir2d') return dirClassify(premises, q, n, full);
        if (base === 'orderNum' || base === 'orderTime') {
            const f = orderFast(premises, q);
            if (f) return f;
        }
        return full ? cspClassify(cspFor(base), premises, q, n) : classifySubset(cspFor(base), premises, q, n);
    },
    consistent(premises, n) {
        const base = baseOf(premises);
        return base === 'dir2d' ? dcsConsistent(DIR_AXES, premises, n) : cspConsistent(cspFor(base), premises, n);
    },
    model(premises, extra, n, rng) {
        const base = baseOf(premises, extra[0]?.rel);
        if (base === 'dir2d') return dirModel(premises, extra, n, rng);
        return modelWith(cspFor(base), premises, extra, n, { rng });
    },
    log2Models(premises, n) {
        const base = baseOf(premises);
        return base === 'dir2d' ? dcsLog2Models(DIR_AXES, premises, n) : cspLog2(cspFor(base), premises, n);
    },
};

// ---------------------------------------------------------------- construction

interface AnaWorld { base: AnaBase; v: number[] }

const tag = (base: AnaBase, r: Premise): Premise => ({ ...r, params: { ...(r.params ?? {}), b: base } });

/** Kinds that determine the pair relation exactly (chain links) and weak ones (distractors only). */
function exactLink(base: AnaBase, rng: Rng, w: AnaWorld, n: number, u: number, x: number): Premise | null {
    const v = w.v;
    switch (base) {
        case 'groups': return { kind: v[u] === v[x] ? 'same' : 'opp', args: rng.chance(0.5) ? [eid(u), eid(x)] : [eid(x), eid(u)] };
        case 'orderNum':
        case 'orderTime': return v[u] > v[x] ? { kind: 'gt', args: [eid(u), eid(x)] } : { kind: 'gt', args: [eid(x), eid(u)] };
        case 'linear': {
            const [l, r] = v[u] < v[x] ? [u, x] : [x, u];
            const k = Math.abs(v[u] - v[x]);
            return k === 1 ? { kind: 'immLeft', args: [eid(l), eid(r)] } : { kind: 'steps', args: [eid(l), eid(r)], params: { k } };
        }
        case 'circular': {
            const d = mod(v[u] - v[x], n);
            if (d === 1) return rng.chance(0.5) ? { kind: 'immLeft', args: [eid(u), eid(x)] } : { kind: 'immRight', args: [eid(x), eid(u)] };
            if (d === n - 1) return rng.chance(0.5) ? { kind: 'immLeft', args: [eid(x), eid(u)] } : { kind: 'immRight', args: [eid(u), eid(x)] };
            return null;
        }
        case 'dir2d': {
            const dx = v[u * 2] - v[x * 2];
            const dy = v[u * 2 + 1] - v[x * 2 + 1];
            if (!dx && !dy) return null;
            const t = Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && rng.chance(0.3) ? 'adj' : 'exact';
            return { kind: 'dir', args: [eid(u), eid(x)], params: { t, x: dx, y: dy } };
        }
    }
}

function weakLink(base: AnaBase, rng: Rng, w: AnaWorld, n: number, u: number, x: number): Premise | null {
    const v = w.v;
    switch (base) {
        case 'groups':
        case 'orderNum':
        case 'orderTime': return exactLink(base, rng, w, n, u, x);
        case 'linear': {
            const k = Math.abs(v[u] - v[x]);
            const [l, r] = v[u] < v[x] ? [u, x] : [x, u];
            const opts: Premise[] = [{ kind: 'left', args: [eid(l), eid(r)] }];
            if (k === 1) opts.push({ kind: 'adj', args: [eid(u), eid(x)] });
            else { opts.push({ kind: 'notAdj', args: [eid(u), eid(x)] }); opts.push({ kind: 'dist', args: [eid(u), eid(x)], params: { k: k - 1 } }); }
            return rng.pick(opts);
        }
        case 'circular': {
            const d = mod(v[u] - v[x], n);
            const s = Math.min(d, n - d);
            if (s === 1) return { kind: 'adj', args: [eid(u), eid(x)] };
            return rng.chance(0.5) ? { kind: 'notAdj', args: [eid(u), eid(x)] } : { kind: 'gap', args: [eid(u), eid(x)], params: { k: s - 1 } };
        }
        case 'dir2d': {
            const dx = v[u * 2] - v[x * 2];
            const dy = v[u * 2 + 1] - v[x * 2 + 1];
            if (!dx && !dy) return null;
            const code = (d: number) => (d > 0 ? 'g' : d < 0 ? 'l' : 0);
            const params: Record<string, number | string> = { t: 'qual' };
            const which = rng.int(3);
            if (dx && (which !== 1 || !dy)) params['x'] = code(dx);
            if (dy && (which !== 0 || !dx)) params['y'] = code(dy);
            if (which === 2 && dx && dy) { params['x'] = code(dx); params['y'] = code(dy); }
            return { kind: 'dir', args: [eid(u), eid(x)], params };
        }
    }
}

/** Row only: «левее» or «не рядом» (true in the world). */
function looseLink(rng: Rng, w: AnaWorld, u: number, x: number): Premise {
    const v = w.v;
    const [l, r] = v[u] < v[x] ? [u, x] : [x, u];
    if (Math.abs(v[u] - v[x]) > 1 && rng.chance(0.5)) return { kind: 'notAdj', args: rng.chance(0.5) ? [eid(u), eid(x)] : [eid(x), eid(u)] };
    return { kind: 'left', args: [eid(l), eid(r)] };
}

/** Per-pair chain lengths (σ of each pair) at these params. */
export function chainRange(base: AnaBase, p: LevelParams): [number, number] {
    const hiCap = base === 'circular' ? 3 : base === 'linear' ? 3 : 4;
    const sMin = LADDER_CONFIG.sigmaMin(p.level);
    const sMax = sMin + LADDER_CONFIG.sigmaMaxExtra(p.level);
    const lo = Math.min(hiCap, Math.max(2, sMin - 1));
    const hi = Math.min(hiCap, Math.max(lo, sMax - 1));
    return [lo, hi];
}

function sampleWorld(base: AnaBase, rng: Rng, n: number, A: number, B: number, C: number, D: number,
    chains: number[][], wantSame: boolean | null, cSub: 'rev' | 'near' | 'other'): AnaWorld | null {
    const v: number[] = new Array(base === 'dir2d' ? 2 * n : n).fill(0);
    switch (base) {
        case 'groups': {
            for (let i = 0; i < n; i++) v[i] = rng.int(2);
            if (wantSame !== null) v[D] = v[C] ^ v[A] ^ v[B] ^ (wantSame ? 0 : 1);
            return { base, v };
        }
        case 'orderNum':
        case 'orderTime': {
            const perm = rng.shuffle(Array.from({ length: n }, (_, i) => i));
            for (let i = 0; i < n; i++) v[i] = perm[i];
            const dir1 = rng.chance(0.5) ? 1 : -1;
            const dir2 = wantSame === null ? (rng.chance(0.5) ? 1 : -1) : wantSame ? dir1 : -dir1;
            [chains[0], chains[1]].forEach((ch, j) => {
                const ranks = ch.map(e => v[e]).sort((a, b) => a - b);
                if ((j === 0 ? dir1 : dir2) < 0) ranks.reverse();
                ch.forEach((e, i) => (v[e] = ranks[i]));
            });
            return { base, v };
        }
        case 'linear': {
            // chains are short walks (steps of 1–2 places): rigid wide blocks would pin each other in the packed row
            for (let t = 0; t < 200; t++) {
                const pos = new Array(n).fill(-1);
                const taken = new Set<number>();
                let ok = true;
                for (const ch of chains) {
                    let cur = rng.int(n);
                    for (let tries = 0; tries < 20 && taken.has(cur); tries++) cur = rng.int(n);
                    if (taken.has(cur)) { ok = false; break; }
                    pos[ch[0]] = cur; taken.add(cur);
                    for (let i = 1; i < ch.length && ok; i++) {
                        const steps = rng.shuffle([-2, -1, 1, 2]).map(s => cur + s).filter(x => x >= 0 && x < n && !taken.has(x));
                        if (!steps.length) { ok = false; break; }
                        cur = steps[0];
                        pos[ch[i]] = cur; taken.add(cur);
                    }
                }
                if (!ok) continue;
                const free = rng.shuffle(Array.from({ length: n }, (_, i) => i).filter(x => !taken.has(x)));
                for (let e = 0; e < n; e++) if (pos[e] < 0) pos[e] = free.pop()!;
                const dAB = pos[A] - pos[B];
                const dCD = pos[C] - pos[D];
                let good = wantSame === null || (wantSame ? dAB === dCD : dAB !== dCD);
                if (good && wantSame === false && t < 120) {
                    good = cSub === 'rev' ? dCD === -dAB : cSub === 'near' ? Math.abs(dCD - dAB) === 1 && Math.sign(dCD) === Math.sign(dAB) : true;
                }
                if (!good) continue;
                for (let e = 0; e < n; e++) v[e] = pos[e];
                return { base, v };
            }
            return null;
        }
        case 'circular': {
            // two runs of consecutive seats: AB = chains[0], CD = chains[1]; free people fill the gaps
            const [r1, r2] = chains;
            const free = Array.from({ length: n }, (_, i) => i).filter(e => !r1.includes(e) && !r2.includes(e));
            rng.shuffle(free);
            const g1 = free.length ? rng.int(free.length + 1) : 0;
            const dir1 = rng.chance(0.5);
            const dir2 = wantSame === null ? rng.chance(0.5) : wantSame ? dir1 : !dir1;
            const seq = [...(dir1 ? r1 : r1.slice().reverse()), ...free.slice(0, g1), ...(dir2 ? r2 : r2.slice().reverse()), ...free.slice(g1)];
            const rot = rng.int(n);
            seq.forEach((e, i) => (v[e] = mod(i + rot, n)));
            return { base, v };
        }
        case 'dir2d': {
            const P = (e: number, x: number, y: number) => { v[e * 2] = x; v[e * 2 + 1] = y; };
            const same = (a: number, b: number) => v[a * 2] === v[b * 2] && v[a * 2 + 1] === v[b * 2 + 1];
            for (let t = 0; t < 60; t++) {
                for (let e = 0; e < n; e++) P(e, rng.int(4), rng.int(4));
                if (wantSame !== null) {
                    const ax = v[A * 2] - v[B * 2];
                    const ay = v[A * 2 + 1] - v[B * 2 + 1];
                    let [cx, cy] = [ax, ay];
                    if (!wantSame) {
                        if (cSub === 'rev' && (ax || ay)) [cx, cy] = [-ax, -ay];
                        else if (cSub === 'near' || !(ax || ay)) { if (rng.chance(0.5)) cx += rng.chance(0.5) ? 1 : -1; else cy += rng.chance(0.5) ? 1 : -1; }
                        else { cx += rng.int(3) - 1; cy += rng.chance(0.5) ? 2 : -2; }
                    }
                    P(D, v[C * 2] - cx, v[C * 2 + 1] - cy);       // C − D = (cx, cy)
                }
                if (chains.every(ch => ch.every((e, i) => i === 0 || !same(e, ch[i - 1])))) return { base, v };
            }
            return null;
        }
    }
}

interface Link { prem: Premise; u: number; x: number; chain: number }

/**
 * "Unknown": one chain link is removed and a link of the same kind is added between an endpoint of the cut
 * link and an entity that is not reachable from the other fragment (so the pair becomes disconnected).
 * A conclusion endpoint keeps its degree. In the packed table only seat neighbours can be linked exactly,
 * so there the cut is at a chain end next to a free seat.
 */
function cutAndReattach(base: AnaBase, rng: Rng, w: AnaWorld, n: number, links: readonly Link[], premises: readonly Premise[],
    qset: Set<number>, chains: number[][]): { at: number; prem: Premise } | null {
    const touchesQ = (l: Link) => qset.has(l.u) || qset.has(l.x);
    let order = rng.shuffle(links.slice());
    order = base === 'circular' ? [...order.filter(touchesQ), ...order.filter(l => !touchesQ(l))]
        : [...order.filter(l => !touchesQ(l)), ...order.filter(touchesQ)];
    for (const cut of order) {
        const ch = chains[cut.chain];
        const pos = Math.min(ch.indexOf(cut.u), ch.indexOf(cut.x));
        const fragA = new Set(ch.slice(0, pos + 1));
        const fragB = new Set(ch.slice(pos + 1));
        const keeps = qset.has(cut.u) ? [cut.u] : qset.has(cut.x) ? [cut.x] : rng.shuffle([cut.u, cut.x]);
        for (const keep of keeps) {
            const reach = new Set<number>(fragA.has(keep) ? fragB : fragA);
            let grown = true;
            while (grown) {
                grown = false;
                for (const r of premises) {
                    if (r === cut.prem) continue;
                    const ids = r.args.map(idx);
                    if (ids.some(x => reach.has(x)) && ids.some(x => !reach.has(x))) { ids.forEach(x => reach.add(x)); grown = true; }
                }
            }
            const cand = rng.shuffle(Array.from({ length: n }, (_, i) => i).filter(e => e !== keep && !reach.has(e) && !qset.has(e)
                && !premises.some(r => r !== cut.prem && r.args.includes(eid(e)) && r.args.includes(eid(keep)))));
            let any: Premise | null = null;
            for (const t of cand) {
                const pr = exactLink(base, rng, w, n, keep, t);
                if (!pr) continue;
                if (pr.kind === cut.prem.kind) return { at: premises.indexOf(cut.prem), prem: pr };
                any = any ?? pr;
            }
            if (any) return { at: premises.indexOf(cut.prem), prem: any };
        }
    }
    return null;
}

function construct(rng: Rng, p: LevelParams, plan: Plan): Construction<AnaWorld> | null {
    const base = (plan.cue['base'] ?? 'groups') as AnaBase;
    const w2 = (plan.cue['w2'] ?? 'same') as 'same' | 'diff';
    const target = plan.target;
    const [lo, hi] = chainRange(base, p);
    let k1 = lo + rng.int(hi - lo + 1);
    let k2 = lo + rng.int(hi - lo + 1);
    if (base === 'circular') k2 = k1;
    if (p.requireNonLocal && Math.max(k1, k2) < 3) { if (base === 'circular') { k1 = 3; k2 = 3; } else if (rng.chance(0.5)) k1 = 3; else k2 = 3; }
    const core = k1 + k2 + 2;
    // packed worlds need a free person next to a chain end for the "Unknown" re-attachment (all classes alike)
    const minPend = base === 'linear' ? 2 : base === 'circular' ? 1 : 0;
    // (the row has a spare link between its first two pendants)
    const pend = Math.max(minPend, Math.min(p.distractors, MAX_N[base] - core));
    const n = core + pend;
    if (n > MAX_N[base]) return null;
    const chainAB = Array.from({ length: k1 + 1 }, (_, i) => i);
    const chainCD = Array.from({ length: k2 + 1 }, (_, i) => k1 + 1 + i);
    const A = 0, B = k1, C = k1 + 1, D = k1 + 1 + k2;
    const wantSame = target === 'undetermined' ? null : (target === 'entailed') === (w2 === 'same');
    const cSub = (['rev', 'near', 'other'] as const)[rng.int(3)];
    const w = sampleWorld(base, rng, n, A, B, C, D, [chainAB, chainCD], wantSame, cSub);
    if (!w) return null;

    const links: Link[] = [];
    for (const [ci, ch] of [chainAB, chainCD].entries()) {
        for (let i = 0; i < ch.length - 1; i++) {
            const pr = exactLink(base, rng, w, n, ch[i], ch[i + 1]);
            if (!pr) return null;
            links.push({ prem: pr, u: ch[i], x: ch[i + 1], chain: ci });
        }
    }
    const qset = new Set([A, B, C, D]);
    const premises: Premise[] = links.map(l => l.prem);
    // pendant distractors: each new entity hangs on a non-conclusion entity (trees: no shortcuts)
    const pendants = Array.from({ length: pend }, (_, i) => core + i);
    const hosts = [...chainAB, ...chainCD].filter(e => !qset.has(e));
    const attached: number[] = [];
    const row = base === 'linear';
    for (const e of pendants) {
        const cand = [...hosts, ...attached];
        let pr: Premise | null = null;
        for (let t = 0; t < 8 && !pr; t++) {
            const host = rng.pick(cand);
            // the packed row: pendants stay loose (left / not adjacent), otherwise exact links pin the whole row
            pr = row ? looseLink(rng, w, e, host) : rng.chance(0.5) ? weakLink(base, rng, w, n, e, host) : exactLink(base, rng, w, n, e, host);
        }
        if (!pr) return null;
        premises.push(pr);
        attached.push(e);
    }
    // the row: a spare link between the first two pendants — loose here, exact in "Unknown" (same kind counts)
    let spareAt = -1;
    if (row) {
        if (pendants.length < 2) return null;
        spareAt = premises.length;
        premises.push(looseLink(rng, w, pendants[0], pendants[1]));
    }
    const swap = rng.chance(0.5);
    const query: Query = {
        kind: 'analog',
        args: swap ? [C, D, A, B].map(eid) : [A, B, C, D].map(eid),
        params: { b: base, w2, q: `${base}:${w2}` },
    };
    const isU = (prem: Premise[]) => {
        try { return custom.classify(prem.map(r => tag(base, r)), query, n, true) === 'undetermined'; } catch { return false; }
    };
    if (target === 'undetermined') {
        let done = false;
        if (row) {
            // a cut fragment is pinned by the others in a packed row, so one chain link is loosened instead and the
            // spare pendant link becomes exact (the pendant pair still floats as one block); the first candidate
            // link that really leaves the analogy open is used
            const exact = exactLink(base, rng, w, n, pendants[0], pendants[1]);
            if (!exact) return null;
            premises[spareAt] = exact;
            for (const l of rng.shuffle(links.slice())) {
                const at = premises.indexOf(l.prem);
                premises[at] = looseLink(rng, w, l.u, l.x);
                if (isU(premises)) { done = true; break; }
                premises[at] = l.prem;
            }
        } else {
            // cut one link of one chain; re-attach the same kind elsewhere (degrees of A, B, C, D unchanged)
            for (let t = 0; t < 4 && !done; t++) {
                const repl = cutAndReattach(base, rng, w, n, links, premises, qset, [chainAB, chainCD]);
                if (!repl) break;
                const old = premises[repl.at];
                premises[repl.at] = repl.prem;
                if (base !== 'circular' || isU(premises)) done = true;
                else premises[repl.at] = old;
            }
        }
        if (!done) return null;
    }
    const tagged = premises.map(r => tag(base, r));
    return { world: w, premises: rng.shuffle(tagged), queries: [query], n };
}

// ---------------------------------------------------------------- plugin

function preferred(premises: readonly Rel[], n: number): Vals {
    const base = baseOf(premises);
    if (base === 'dir2d') return preferredDir(DIR_AXES, premises, n);
    return BASE_PLUGIN[base].preferredModel(premises as Premise[], n);
}

const holds = (q: Rel, vals: Vals, n: number) => compileAnalog(q, q.args.map(idx), n)(vals);

function lure(ctx: LureContext): LureType {
    const { premises, query: q, answer, n } = ctx;
    if (answer === 'undetermined') return holds(q, preferred(premises, n), n) ? 'possible' : 'none';
    if (answer !== 'contradicted') return 'none';
    const base = baseOfQuery(q);
    if (base === 'groups' || base === 'orderNum' || base === 'orderTime') return 'reversal';
    // contradicted: is the second relation the reverse of the first, or the same direction at another distance?
    const m = custom.model(premises, [], n);
    if (!m) return 'none';
    const [a, b, c, d] = q.args.map(idx);
    if (base === 'dir2d') {
        const ab = [m[a * 3] - m[b * 3], m[a * 3 + 1] - m[b * 3 + 1]];
        const cd = [m[c * 3] - m[d * 3], m[c * 3 + 1] - m[d * 3 + 1]];
        if (ab[0] === -cd[0] && ab[1] === -cd[1]) return 'reversal';
        return Math.abs(ab[0] - cd[0]) + Math.abs(ab[1] - cd[1]) === 1 ? 'nearMiss' : 'none';
    }
    const ab = base === 'circular' ? mod(m[a] - m[b], n) : m[a] - m[b];
    const cd = base === 'circular' ? mod(m[c] - m[d], n) : m[c] - m[d];
    if (base === 'circular') return ab === mod(-cd, n) ? 'reversal' : 'none';
    if (ab === -cd) return 'reversal';
    return Math.sign(ab) === Math.sign(cd) && Math.abs(ab - cd) === 1 ? 'nearMiss' : 'none';
}

/** Premises containing two conclusion entities of one pair (never built; the bot abstains otherwise). */
function cooccurrenceBot(d: DraftItem): Answer | null {
    const [a, b, c, e] = d.query.args;
    const both = (x: string, y: string) => d.premises.some(r => r.args.includes(x) && r.args.includes(y));
    const ab = both(a, b);
    const cd = both(c, e);
    if (!ab && !cd) return 'undetermined';
    return ab && cd ? 'entailed' : 'contradicted';
}

/** Chains of equal visible length ⇒ "same". */
function chainLengthBot(d: DraftItem): Answer | null {
    const [a, b, c, e] = d.query.args;
    const dist = (x: string, y: string) => {
        let front = new Set([x]);
        const seen = new Set([x]);
        for (let s = 1; s <= d.premises.length; s++) {
            const next = new Set<string>();
            for (const r of d.premises) if (r.args.some(z => front.has(z))) for (const z of r.args) if (!seen.has(z)) { seen.add(z); next.add(z); }
            if (next.has(y)) return s;
            if (!next.size) return -1;
            front = next;
        }
        return -1;
    };
    const d1 = dist(a, b);
    const d2 = dist(c, e);
    if (d1 < 0 || d2 < 0) return 'undetermined';
    const same = d1 === d2;
    return same === (wordingOf(d.query) === 'same') ? 'entailed' : 'contradicted';
}

const bots: Bot[] = [
    { id: 'cooccurrence', predict: cooccurrenceBot },
    // not a surface cue: it traces the premise graph (a structural strategy), reported only
    { id: 'chainLength', predict: chainLengthBot, gated: false },
];

/**
 * Bases available at a (planning) level. The round table only below the non-locality levels: with ≤ 9 seats a
 * chain of seat neighbours is a run, and the orientation of its end links already decides "same / different".
 */
export function analogyBases(o?: Partial<EngineOptions>, planningLevel = 1): AnaBase[] {
    const circleOk = planningLevel + (LADDER_CONFIG.jitterHi - LADDER_CONFIG.jitterLo) < LADDER_CONFIG.nonLocalFrom;
    const all = ANALOGY_BASES.filter(b => b !== 'circular' || circleOk);
    const en = o?.families?.filter((f): f is AnaBase => (all as FamilyId[]).includes(f)) ?? [];
    return en.length ? en : all;
}

export const analogyPlugin: FamilyPlugin<AnaWorld> = {
    id: 'analogy',
    formats: ['ternary', 'binary'],
    limits: { minEntities: 6, maxEntities: 12 },
    supportDomain: 'restricted',
    custom,
    packed: true,
    domain: () => ({ size: 0, allDiff: false }),
    compile: (rel, vars, size) => {
        if (rel.kind === 'analog') return compileAnalog(rel, vars, size);
        return BASE_PLUGIN[baseOf([rel])].compile(rel, vars, size);
    },
    adjust(p: LevelParams, _o: EngineOptions, plan: Plan): LevelParams {
        const q = { ...p };
        const base = (plan.cue['base'] ?? 'groups') as AnaBase;
        const [, hi] = chainRange(base, p);
        // two chains (σ ≥ 2 each): the total support of a determined analogy is 4 … 2·hi
        q.sigmaMin = 4;
        q.sigmaMax = Math.max(4, 2 * hi);
        q.pConvergent = 0;            // two separate chains: isConvergent() holds by construction
        q.requireConvergent = false;
        q.n = Math.min(MAX_N[base], q.n);
        return q;
    },
    cueSpace: (p: LevelParams, _f: AnswerFormat, o?: Partial<EngineOptions>) => ({ base: analogyBases(o, p.level), w2: ['same', 'diff'] }),
    uncontrolledLures: ['possible'],
    supportedLures: p => p.lureMix.filter(l => l !== 'surface'),
    construct: (rng, p, plan) => construct(rng, p, plan),
    statedDirectly: (q, premises) => {
        const [a, b, c, d] = q.args;
        return premises.some(r => (r.args.includes(a) && r.args.includes(b)) || (r.args.includes(c) && r.args.includes(d)));
    },
    lureOf: lure,
    preferredModel: preferred,
    cueMatches: (cue, _premises, q) => (!cue['base'] || q.params?.['b'] === cue['base']) && (!cue['w2'] || q.params?.['w2'] === cue['w2']),
    describe: (vals, names, query) => {
        const base = baseOfQuery(query!);
        return describeAnalogy(BASE_PLUGIN[base].describe(vals, names), names, query!);
    },
    render: (d, rng) => {
        const base = baseOfQuery(d.query);
        const p0 = d.premises[0];
        const params = { ...(p0.params ?? {}) };
        delete params['inv'];
        const stub: DraftItem = { ...d, query: { kind: p0.kind, args: p0.args, params } };
        return renderAnalogy(base, d, BASE_PLUGIN[base].render(stub, rng));
    },
    decorate: (d, rng, p) => {
        const q = d.query;
        BASE_PLUGIN[baseOfQuery(q)].decorate(d, rng, p);
        d.query = { ...q, params: { ...(q.params ?? {}), w: rng.int(2) } };
    },
    invertible: kind => kind !== 'analog',
    bots,
    features: d => ({
        sameWording: wordingOf(d.query) === 'same' ? 1 : 0,
        cooc: cooccurrenceBot(d) === 'undetermined' ? 0 : 1,
    }),
};

export const analogyBasePlugin = (b: AnaBase): AnyPlugin => BASE_PLUGIN[b];
export { custom as analogySolver };
