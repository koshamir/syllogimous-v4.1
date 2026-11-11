// «Направления 2D» (§5.6), «Направления 3D» / «Пространство и время» (§5.7).
// World: integer coordinates (x — east, y — north, z — up / later); cells may coincide.
//
// Construction mirrors the line families: the conclusion pair is joined by a chain of links (exact
// displacements or qualitative relations); "Contradicts" changes the claim (reversal / ±1 / one axis) or the
// value on an equality axis, "Unknown" flips one qualitative link or weakens one exact link (premise-type
// counts are re-balanced by one pendant). Ends get role-free win/loss profiles on every directional axis.

import { Rng } from '../core/rng';
import { Vals } from '../core/combinatorics';
import { Answer, AnswerFormat, Bot, DraftItem, FamilyId, LevelParams, LureType, Plan, Premise, Query } from '../core/types';
import { decorateDir, describeDir, dirAxes, DirMode, renderDir } from '../render/ru/direction';
import {
    AXES, Axis, Code, closure, codeOf, dcsBounds, dcsClassify, dcsConsistent, dcsLog2Models, dcsModel, dcsSample, holdsDir, range,
} from './dcs';
import { Construction, FamilyPlugin, LureContext, Rel, eid, idx } from './plugin';

type Req = 'ineq' | 'zero' | 'exact' | 'free';
export type DirQType = 'qual1' | 'qual2' | 'strict' | 'exact' | 'adj' | 'line';

const MAX_ENTITIES = 12;

const D = (a: number, b: number, codes: Partial<Record<Axis, Code>>, t: string): Premise => {
    const params: Record<string, number | string> = { t };
    for (const ax of AXES) if (codes[ax] !== undefined && codes[ax] !== 'a') params[ax] = codes[ax] as number | string;
    return { kind: 'dir', args: [eid(a), eid(b)], params };
};

const sgnOf = (c: Code): number => (c === 'g' ? 1 : c === 'l' ? -1 : c === 'a' ? 0 : Math.sign(c));

export function dirQueryKinds(mode: DirMode, p: LevelParams): DirQType[] {
    const ks: DirQType[] = ['qual1', 'qual1', 'exact'];
    if (p.level >= 3) { ks.push('qual2', 'strict'); if (mode === 'dir2d') ks.push('adj'); }
    if (p.level >= 5) ks.push('line');
    return ks;
}

/** Directional (win/loss) score of each entity on one axis. */
export function axisNet(premises: readonly Rel[], ax: Axis): Map<string, number> {
    const m = new Map<string, number>();
    for (const r of premises) {
        const s = sgnOf(codeOf(r, ax));
        if (!s) continue;
        m.set(r.args[0], (m.get(r.args[0]) ?? 0) + s);
        m.set(r.args[1], (m.get(r.args[1]) ?? 0) - s);
    }
    return m;
}

/** Primary directional axis of a relation (first axis with a sign), or null. */
export function primaryAxis(axes: readonly Axis[], r: Rel): Axis | null {
    for (const ax of ['y', 'x', 'z'] as Axis[]) if (axes.includes(ax) && sgnOf(codeOf(r, ax))) return ax;
    return null;
}

/** Role-free profile targets (same rule as the line families). */
function profileMoves(rng: Rng, net: number): { w: number; l: number } | null {
    if (Math.abs(net) === 1) {
        const u = rng.float();
        const tn = u < 0.5 ? 0 : u < 0.75 ? 1 : -1;
        const m = tn === 0 ? 1 : 2;
        const dn = tn - net;
        return { w: (m + dn) / 2, l: (m - dn) / 2 };
    }
    if (net === 0) {
        const u = rng.int(3);
        return u === 0 ? { w: 0, l: 0 } : u === 1 ? { w: 1, l: 0 } : { w: 0, l: 1 };
    }
    return null;
}

export interface DirWorld { coords: Vals }

