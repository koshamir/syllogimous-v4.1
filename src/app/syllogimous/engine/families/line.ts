// Shared core of the "line" families: orderNum, orderTime (§5.2) and linear (§5.4).
// World: distinct positions 0…n-1 (rank for order families, left→right for linear).
//
// Construction (spec §4.3 / §2.4): the designed conclusion pair is joined by a chain of "segments"
// (oriented links and runs of «между» closed by one oriented link). The "Unknown" class uses the SAME
// structure with one segment flipped or one «между» folded, so premise-kind counts never reveal the class.
// Bot opinions (win count, mention count) are steered to values drawn independently of the target by
// pendant premises with free entities that are local extrema (they never create shortcuts).

import { Rng } from '../core/rng';
import { Vals, search } from '../core/combinatorics';
import { allIds, buildCsp, classify, classifySubset, modelWith, models } from '../core/solve';
import {
    Answer, AnswerFormat, DraftItem, EngineOptions, LevelParams, LureType, Plan, Premise, Query,
} from '../core/types';
import { ChoiceConstruction, Construction, DomainSpec, LureContext, Rel, eid, idx } from './plugin';

export type LineId = 'orderNum' | 'orderTime' | 'linear';

export const ORIENTED = new Set(['gt', 'left', 'succ', 'immLeft', 'steps']);
const ABSOLUTE = new Set(['extreme', 'end', 'notEnd', 'pos']);
const ORDER_POSITIONAL = new Set(['succ', 'gap', 'extreme']);

/** Relation "type" used by statedDirectly: same entity set + same type = stated. */
const REL_TYPE: Record<string, string> = {
    gt: 'ord', left: 'ord', succ: 'ord', immLeft: 'ord', steps: 'ord',
    adj: 'dist', notAdj: 'dist', gap: 'dist', dist: 'dist',
    between: 'between', extreme: 'abs', end: 'abs', notEnd: 'abs', pos: 'abs',
};

export const LINE_MAX_ENTITIES = 10;

const P = (kind: string, args: number[], params?: Record<string, number | string>): Premise =>
    params ? { kind, args: args.map(eid), params } : { kind, args: args.map(eid) };

const num = (r: Rel, key: string) => Number(r.params?.[key] ?? 0);

// ---------------------------------------------------------------- semantics

export function lineCompile(rel: Rel, vars: number[], size: number): (v: Vals) => boolean {
    const [a, b, c] = vars;
    const k = num(rel, 'k');
    switch (rel.kind) {
        case 'gt': return v => v[a] > v[b];
        case 'left': return v => v[a] < v[b];
        case 'succ': return v => v[a] === v[b] + 1;
        case 'immLeft': return v => v[b] === v[a] + 1;
        case 'adj': return v => Math.abs(v[a] - v[b]) === 1;
        case 'notAdj': return v => Math.abs(v[a] - v[b]) !== 1;
        case 'between': return v => (v[b] < v[a] && v[a] < v[c]) || (v[c] < v[a] && v[a] < v[b]);
        case 'gap':
        case 'dist': return v => Math.abs(v[a] - v[b]) === k + 1;
        case 'steps': return v => v[b] - v[a] === k;
        case 'extreme': return rel.params?.['side'] === 'max' ? v => v[a] === size - 1 : v => v[a] === 0;
        case 'end': return v => v[a] === 0 || v[a] === size - 1;
        case 'notEnd': return v => v[a] !== 0 && v[a] !== size - 1;
        case 'pos': return v => v[a] === k - 1;
        default: throw new Error(`Unknown line relation ${rel.kind}`);
    }
}

export function lineDomain(id: LineId) {
    return (rels: readonly Rel[], nLocal: number, nFull: number, full: boolean): DomainSpec => {
        if (full || id === 'linear') return { size: nFull, allDiff: true };
        const positional = rels.some(r => ORDER_POSITIONAL.has(r.kind) || ABSOLUTE.has(r.kind));
        return { size: positional ? nFull : nLocal, allDiff: true };
    };
}

export interface LineSolver {
    supportDomain: 'restricted';
    packed: boolean;
    domain: (rels: readonly Rel[], nLocal: number, nFull: number, full: boolean) => DomainSpec;
    compile: typeof lineCompile;
}

/** Only the row is packed: order families solve a subset on its own entities (relative ranks). */
export const lineSolver = (id: LineId): LineSolver => ({ supportDomain: 'restricted', packed: id === 'linear', domain: lineDomain(id), compile: lineCompile });

export function holdsLine(rel: Rel, vals: Vals, n: number): boolean {
    return lineCompile(rel, rel.args.map(idx), n)(vals);
}

// ---------------------------------------------------------------- configuration

export interface LineCfg {
    id: LineId;
    /** Winner of an oriented relation sits higher (order: greater/later) or lower (linear: further left). */
    winsHigh: boolean;
}