function construct(mode: DirMode, rng: Rng, p: LevelParams, plan: Plan): Construction<DirWorld> | null {
    const axes = dirAxes(mode);
    const qtype = (plan.cue['qkind'] ?? 'qual1') as DirQType;
    const target = plan.target;
    const surf = false;
    // convergence (two-axis claims only): one link is stated as two premises on the same pair, one per axis.
    // The structure is built for every class; "Follows" then has σ = k + 1, "Contradicts" σ = k (one axis).
    // v5.1: exactly P premises. A refutation of a two-axis claim needs one axis only, so the split link (two
    // premises on one pair) is used for "Follows" / "Unknown" only.
    const conv = p.requireConvergent && (qtype === 'qual2' || qtype === 'strict') && p.premises >= 3 && target !== 'contradicted';
    const k = conv ? p.premises - 1 : p.premises;
    // requirements per axis
    const req: Partial<Record<Axis, Req>> = {};
    for (const ax of axes) req[ax] = 'free';
    const horiz: Axis[] = ['x', 'y'];
    let zeroAxis: Axis | null = null;
    const ineq: Axis[] = [];
    if (qtype === 'qual1') { const A = rng.pick(axes); req[A] = 'ineq'; ineq.push(A); }
    else if (qtype === 'qual2') {
        const pair = mode === 'dir2d' ? horiz : rng.pick([['x', 'y'], ['y', 'z'], ['x', 'z']] as Axis[][]);
        pair.forEach(a => { req[a] = 'ineq'; ineq.push(a); });
    } else if (qtype === 'strict') {
        const A = rng.pick(horiz);
        zeroAxis = A === 'x' ? 'y' : 'x';
        req[A] = 'ineq'; ineq.push(A); req[zeroAxis] = 'zero';
    } else if (qtype === 'exact' || qtype === 'adj') { for (const ax of axes) req[ax] = 'exact'; }
    else { zeroAxis = rng.pick(axes); req[zeroAxis] = 'zero'; }
    const allExact = qtype === 'exact' || qtype === 'adj';

    // C mode decided before the chain (structure-side for equality axes)
    let cMode: 'rev' | 'one' | 'zeroOff' | 'near' = 'rev';
    if (target === 'contradicted') {
        if (qtype === 'line') cMode = 'zeroOff';
        else if (qtype === 'strict') cMode = surf || rng.chance(0.5) ? 'rev' : 'zeroOff';
        else if (qtype === 'qual2') cMode = rng.chance(0.5) ? 'rev' : 'one';
        else if (allExact) cMode = plan.lure === 'reversal' ? 'rev' : 'near';
    }

    let ent = 0;
    const fresh = () => ent++;
    const c = Array.from({ length: k + 1 }, () => fresh());

    // link kinds
    const kinds: ('exact' | 'qual')[] = [];
    for (let j = 1; j <= k; j++) kinds.push(allExact ? 'exact' : rng.chance(0.5) ? 'qual' : 'exact');
    if (!allExact && ineq.length && !kinds.includes('qual')) kinds[rng.int(k)] = 'qual';
    if (zeroAxis && !kinds.includes('exact')) kinds[rng.int(k)] = 'exact';
    let split = -1;
    if (conv) {
        const cand = Array.from({ length: k }, (_, j) => j).filter(j => kinds[j] === 'qual' || (j > 0 && j < k - 1));
        split = rng.pick(cand.filter(j => j > 0 && j < k - 1).length ? cand.filter(j => j > 0 && j < k - 1) : cand);
        if (zeroAxis && kinds.filter(t => t === 'exact').length === 1 && kinds[split] === 'exact') return null;
        kinds[split] = 'qual';
    }
    // values / codes
    const vals: Partial<Record<Axis, Code>>[] = [];
    for (let j = 0; j < k; j++) {
        const codes: Partial<Record<Axis, Code>> = {};
        for (const ax of axes) {
            const r = req[ax]!;
            if (kinds[j] === 'qual') codes[ax] = r === 'ineq' ? 'g' : r === 'zero' ? 0 : 'a';
            else if (r === 'ineq') codes[ax] = rng.pick([0, 1, 1, 2, 2]);
            else codes[ax] = rng.pick([-2, -1, -1, 0, 1, 1, 2]);
        }
        vals.push(codes);
    }
    // equality axis: exact links sum to 0 (or ±1/±2 for "zeroOff")
    if (zeroAxis) {
        const ex = kinds.map((t, j) => (t === 'exact' ? j : -1)).filter(j => j >= 0);
        const want = cMode === 'zeroOff' && target === 'contradicted' ? rng.pick([-2, -1, 1, 2]) : 0;
        const others = ex.slice(0, -1).reduce((s, j) => s + Number(vals[j][zeroAxis!]), 0);
        const last = want - others;
        if (Math.abs(last) > 3) return null;
        vals[ex[ex.length - 1]][zeroAxis] = last;
    }
    // exact chains: a non-zero total on at least one axis; for the adjacency phrase the last link is chosen so
    // that the total is one cell away
    const total = (ax: Axis) => vals.reduce((s, v) => s + (typeof v[ax] === 'number' ? (v[ax] as number) : 0), 0);
    if (allExact) {
        if (qtype === 'adj') {
            const tgt = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
            (['x', 'y'] as Axis[]).forEach((ax, i) => {
                const others = total(ax) - Number(vals[k - 1][ax]);
                vals[k - 1][ax] = tgt[i] - others;
            });
            if (Math.abs(Number(vals[k - 1]['x'])) > 3 || Math.abs(Number(vals[k - 1]['y'])) > 3) return null;
        } else if (axes.every(ax => total(ax) === 0)) return null;
    }
    // every qualitative link must say something
    for (let j = 0; j < k; j++) if (kinds[j] === 'qual' && axes.every(ax => vals[j][ax] === 'a')) return null;

    const types = vals.map((v, j) => {
        if (kinds[j] === 'qual') return 'qual';
        const small = mode === 'dir2d' && Math.abs(Number(v['x'])) <= 1 && Math.abs(Number(v['y'])) <= 1 && (v['x'] !== 0 || v['y'] !== 0);
        return small && rng.chance(0.3) ? 'adj' : 'exact';
    });
    /** Premises of the chain; the split link (if any) becomes one premise per non-free axis. */
    const emit = (vs: Partial<Record<Axis, Code>>[], ts: string[]): Premise[] => {
        const out: Premise[] = [];
        vs.forEach((v, j) => {
            if (j === split && ts[j] === 'qual') {
                for (const ax of axes) if (v[ax] !== 'a' && v[ax] !== undefined) out.push(D(c[j + 1], c[j], { [ax]: v[ax]! }, 'qual'));
            } else {
                out.push(D(c[j + 1], c[j], v, ts[j]));
            }
        });
        return out;
    };
    let chain: Premise[] = emit(vals, types);

    // the claim: c_k relative to c_0
    const claimCodes: Partial<Record<Axis, Code>> = {};
    for (const ax of axes) {
        const r = req[ax]!;
        claimCodes[ax] = r === 'ineq' ? 'g' : r === 'zero' ? 0 : r === 'exact' ? total(ax) : 'a';
    }
    const qt = qtype === 'adj' ? 'adj' : qtype === 'exact' ? 'exact' : 'qual';
    const mkQ = (codes: Partial<Record<Axis, Code>>): Query => ({ ...D(c[k], c[0], codes, qt), params: { ...D(c[k], c[0], codes, qt).params, q: qtype } });
    let queries: Query[] = [];
    let balance: 'qual' | 'exact' | null = null;

    if (target === 'entailed') {
        queries = [mkQ(claimCodes)];
    } else if (target === 'contradicted') {
        if (cMode === 'zeroOff') queries = [mkQ(claimCodes)];
        else if (cMode === 'rev') {
            const cc = { ...claimCodes };
            for (const ax of axes) {
                const v = cc[ax]!;
                cc[ax] = v === 'g' ? 'l' : v === 'l' ? 'g' : typeof v === 'number' ? -v : v;
            }
            queries = [mkQ(cc)];
        } else if (cMode === 'one') {
            const cc = { ...claimCodes };
            const A = rng.pick(ineq);
            cc[A] = 'l';
            queries = [mkQ(cc)];
        }
        if (allExact) {
            // nearMiss variants (one axis ±1), reversal; adjacency claims must stay within one cell
            const near: Query[] = [];
            for (const ax of rng.shuffle(axes.slice())) for (const dv of rng.shuffle([-1, 1])) {
                const cc = { ...claimCodes, [ax]: Number(claimCodes[ax]) + dv };
                if (qtype === 'adj' && (Math.abs(Number(cc['x'])) > 1 || Math.abs(Number(cc['y'])) > 1 || (cc['x'] === 0 && cc['y'] === 0))) continue;
                if (axes.every(a => cc[a] === 0)) continue;
                near.push(mkQ(cc));
            }
            const rev = mkQ(Object.fromEntries(axes.map(ax => [ax, -Number(claimCodes[ax])])) as Partial<Record<Axis, Code>>);
            queries = cMode === 'rev' ? [rev, ...near] : [...near, rev];
        }
        if (allExact || qtype === 'line') balance = 'qual';
    } else {
        // Unknown: same structure, one link changed
        const q = mkQ(claimCodes);
        const solverOk = (np: Premise[]) => dcsClassify(axes, np, q, k + 1, false) === 'undetermined';
        let found: Premise[] | null = null;
        if (ineq.length) {
            const qj = rng.shuffle(kinds.map((t, j) => (t === 'qual' ? j : -1)).filter(j => j >= 0));
            for (const j of qj) {
                const A = rng.pick(ineq);
                const nv = vals.slice();
                nv[j] = { ...vals[j], [A]: 'l' };
                const np = emit(nv, types);
                if (solverOk(np)) { found = np; break; }
            }
        } else {
            const ej = rng.shuffle(kinds.map((t, j) => (t === 'exact' ? j : -1)).filter(j => j >= 0));
            for (const j of ej) {
                const codes: Partial<Record<Axis, Code>> = {};
                for (const ax of axes) {
                    const v = Number(vals[j][ax]);
                    codes[ax] = ax === zeroAxis ? 'a' : v > 0 ? 'g' : v < 0 ? 'l' : (zeroAxis ? 0 : 'a');
                }
                if (axes.every(ax => codes[ax] === 'a')) continue;
                const nv = vals.slice();
                nv[j] = codes;
                const nt = types.slice();
                nt[j] = 'qual';
                const np = emit(nv, nt);
                if (solverOk(np)) { found = np; break; }
            }
            balance = 'exact';
        }
        if (!found) return null;
        chain = found;
        queries = [q];
    }
    if (target === 'entailed' && (allExact || qtype === 'line')) balance = 'qual';

    const prem: Premise[] = chain.slice();
    const [q0, q1] = [c[k], c[0]];

    // surface lure: the pair inside a relation of another type that does not decide the claim
    if (surf) {
        const dChain = axes.map(ax => closure(k + 1, dcsBounds([ax], chain)[0].map(b => ({ ...b, a: b.a, b: b.b }))));
        const truth = (ax: Axis): Code => {
            const d = dChain[axes.indexOf(ax)];
            if (!d) return 'a';
            const [lo, hi] = range(d, k + 1, q0, q1);
            return lo > 0 ? 'g' : hi < 0 ? 'l' : lo === 0 && hi === 0 ? 0 : rng.pick(['g', 'l'] as Code[]);
        };
        let codes: Partial<Record<Axis, Code>> = {};
        if (qtype === 'qual1' || qtype === 'line') {
            const B = rng.pick(axes.filter(ax => req[ax] === 'free'));
            codes = { [B]: truth(B) };
        } else if (qtype === 'qual2') {
            const keep = ineq.filter(ax => truth(ax) === 'g');
            if (!keep.length) return null;
            const A = rng.pick(keep);
            codes = { [A]: 'g' };
        } else if (qtype === 'strict') {
            codes = { [zeroAxis!]: 0 };
        } else {
            for (const ax of axes) { const v = Number(claimCodes[ax]); codes[ax] = v > 0 ? 'g' : v < 0 ? 'l' : 'a'; }
            if (axes.every(ax => codes[ax] === 'a')) return null;
        }
        prem.push(rng.chance(0.5) ? D(q0, q1, codes, 'qual') : D(q1, q0, Object.fromEntries(Object.entries(codes).map(([a, v]) => [a, v === 'g' ? 'l' : v === 'l' ? 'g' : v])) as Partial<Record<Axis, Code>>, 'qual'));
    }

    // v5.1: the chain is the whole item — no profile pendants, no balancing premises, no distractors
    void balance; void profileMoves;
    if (ent > MAX_ENTITIES + 4) return null;
    const n = ent;
    const world = dcsModel(axes, prem, [], n, rng);
    if (!world) return null;
    return { world: { coords: world }, premises: rng.shuffle(prem), queries, n };
}