/** Oriented inexact premise between u (lower position) and v (higher position). */
function O(cfg: LineCfg, u: number, v: number): Premise {
    return cfg.id === 'linear' ? P('left', [u, v]) : P('gt', [v, u]);
}

/** Premise "w beats l" (order: w greater; linear: w further left). */
function beat(cfg: LineCfg, w: number, l: number): Premise {
    return cfg.id === 'linear' ? P('left', [w, l]) : P('gt', [w, l]);
}

/** Query claiming that `low` is below `high` (in the family's natural wording). */
function claim(cfg: LineCfg, low: number, high: number): Query {
    return cfg.id === 'linear' ? P('left', [low, high]) : P('gt', [high, low]);
}

/** One oriented chain link from u (lower) to v (higher), with level-dependent exact variants. */
function link(cfg: LineCfg, rng: Rng, p: LevelParams, u: number, v: number): Premise {
    if (cfg.id === 'orderTime' && p.level >= 5 && rng.chance(0.25)) return P('succ', [v, u]);
    if (cfg.id === 'linear' && p.level >= 3) {
        const r = rng.float();
        if (r < 0.2) return P('immLeft', [u, v]);
        if (r < 0.35) return P('steps', [u, v], { k: 2 + rng.int(2) });
    }
    return O(cfg, u, v);
}

export function lineQueryKinds(cfg: LineCfg, p: LevelParams): string[] {
    const between = p.level >= 6 && p.sigmaMax >= 5 && p.requireNonLocal;
    if (cfg.id !== 'linear') return between ? ['gt', 'gt', 'gt', 'between'] : ['gt'];
    // Exact-distance conclusions (steps / dist / adj / notAdj) are not offered yet: in a packed row a wrong
    // distance is refuted by counting places from 2–3 premises, so "Contradicts" items with an honest σ are
    // rare and their selection skews surface features (see docs/V5_NOTES.md «Отступления»). These relations
    // still appear as premises (exact chain links and distractors). The exact-chain builder below is kept for
    // the follow-up that will re-enable them.
    return between ? ['left', 'left', 'left', 'between'] : ['left'];
}

const queryClass = (qkind: string) =>
    qkind === 'between' ? 'between' : qkind === 'gt' || qkind === 'left' ? 'ord' : 'exact';

export const isOrientedQuery = (qkind: string) => qkind === 'gt' || qkind === 'left' || qkind === 'steps';

/** Free entities reserved for profile pendants (2-entity conclusions) or fillers. */
export const freeBudget = (qkind: string) => (qkind === 'between' ? 1 : 4);

export function lineAdjust(p: LevelParams, plan: Plan, format: AnswerFormat): LevelParams {
    const q = { ...p };
    const qkind = plan.cue['qkind'] ?? 'gt';
    const surf = plan.lure === 'surface' ? 1 : 0;
    const kCap = LINE_MAX_ENTITIES - 1 - freeBudget(qkind) - surf;
    q.sigmaMax = Math.min(q.sigmaMax, kCap);
    if (qkind === 'between' && format !== 'choice') q.sigmaMin = Math.max(q.sigmaMin, 5);
    q.sigmaMin = Math.min(q.sigmaMin, q.sigmaMax);
    q.n = Math.min(LINE_MAX_ENTITIES, Math.max(3, q.n));
    return q;
}

// ---------------------------------------------------------------- bot signals

export const winnerOf = (r: Rel) => r.args[0];
export const loserOf = (r: Rel) => r.args[1];

export function winScores(premises: readonly Rel[]): Map<string, number> {
    const s = new Map<string, number>();
    for (const r of premises) {
        if (!ORIENTED.has(r.kind)) continue;
        s.set(winnerOf(r), (s.get(winnerOf(r)) ?? 0) + 1);
        s.set(loserOf(r), (s.get(loserOf(r)) ?? 0) - 1);
    }
    return s;
}

export function mentionCounts(premises: readonly Rel[]): Map<string, number> {
    const s = new Map<string, number>();
    for (const r of premises) for (const a of r.args) s.set(a, (s.get(a) ?? 0) + 1);
    return s;
}

const sign = (x: number): Answer => (x > 0 ? 'entailed' : x < 0 ? 'contradicted' : 'undetermined');

/** "Win count": the entity with more wins is greater / further left. */
export function netOpinion(premises: readonly Rel[], q: Rel): Answer | null {
    if (!isOrientedQuery(q.kind)) return null;
    const s = winScores(premises);
    return sign((s.get(q.args[0]) ?? 0) - (s.get(q.args[1]) ?? 0));
}

/** "Degree": the more-mentioned entity is greater / further left. */
export function degreeOpinion(premises: readonly Rel[], q: Rel): Answer | null {
    if (!isOrientedQuery(q.kind)) return null;
    const s = mentionCounts(premises);
    return sign((s.get(q.args[0]) ?? 0) - (s.get(q.args[1]) ?? 0));
}

// ---------------------------------------------------------------- construction

type Role = 'low' | 'high';

interface ChainMeta { t: 'G' | 'B'; seg: number; m?: number }

interface OrdChain { prem: Premise[]; meta: ChainMeta[]; /** node index where segment s ends */ segEnd: number[] }

function ordChain(cfg: LineCfg, rng: Rng, p: LevelParams, c: number[], needRun: boolean): OrdChain | null {
    const k = c.length - 1;
    // 1) layout: segment lengths in links (1 = oriented link, r+1 = run of r «между»), mirrored at random
    //    so that the top and bottom ends of the chain have the same distribution of link types
    const layout: number[] = [];
    let left = k;
    let runs = 0;
    while (left > 0) {
        const force = needRun && runs === 0 && (left <= 3 || rng.chance(0.5));
        if (left >= 2 && (rng.chance(p.pTernary) || force)) {
            const r = Math.min(left - 1, rng.chance(0.35) ? 2 : 1);
            layout.push(r + 1);
            left -= r + 1;
            runs++;
        } else {
            layout.push(1);
            left--;
        }
    }
    if (needRun && runs === 0) return null;
    if (rng.chance(0.5)) layout.reverse();
    // 2) emit premises
    const prem: Premise[] = [];
    const meta: ChainMeta[] = [];
    const segEnd: number[] = [];
    let i = 1;
    let seg = 0;
    for (const len of layout) {
        segEnd.push(i - 1 + len);
        if (len >= 2) {
            const r = len - 1;
            for (let m = i; m < i + r; m++) {
                const [x, y] = rng.chance(0.5) ? [c[m - 1], c[m + 1]] : [c[m + 1], c[m - 1]];
                prem.push(P('between', [c[m], x, y]));
                meta.push({ t: 'B', seg, m });
            }
            let gs: number[] = [];
            for (let g = i; g <= i + r; g++) if (g >= 2 && g <= k - 1) gs.push(g);
            if (!gs.length) gs = Array.from({ length: r + 1 }, (_, j) => i + j);
            const g = rng.pick(gs);
            prem.push(link(cfg, rng, p, c[g - 1], c[g]));
            meta.push({ t: 'G', seg });
            i += r + 1;
        } else {
            prem.push(link(cfg, rng, p, c[i - 1], c[i]));
            meta.push({ t: 'G', seg });
            i++;
        }
        seg++;
    }
    return { prem, meta, segEnd };
}

/** Flip the orientation of every segment that lies after node j (or before it): the chain gets a peak/valley at c[j]. */
function foldAt(ch: OrdChain, j: number, after: boolean): Premise[] {
    const flip = new Set(ch.segEnd.map((e, s) => ({ s, start: s === 0 ? 0 : ch.segEnd[s - 1], end: e }))
        .filter(x => (after ? x.start >= j : x.end <= j)).map(x => x.s));
    return ch.prem.map((r, i) => (ch.meta[i].t === 'G' && flip.has(ch.meta[i].seg) ? flipped(r) : r));
}

const flipped = (r: Premise): Premise => ({ ...r, args: [r.args[1], r.args[0], ...r.args.slice(2)] });

/** Single structural modifications that keep premise-kind counts: flip one segment or fold one «между». */
function breakCandidates(prem: Premise[], meta: ChainMeta[], c: number[], rng: Rng): Premise[][] {
    const segs = new Set(meta.map(m => m.seg)).size;
    const out: Premise[][] = [];
    meta.forEach((m, i) => {
        if (m.t === 'G' && segs >= 2) {
            const np = prem.slice();
            np[i] = flipped(prem[i]);
            out.push(np);
        }
        if (m.t === 'B' && m.m !== undefined) {
            const j = m.m;
            for (const [mid, x, y] of [[c[j + 1], c[j - 1], c[j]], [c[j - 1], c[j], c[j + 1]]]) {
                const np = prem.slice();
                np[i] = P('between', [mid, x, y]);
                out.push(np);
            }
        }
    });
    return rng.shuffle(out);
}

interface ExactChain { prem: Premise[]; offset: number }

/**
 * Chain of exact signed steps. With `convergent`, one interior link is given as an unoriented magnitude
 * («рядом» / «разделяют k человек») plus an orientation («левее») — two premises on one pair, so the
 * support is no longer a simple chain. That link is placed last in `prem` order only by index bookkeeping:
 * single-premise links keep their positions 0…k-1 except the convergent one, whose two premises are appended.
 */