// ---------------------------------------------------------------- plugin

function lure(axes: readonly Axis[], ctx: LureContext): LureType {
    const { premises, query: q, answer, n } = ctx;
    const qs = new Set(q.args);
    if (premises.some(r => r.args.every(a => qs.has(a)))) return 'surface';
    if (answer === 'undetermined') return holdsDir(axes, q, preferredDir(axes, premises, n)) ? 'possible' : 'none';
    if (answer !== 'contradicted') return 'none';
    const isE = (codes: Partial<Record<Axis, Code>>) => {
        const r: Rel = { kind: 'dir', args: q.args, params: { ...codes } };
        try { return dcsClassify(axes, premises, r, n, true) === 'entailed'; } catch { return false; }
    };
    const rev: Partial<Record<Axis, Code>> = {};
    const near: Partial<Record<Axis, Code>>[] = [];
    for (const ax of axes) {
        const v = codeOf(q, ax);
        rev[ax] = v === 'g' ? 'l' : v === 'l' ? 'g' : typeof v === 'number' ? -v : 'a';
        if (typeof v === 'number') for (const dv of [-1, 1]) {
            const cc: Partial<Record<Axis, Code>> = {};
            for (const a2 of axes) cc[a2] = codeOf(q, a2);
            cc[ax] = v + dv;
            near.push(cc);
        }
    }
    if (isE(rev)) return 'reversal';
    if (near.some(isE)) return 'nearMiss';
    return 'none';
}