function exactChain(rng: Rng, c: number[], n: number, need: (o: number) => boolean, convergent: boolean): ExactChain | null {
    const k = c.length - 1;
    for (let t = 0; t < 80; t++) {
        const off = [0];
        const prem: Premise[] = [];
        const extra: Premise[] = [];
        const cj = convergent ? (k >= 3 ? 2 + rng.int(k - 2) : 1 + rng.int(k)) : -1;
        for (let j = 1; j <= k; j++) {
            // mostly multi-place steps: unit steps («сразу слева») pin neighbouring places, and in a packed
            // row two such pins at the chain ends already refute many wrong distances
            const u01 = rng.float();
            const mg = u01 < 0.15 ? 1 : u01 < 0.65 ? 2 : 3;
            const s = rng.chance(0.5) ? 1 : -1;
            off.push(off[j - 1] + s * mg);
            const [u, v] = s > 0 ? [c[j - 1], c[j]] : [c[j], c[j - 1]];
            if (j === cj) {
                const pr = rng.chance(0.5) ? [u, v] : [v, u];
                prem.push(P('left', [u, v]));
                extra.push(mg === 1 ? P('adj', pr) : P('dist', pr, { k: mg - 1 }));
            } else {
                prem.push(mg === 1 ? P('immLeft', [u, v]) : P('steps', [u, v], { k: mg }));
            }
        }
        prem.push(...extra);
        if (new Set(off).size !== off.length) continue;
        if (Math.max(...off) - Math.min(...off) > n - 1) continue;
        if (!need(off[k])) continue;
        return { prem, offset: off[k] };
    }
    return null;
}

/**
 * Local profile of a conclusion entity: (wins − losses, mentions). The chain gives the "top" end a win and
 * the "bottom" end a loss, which would reveal the class. Each end therefore gets a target profile drawn from a
 * distribution that depends only on its base |net| and degree — never on whether it is the top or the bottom:
 *   base (±1, d): (0, d+1) ½ · (+1, d+2) ¼ · (−1, d+2) ¼      base (0, d): (0, d) · (+1, d+1) · (−1, d+1) ⅓ each
 * Returns the wins/losses to add, or null for unusual bases.
 */
function profileMoves(rng: Rng, net: number, deg: number): { w: number; l: number } | null {
    let tn: number;
    let td: number;
    if (Math.abs(net) === 1) {
        const u = rng.float();
        [tn, td] = u < 0.5 ? [0, deg + 1] : u < 0.75 ? [1, deg + 2] : [-1, deg + 2];
    } else if (net === 0) {
        const u = rng.int(3);
        [tn, td] = u === 0 ? [0, deg] : u === 1 ? [1, deg + 1] : [-1, deg + 1];
    } else {
        return null;
    }
    const dn = tn - net;
    const dd = td - deg;
    return { w: (dd + dn) / 2, l: (dd - dn) / 2 };
}

export interface LineWorld { pos: Vals }

export function constructLine(cfg: LineCfg, solver: LineSolver, rng: Rng, p: LevelParams, plan: Plan): Construction<LineWorld> | null {
    const qkind = plan.cue['qkind'] ?? (cfg.id === 'linear' ? 'left' : 'gt');
    const cls = queryClass(qkind);
    const surf = plan.lure === 'surface';
    const sigmaT = p.sigmaMin + rng.int(p.sigmaMax - p.sigmaMin + 1);
    // exact chains realise convergence with one two-premise link, so they need one link fewer
    const exactConv = cls === 'exact' && p.requireConvergent && sigmaT >= 3;
    const k = exactConv ? sigmaT - 1 : sigmaT;
    const F = freeBudget(qkind);
    const n = Math.min(LINE_MAX_ENTITIES, Math.max(p.n, k + 1 + F + (surf ? 1 : 0)));
    if (k + 1 + F + (surf ? 1 : 0) > n) return null;

    const ents = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    const c = ents.slice(0, k + 1);
    const surfEnt = surf ? ents[k + 1] : -1;
    const free = ents.slice(k + 1 + (surf ? 1 : 0));
    const target = plan.target;

    let chain: Premise[];
    let query: Query;
    let balance: 'left' | 'exact' | null = null;
    let altQueries: Query[] = [];

    if (cls === 'ord' || cls === 'between') {
        const built = ordChain(cfg, rng, p, c, p.requireConvergent);
        if (!built) return null;
        chain = built.prem;
        if (cls === 'ord') {
            if (target === 'undetermined') {
                const probe = claim(cfg, c[0], c[k]);
                const br = breakCandidates(chain, built.meta, c, rng).find(np => classifySubset(solver, np, probe, n) === 'undetermined');
                if (!br) return null;
                chain = br;
                query = rng.chance(0.5) ? claim(cfg, c[0], c[k]) : claim(cfg, c[k], c[0]);
            } else {
                query = target === 'entailed' ? claim(cfg, c[0], c[k]) : claim(cfg, c[k], c[0]);
            }
        } else {
            // «между»: the claimed middle is always an interior node at a segment boundary and the outer
            // entities are always the chain ends, in every class. E: monotone chain; C: the chain folds at the
            // middle (all segments on one side flipped — a peak or a valley); U: exactly one segment flipped.
            const bounds = built.segEnd.filter(e => e >= 2 && e <= k - 2);
            if (!bounds.length) return null;
            const j = rng.pick(bounds);
            const q = P('between', [c[j], ...(rng.chance(0.5) ? [c[0], c[k]] : [c[k], c[0]])]);
            if (target === 'contradicted') {
                chain = foldAt(built, j, rng.chance(0.5));
            } else if (target === 'undetermined') {
                const segs = rng.shuffle(built.segEnd.map((_, s) => s));
                let found: Premise[] | null = null;
                for (const s of segs) {
                    const np = built.prem.map((r, i) => (built.meta[i].t === 'G' && built.meta[i].seg === s ? flipped(r) : r));
                    if (classifySubset(solver, np, q, n) === 'undetermined') { found = np; break; }
                }
                if (!found) return null;
                chain = found;
            }
            query = q;
        }
    } else {
        // exact chains: steps / dist / adj / notAdj (linear only)
        // In a packed row a wrong distance is easy to refute by counting places, so "not adjacent" is built
        // as the nearest miss (distance exactly 2) to keep the refutation dependent on the whole chain.
        const adjTruth = (target === 'entailed') === (qkind === 'adj');
        const need = (o: number) =>
            qkind === 'adj' || qkind === 'notAdj' ? (target === 'undetermined' ? true : adjTruth ? Math.abs(o) === 1 : Math.abs(o) === 2)
                : qkind === 'dist' ? Math.abs(o) >= 2 : true;
        const ec = exactChain(rng, c, n, need, exactConv);
        if (!ec) return null;
        chain = ec.prem;
        if (target === 'undetermined') {
            // an end link becomes inexact (same orientation); the interior stays one exact sub-path, so
            // the kind counts can be restored by a derivable exact filler between interior entities
            const j = rng.chance(0.5) ? 0 : k - 1;
            const r = chain[j];
            chain = chain.slice();
            chain[j] = P('left', [idx(r.args[0]), idx(r.args[1])]);
            balance = 'exact';
        } else {
            balance = 'left';
        }
        const o = ec.offset;
        const [lo, hi] = o > 0 ? [c[0], c[k]] : [c[k], c[0]];
        const K = Math.abs(o);
        if (qkind === 'adj' || qkind === 'notAdj') {
            query = P(qkind, rng.chance(0.5) ? [c[0], c[k]] : [c[k], c[0]]);
        } else if (qkind === 'steps') {
            if (target === 'contradicted') {
                // several wrong values; the pipeline takes the first one whose refutation needs a full support
                const near = rng.shuffle([K - 1, K + 1].filter(x => x >= 1)).map(x => P('steps', [lo, hi], { k: x }));
                const far = rng.shuffle([K - 2, K + 2].filter(x => x >= 1)).map(x => P('steps', [lo, hi], { k: x }));
                const rev = P('steps', [hi, lo], { k: K });
                const wantRev = plan.lure === 'reversal' || (plan.lure !== 'nearMiss' && rng.chance(0.5));
                altQueries = wantRev ? [rev, ...near, ...far] : [...near, rev, ...far];
                query = altQueries.shift()!;
            } else {
                query = P('steps', [lo, hi], { k: K });   // undetermined: value fixed after world sampling
            }
        } else {
            const pr = rng.chance(0.5) ? [c[0], c[k]] : [c[k], c[0]];
            if (target === 'contradicted') {
                const ks = [...rng.shuffle([K - 2, K].filter(x => x >= 1)), ...rng.shuffle([K - 3, K + 1].filter(x => x >= 1))];
                altQueries = ks.map(x => P('dist', pr, { k: x }));
                query = altQueries.shift()!;
            } else {
                query = P('dist', pr, { k: K - 1 });
            }
        }
    }

    const prem: Premise[] = chain.slice();
    const qa = query.args.map(idx);

    // lure: surface — two conclusion entities in one premise of another type
    if (surf) {
        if (cls === 'between') {
            // the outer pair inside another «между» with a fresh middle: no orientation, so it cannot shorten
            // the refutation of a folded chain
            prem.push(P('between', [surfEnt, ...(rng.chance(0.5) ? [c[0], c[k]] : [c[k], c[0]])]));
        } else {
            const [x, y] = rng.chance(0.5) ? [qa[0], qa[1]] : [qa[1], qa[0]];
            prem.push(rng.chance(0.5) ? P('between', [x, y, surfEnt]) : P('between', [x, surfEnt, y]));
        }
    }

    // profile pendants (2-entity conclusions): free entities are local extrema, so they never create shortcuts;
    // one "below" entity may be beaten by both conclusion entities (and one "above" may beat both)
    const roles = new Map<number, Role>();
    const winRole: Role = cfg.winsHigh ? 'low' : 'high';     // role of x when the conclusion entity beats x
    const loseRole: Role = winRole === 'low' ? 'high' : 'low';
    if (qa.length === 2) {
        const net = winScores(prem);
        const deg = mentionCounts(prem);
        const mv = qa.map(e => profileMoves(rng, net.get(eid(e)) ?? 0, deg.get(eid(e)) ?? 0));
        if (mv.some(m => !m)) return null;
        const [m0, m1] = mv as { w: number; l: number }[];
        const nLow = Math.max(m0.w, m1.w);
        const nHigh = Math.max(m0.l, m1.l);
        if (nLow + nHigh > free.length) return null;
        const pool = rng.shuffle(free.slice());
        const lows = pool.slice(0, nLow);
        const highs = pool.slice(nLow, nLow + nHigh);
        lows.forEach(x => roles.set(x, winRole));
        highs.forEach(x => roles.set(x, loseRole));
        [m0, m1].forEach((m, qi) => {
            const e = qa[qi];
            const ls = rng.shuffle(lows.slice()).slice(0, m.w);
            const hs = rng.shuffle(highs.slice()).slice(0, m.l);
            for (const x of ls) prem.push(beat(cfg, e, x));
            for (const x of hs) prem.push(beat(cfg, x, e));
        });
    }

    // «X — самый большой / маленький» (order families, L ≥ 8): asserted about a free entity before the world
    // is drawn. A free entity is a local extremum, so the fact never shortens a support, and its availability
    // does not depend on the class (choosing the world's actual extreme afterwards would).
    let preFillers = 0;
    if (cfg.id !== 'linear' && p.level >= 8) {
        for (const [side, role] of [['max', 'high'], ['min', 'low']] as const) {
            if (preFillers >= p.distractors || !rng.chance(0.3)) continue;
            const cands = free.filter(x => (roles.get(x) ?? role) === role && !prem.some(r => r.kind === 'extreme' && r.args[0] === eid(x)));
            if (!cands.length) continue;
            const x = rng.pick(cands);
            roles.set(x, role);
            prem.push(P('extreme', [x], { side }));
            preFillers++;
        }
    }

    const world = modelWith(solver, prem, [], n, { rng });
    if (!world) return null;
    const pos = (e: number) => world[e];

    if (target === 'undetermined' && (query.kind === 'steps' || query.kind === 'dist')) {
        const d = pos(qa[1]) - pos(qa[0]);
        query = query.kind === 'steps'
            ? (d > 0 ? P('steps', [qa[0], qa[1]], { k: d }) : P('steps', [qa[1], qa[0]], { k: -d }))
            : P('dist', [qa[0], qa[1]], { k: Math.abs(d) - 1 });
        if (query.kind === 'dist' && num(query, 'k') < 1) return null;
    }

    // fillers (never touch conclusion entities)
    const qset = new Set(query.args.map(idx));
    const interior = c.filter(e => !qset.has(e));
    const used = new Set<string>();
    const key = (r: Premise) => `${r.kind}:${[...r.args].sort().join(',')}`;
    prem.forEach(r => used.add(key(r)));
    const fillers: Premise[] = [];
    const tryAdd = (r: Premise) => {
        const kk = key(r);
        if (used.has(kk)) return false;
        used.add(kk);
        fillers.push(r);
        return true;
    };
    const pendant = (x: number): Premise | null => {
        const role = roles.get(x);
        const cands = interior.filter(e => role === undefined || (role === 'low' ? pos(x) < pos(e) : pos(x) > pos(e)));
        if (!cands.length) return null;
        const e = rng.pick(cands);
        if (!roles.has(x)) roles.set(x, pos(x) < pos(e) ? 'low' : 'high');
        return pos(x) < pos(e) ? O(cfg, x, e) : O(cfg, e, x);
    };
    // every free entity must appear in some premise
    for (const x of free) {
        if (prem.some(r => r.args.includes(eid(x)))) continue;
        const r = pendant(x);
        if (!r) return null;
        tryAdd(r);
    }
    // kind balancing for exact chains (E/C: one more «левее» as a pendant; U: one more exact step, derivable)
    if (balance === 'left') {
        let done = false;
        for (const x of rng.shuffle(free.slice())) {
            const r = pendant(x);
            if (r && tryAdd(r)) { done = true; break; }
        }
        if (!done) return null;
    } else if (balance === 'exact') {
        const pairs: [number, number][] = [];
        for (const a of interior) for (const b of interior) if (a !== b && pos(a) < pos(b)) pairs.push([a, b]);
        let done = false;
        for (const [a, b] of rng.shuffle(pairs)) {
            // derivable only if a and b lie on the same exact sub-path: check by solver on the chain
            const d = pos(b) - pos(a);
            const r = d === 1 ? P('immLeft', [a, b]) : P('steps', [a, b], { k: d });
            if (classifySubset(solver, chain, r, n) === 'entailed' && tryAdd(r)) { done = true; break; }
        }
        if (!done) return null;
    }
    // distractors. Exact chains only get pendants and facts about free entities: anything tied to the chain
    // would let a partial chain refute a wrong distance, so such fillers would be filtered out of
    // "Contradicts" items more often — a selection bias the learned bot would see.
    const D = p.distractors;
    const exact = cls === 'exact';
    const cands: (() => Premise | null)[] = [];
    if (!exact) {
        for (let j = 1; j + 1 < c.length; j++) {
            const [a, m, b] = [c[j - 1], c[j], c[j + 1]];
            if (qset.has(a) || qset.has(m) || qset.has(b)) continue;
            if ((pos(a) < pos(m) && pos(m) < pos(b)) || (pos(b) < pos(m) && pos(m) < pos(a))) cands.push(() => P('between', [m, a, b]));
        }
    }
    for (const x of free) cands.push(() => pendant(x));
    const others = Array.from({ length: n }, (_, i) => i).filter(e => !qset.has(e) && !free.includes(e));
    const nonQ = Array.from({ length: n }, (_, i) => i).filter(e => !qset.has(e) && (!exact || free.includes(e)));
    if (cfg.id === 'orderTime' && p.level >= 8) {
        for (const a of others) for (const b of others) if (a < b && Math.abs(pos(a) - pos(b)) >= 2) cands.push(() => P('gap', [a, b], { k: Math.abs(pos(a) - pos(b)) - 1 }));
    }
    if (cfg.id === 'linear') {
        for (const a of nonQ) for (const b of nonQ) {
            if (a >= b) continue;
            const d = Math.abs(pos(a) - pos(b));
            if (p.level >= 4 && d >= 2 && rng.chance(0.3)) cands.push(() => P('notAdj', [a, b]));
            if (p.level >= 5 && d >= 2 && rng.chance(0.15)) cands.push(() => P('dist', [a, b], { k: d - 1 }));
        }
        if (p.level >= 6) for (const a of nonQ) {
            if (rng.chance(0.3)) cands.push(() => (pos(a) === 0 || pos(a) === n - 1 ? P('end', [a]) : P('notEnd', [a])));
        }
        if (p.level <= 9 && rng.chance(0.15)) {
            const a = rng.pick(nonQ);
            cands.push(() => P('pos', [a], { k: pos(a) + 1 }));
        }
    }
    rng.shuffle(cands);
    let added = preFillers;
    for (const mk of cands) {
        if (added >= D) break;
        const r = mk();
        if (r && tryAdd(r)) added++;
    }

    const all = rng.shuffle([...prem, ...fillers]);
    return { world: { pos: world }, premises: all, queries: [query, ...altQueries], n };
}