export function preferredDir(axes: readonly Axis[], premises: readonly Rel[], n: number): Vals {
    const order: number[] = [];
    for (const r of premises) for (const a of r.args) if (!order.includes(idx(a))) order.push(idx(a));
    for (let i = 0; i < n; i++) if (!order.includes(i)) order.push(i);
    const m = dcsSample(axes, n, dcsBounds(axes, premises), undefined, order);
    if (!m) throw new Error('Inconsistent premises (preferred model)');
    return m;
}

const qtypeOf = (q: Rel) => String(q.params?.['q'] ?? '');

/**
 * Relation category for statedDirectly: exact displacements are one category; a qualitative relation is
 * identified by which axes carry a direction and which an equality (sign and wording do not matter).
 */
export function relCategory(axes: readonly Axis[], r: Rel): string {
    const t = String(r.params?.['t'] ?? 'qual');
    if (t !== 'qual') return 'exact';
    return axes.map(ax => { const c = codeOf(r, ax); return c === 'a' ? '-' : c === 0 ? '=' : '<>'; }).join('');
}

/** "Adjacent cell" phrase in the conclusion ⇒ "follows". */
export const adjacencyPhraseBot = (d: DraftItem): Answer | null => (d.query.params?.['t'] === 'adj' ? 'entailed' : null);

function stepOf(axes: readonly Axis[], r: Rel): number | null {
    const vs = axes.map(ax => codeOf(r, ax)).filter((v): v is number => typeof v === 'number');
    return vs.length === axes.length ? Math.max(...vs.map(Math.abs)) : null;
}

/** Conclusion step larger than every step in the premises ⇒ "contradicts". */
export function stepMagnitudeBot(axes: readonly Axis[], d: DraftItem): Answer | null {
    const K = stepOf(axes, d.query);
    if (K === null) return null;
    const ms = d.premises.map(r => stepOf(axes, r)).filter((x): x is number => x !== null);
    return K > (ms.length ? Math.max(...ms) : 0) ? 'contradicted' : 'entailed';
}

/** Two or more axes in the conclusion ⇒ "contradicts" (multi-axis claims feel riskier). */
export function axisCountBot(axes: readonly Axis[], d: DraftItem): Answer {
    return axes.filter(ax => codeOf(d.query, ax) !== 'a').length >= 2 ? 'contradicted' : 'entailed';
}

/** Win count on the conclusion's primary axis. */
export function dirNetBot(axes: readonly Axis[], d: DraftItem): Answer | null {
    const ax = primaryAxis(axes, d.query);
    if (!ax) return null;
    const net = axisNet(d.premises, ax);
    const s = sgnOf(codeOf(d.query, ax));
    const diff = s * ((net.get(d.query.args[0]) ?? 0) - (net.get(d.query.args[1]) ?? 0));
    return diff > 0 ? 'entailed' : diff < 0 ? 'contradicted' : 'undetermined';
}