// ---------------------------------------------------------------- choice («Кто k-й…?»)

export function constructLineChoice(cfg: LineCfg, solver: LineSolver, rng: Rng, p: LevelParams, plan: Plan): ChoiceConstruction | null {
    const n = Math.max(4, Math.min(8, p.n));
    const c = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    const built = ordChain(cfg, rng, p, c, p.requireConvergent && n >= 3);
    if (!built) return null;
    let prem = built.prem;
    if (plan.target === 'undetermined') {
        const br = breakCandidates(prem, built.meta, c, rng)[0];
        if (!br) return null;
        prem = br;
    }
    const world = modelWith(solver, prem, [], n, { rng });
    if (!world) return null;
    // distractors: redundant «между» on collinear consecutive triples
    const extra: Premise[] = [];
    for (let j = 1; j + 1 < n && extra.length < p.distractors; j++) {
        const [a, m, b] = [c[j - 1], c[j], c[j + 1]];
        const col = (world[a] < world[m] && world[m] < world[b]) || (world[b] < world[m] && world[m] < world[a]);
        if (col && !prem.some(r => r.kind === 'between' && r.args[0] === eid(m)) && rng.chance(0.5)) extra.push(P('between', [m, a, b]));
    }
    const all = rng.shuffle([...prem, ...extra]);
    const ms = models(solver, all, n, 50000);
    const rankToPos = (r: number) => (cfg.id === 'orderNum' ? n - r : r - 1);
    const occupants = (r: number) => {
        const s = new Set<number>();
        const pp = rankToPos(r);
        for (const m of ms) for (let e = 0; e < n; e++) if (m[e] === pp) s.add(e);
        return s;
    };
    const ranks = rng.shuffle(Array.from({ length: n }, (_, i) => i + 1));
    const want = plan.target === 'entailed' ? 1 : 2;
    const r = ranks.find(rr => (want === 1 ? occupants(rr).size === 1 : occupants(rr).size >= 2));
    if (r === undefined) return null;
    const occ = [...occupants(r)];
    return {
        premises: all,
        n,
        query: { kind: 'rankAt', args: [], params: { k: r } },
        answer: plan.target === 'entailed' ? 'entailed' : 'undetermined',
        correctOptionId: plan.target === 'entailed' ? eid(occ[0]) : 'none',
    };
}

/** Choice bot "win count": ranks entities by wins − losses (ties: first mention) and picks the k-th. */
export function choiceDegreePick(cfg: LineCfg, d: DraftItem): string {
    const shown = d.displayOrder.map(i => d.premises[i]);
    const s = winScores(shown);
    const first = firstMentionOrder(shown, d.entities.length);
    const k = Number(d.query.params?.['k'] ?? 1);
    // orderNum / linear: k-th largest / k-th from the left = k-th by wins (desc); orderTime: k-th earliest = asc
    const desc = cfg.id !== 'orderTime';
    const ord = first.slice().sort((a, b) => {
        const da = (s.get(a) ?? 0) - (s.get(b) ?? 0);
        return desc ? -da || first.indexOf(a) - first.indexOf(b) : da || first.indexOf(a) - first.indexOf(b);
    });
    return ord[k - 1] ?? 'none';
}

export function firstMentionOrder(premises: readonly Rel[], n: number): string[] {
    const out: string[] = [];
    for (const r of premises) for (const a of r.args) if (!out.includes(a)) out.push(a);
    for (let i = 0; i < n; i++) if (!out.includes(eid(i))) out.push(eid(i));
    return out;
}

export function choiceFirstMentionPick(d: DraftItem): string {
    const shown = d.displayOrder.map(i => d.premises[i]);
    const k = Number(d.query.params?.['k'] ?? 1);
    return firstMentionOrder(shown, d.entities.length)[k - 1] ?? 'none';
}