function makeDirPlugin(mode: DirMode): FamilyPlugin<DirWorld> {
    const axes = dirAxes(mode);
    const custom = {
        classify: (premises: readonly Rel[], q: Rel, n: number, full: boolean) => dcsClassify(axes, premises, q, n, full),
        consistent: (premises: readonly Rel[], n: number) => dcsConsistent(axes, premises, n),
        model: (premises: readonly Rel[], extra: readonly { rel: Rel; negate?: boolean }[], n: number, rng?: Rng) => dcsModel(axes, premises, extra, n, rng),
        log2Models: (premises: readonly Rel[], n: number) => dcsLog2Models(axes, premises, n),
    };
    const bots: Bot[] = [
        { id: 'adjacencyPhrase', predict: adjacencyPhraseBot },
        { id: 'stepMagnitude', predict: d => stepMagnitudeBot(axes, d) },
        { id: 'axisCount', predict: d => axisCountBot(axes, d) },
        { id: 'netScore', predict: d => dirNetBot(axes, d) },
    ];
    return {
        id: mode as FamilyId,
        formats: ['ternary', 'binary'],
        limits: { minEntities: 3, maxEntities: MAX_ENTITIES },
        supportDomain: 'restricted',
        custom,
        domain: () => ({ size: 0, allDiff: false }),
        compile: (rel, vars) => (v: Vals) => {
            const remap = new Int32Array(64 * 3);
            [rel.args[0], rel.args[1]].forEach((a, i) => { for (let t = 0; t < 3; t++) remap[idx(a) * 3 + t] = v[vars[i] * 3 + t]; });
            return holdsDir(axes, rel, remap);
        },
        adjust: (p: LevelParams, _o, plan) => {
            const q = { ...p };
            // a single-axis or exact claim always has a simple-chain support (no per-axis split is possible)
            const qk = plan.cue['qkind'];
            if (qk && qk !== 'qual2' && qk !== 'strict') { q.pConvergent = 0; q.requireConvergent = false; }
            // two-axis claims: a refutation needs one axis only, so only "Follows" can have a convergent support
            q.sigmaMax = Math.min(q.sigmaMax, 6);
            q.sigmaMin = Math.min(q.sigmaMin, q.sigmaMax);
            return q;
        },
        cueSpace: (p: LevelParams, _f: AnswerFormat) => ({ qkind: dirQueryKinds(mode, p) }),
        supportedLures: (p: LevelParams) => p.lureMix,
        construct: (rng, p, plan) => construct(mode, rng, p, plan),
        statedDirectly: (q, premises) => {
            const k = [...q.args].sort().join(',');
            const cat = relCategory(axes, q);
            return premises.some(r => [...r.args].sort().join(',') === k && relCategory(axes, r) === cat);
        },
        lureOf: ctx => lure(axes, ctx),
        preferredModel: (premises, n) => preferredDir(axes, premises, n),
        cueMatches: (cue, _premises, q) => !cue['qkind'] || qtypeOf(q) === cue['qkind'],
        describe: (vals, names) => describeDir(mode, vals, names),
        render: d => renderDir(mode, d),
        decorate: (d, rng, p) => decorateDir(mode, d, rng, p),
        invertible: () => true,
        bots,
        features: d => {
            const ax = primaryAxis(axes, d.query);
            const net = ax ? axisNet(d.premises, ax) : new Map<string, number>();
            const s = ax ? sgnOf(codeOf(d.query, ax)) : 0;
            const K = stepOf(axes, d.query) ?? 0;
            const ms = d.premises.map(r => stepOf(axes, r)).filter((x): x is number => x !== null);
            return {
                netDiff: s * ((net.get(d.query.args[0]) ?? 0) - (net.get(d.query.args[1]) ?? 0)),
                queryAxes: axes.filter(a => codeOf(d.query, a) !== 'a').length,
                queryK: K,
                maxK: ms.length ? Math.max(...ms) : 0,
                adjPhrase: d.query.params?.['t'] === 'adj' ? 1 : 0,
            };
        },
    };
}

export const dir2dPlugin = makeDirPlugin('dir2d');
export const dir3dSpacePlugin = makeDirPlugin('dir3dSpace');
export const dir3dTimePlugin = makeDirPlugin('dir3dTime');