// ---------------------------------------------------------------- lures, statedDirectly, preferred model

export function lineStated(q: Rel, premises: readonly Rel[]): boolean {
    const t = REL_TYPE[q.kind];
    const qs = [...q.args].sort().join(',');
    return premises.some(r => REL_TYPE[r.kind] === t && [...r.args].sort().join(',') === qs);
}

export function linePreferred(solver: LineSolver, premises: readonly Rel[], n: number): Vals {
    const order: number[] = [];
    for (const r of premises) for (const a of r.args) if (!order.includes(idx(a))) order.push(idx(a));
    for (let i = 0; i < n; i++) if (!order.includes(i)) order.push(i);
    const { csp } = buildCsp(solver, premises.map(rel => ({ rel })), n, true, allIds(n));
    let found: Vals | null = null;
    search(csp, v => { found = v.slice(); return true; }, { order });
    if (!found) throw new Error('Inconsistent premises (preferred model)');
    return found;
}

export function lineLure(solver: LineSolver, ctx: LureContext): LureType {
    const { premises, query: q, answer, n } = ctx;
    const qs = new Set(q.args);
    if (premises.some(r => r.args.filter(a => qs.has(a)).length >= 2)) return 'surface';
    if (answer === 'undetermined') return holdsLine(q, linePreferred(solver, premises, n), n) ? 'possible' : 'none';
    if (answer !== 'contradicted') return 'none';
    const isE = (r: Rel) => classify(solver, premises, r, n) === 'entailed';
    if (ORIENTED.has(q.kind) && isE(flipped(q as Premise))) return 'reversal';
    const k = num(q, 'k');
    if ((q.kind === 'steps' || q.kind === 'dist') && [k - 1, k + 1].some(kk => kk >= 0 && isE({ ...q, params: { ...q.params, k: kk } }))) return 'nearMiss';
    if (q.kind === 'between') {
        const [m, x, y] = q.args;
        if (isE({ kind: 'between', args: [x, m, y] }) || isE({ kind: 'between', args: [y, m, x] })) return 'nearMiss';
    }
    return 'none';
}

/**
 * Only the conclusion kind is stratified by a bag here: the win-count / mention-count bots are neutralised by
 * the role-free local profiles of the conclusion entities (see profileMoves), which is stronger than matching
 * their opinions — it also removes the per-entity features the learned bot would otherwise use.
 */
export function lineCueMatches(cue: Record<string, string>, _premises: readonly Rel[], q: Rel): boolean {
    return !cue['qkind'] || q.kind === cue['qkind'];
}

export function lineCueSpace(cfg: LineCfg, p: LevelParams, format: AnswerFormat): Record<string, string[]> {
    if (format === 'choice') return {};
    return { qkind: lineQueryKinds(cfg, p) };
}
