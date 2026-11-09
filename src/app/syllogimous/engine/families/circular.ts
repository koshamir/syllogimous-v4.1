// «Круговой порядок» (spec §5.5). n seats at a round table, everyone faces the centre; seats are numbered
// clockwise (top view) and the left neighbour of A is the next seat clockwise. Solver: e0 fixed at seat 0.
//
// Every relation is an exact seating fact and the table is packed (n people, n seats): anything that pins
// the free group would pin the whole table. The construction (see construct) therefore keeps one shared shape
// for all classes and only weak, vacuous-on-an-intact-arc facts around it.

import { Rng } from '../core/rng';
import { Vals, search } from '../core/combinatorics';
import { allIds, buildCsp, classify } from '../core/solve';
import { Answer, AnswerFormat, Bot, DraftItem, LevelParams, LureType, Plan, Premise, Query } from '../core/types';
import { alphabetical } from '../render/ru/common';
import { decorateCirc, describeCirc, renderCirc } from '../render/ru/circular';
import { Construction, DomainSpec, FamilyPlugin, LureContext, Rel, eid, idx } from './plugin';

const MAX = 8;
const mod = (x: number, n: number) => ((x % n) + n) % n;

function compile(rel: Rel, vars: number[], n: number): (v: Vals) => boolean {
    const [a, b, c] = vars;
    const k = Number(rel.params?.['k'] ?? 0);
    const d = (v: Vals) => mod(v[a] - v[b], n);
    switch (rel.kind) {
        case 'immLeft': return v => d(v) === 1;
        case 'immRight': return v => d(v) === n - 1;
        case 'adj': return v => { const x = d(v); return x === 1 || x === n - 1; };
        case 'notAdj': return v => { const x = d(v); return x !== 1 && x !== n - 1; };
        case 'opposite': return v => d(v) * 2 === n;
        case 'gap': return v => { const x = d(v); return Math.min(x, n - x) === k + 1; };
        case 'between': return v => {
            const x = mod(v[b] - v[a], n);
            const y = mod(v[c] - v[a], n);
            return (x === 1 && y === n - 1) || (x === n - 1 && y === 1);
        };
        default: throw new Error('Unknown circular relation ' + rel.kind);
    }
}

const domain = (_r: readonly Rel[], _nl: number, nFull: number): DomainSpec => ({ size: nFull, allDiff: true, fixFirst: true });
const solver = { supportDomain: 'restricted' as const, packed: true, domain, compile };

const TYPE: Record<string, string> = { immLeft: 'imm', immRight: 'imm', adj: 'adj', notAdj: 'adj', opposite: 'opp', gap: 'gap', between: 'between' };

/**
 * Conclusion kinds. «Сразу слева» and «рядом» are premises only: an adjacency is never the end of a long
 * non-local chain (it is stated or follows from one or two facts), so such conclusions cannot reach σ ≥ 3.
 */
export function circQueryKinds(_p: LevelParams): string[] {
    // «напротив» as a conclusion is never "Unknown" on a cut arc of half the table (≤ 8 seats), and
    // «между» follows locally from two neighbour facts; both stay premises.
    return ['gap'];
}

function stated(q: Rel, premises: readonly Rel[]): boolean {
    const t = TYPE[q.kind];
    const s = [...q.args].sort().join(',');
    return premises.some(r => TYPE[r.kind] === t && [...r.args].sort().join(',') === s);
}

const key = (r: Rel) => `${TYPE[r.kind]}:${[...r.args].sort().join(',')}:${r.params?.['k'] ?? ''}`;

export interface CircWorld { seats: number[] }

/**
 * Construction. All classes share one shape: the conclusion ends c0…ck are joined by k links and the claim is
 * «по короткой дуге ровно k − 1 человек». The classes differ in ONE link:
 *   E — all links «сразу слева / справа» (the arc is contiguous: the claim is true);
 *   C — one link is «между X и Y по короткой дуге ровно 1 человек» (the arc is one seat longer; the
 *       direction of that link follows from the packed table);
 *   U — one link is «X и Y сидят не рядом» (the two pieces of the arc float).
 * Premise kinds are re-balanced inside the free group (each class ends with the same multiset), and each
 * member of the free group gets exactly one weak fact, so counts never depend on the class.
 */
function construct(rng: Rng, p: LevelParams, plan: Plan): Construction<CircWorld> | null {
    const target = plan.target;
    const k = p.sigmaMin + rng.int(p.sigmaMax - p.sigmaMin + 1);
    const n = Math.max(5, Math.min(MAX, Math.max(p.n + 2, 2 * k + 2)));
    if (k < 2 || 2 * (k + 1) > n) return null;
    const cut = k >= 3 ? 1 + rng.int(k - 2) : rng.int(k);               // link index (0-based) that differs
    const ents = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    const arc = ents.slice(0, k + 1);
    const rest = ents.slice(k + 1);
    // seats: E — contiguous arc; C — one extra seat (a rest member) inside link `cut`;
    // U — the arc split after c_cut by g ≥ 1 rest members
    const order: number[] = [];
    if (target === 'entailed') order.push(...arc, ...rest);
    else {
        const g = target === 'contradicted' ? 1 : 1 + rng.int(Math.max(1, rest.length - 1));
        if (rest.length < g + 1) return null;
        order.push(...arc.slice(0, cut + 1), ...rest.slice(0, g), ...arc.slice(cut + 1), ...rest.slice(g));
    }
    const seatOf = new Int32Array(n);
    order.forEach((e, s0) => (seatOf[e] = s0));
    const dir = rng.chance(0.5) ? 1 : -1;
    const world = Array.from(seatOf, x => mod(dir * (x - seatOf[0]), n));
    const dist = (a: number, b: number) => { const d = mod(world[a] - world[b], n); return Math.min(d, n - d); };
    // «v сразу слева от u» ≡ «u сразу справа от v»: the kind is drawn at random so that kind counts do not
    // reveal whether all neighbour links run the same way
    const imm = (v: number, u: number): Premise => {
        const [l, r] = mod(world[v] - world[u], n) === 1 ? [v, u] : [u, v];   // l is r's left neighbour
        return rng.chance(0.5) ? { kind: 'immLeft', args: [eid(l), eid(r)] } : { kind: 'immRight', args: [eid(r), eid(l)] };
    };
    const gapOf = (a: number, b: number): Premise => ({ kind: 'gap', args: [eid(a), eid(b)], params: { k: dist(a, b) - 1 } });
    const notAdj = (a: number, b: number): Premise => ({ kind: 'notAdj', args: [eid(a), eid(b)] });

    const prem: Premise[] = [];
    for (let j = 1; j <= k; j++) {
        const [u, v] = [arc[j - 1], arc[j]];
        if (j - 1 === cut && target === 'contradicted') prem.push(gapOf(v, u));
        else if (j - 1 === cut && target === 'undetermined') prem.push(notAdj(v, u));
        else prem.push(imm(v, u));
    }
    const [c0, ck] = [arc[0], arc[k]];
    const query: Query = { kind: 'gap', args: rng.chance(0.5) ? [eid(c0), eid(ck)] : [eid(ck), eid(c0)], params: { k: k - 1 } };
    // kind balancing inside the free group: every class ends with the multiset {imm × k, gap × 1, notAdj × 1}
    // on top of the arc's shared part (E adds gap + notAdj, C adds imm + notAdj, U adds imm + gap)
    const need: string[] = target === 'entailed' ? ['gap', 'notAdj'] : target === 'contradicted' ? ['imm', 'notAdj'] : ['imm', 'gap'];
    const inner = arc.slice(1, k);
    const pool = [...rest, ...inner];
    const keys = new Set(prem.map(key));
    const push = (r: Premise) => { if (keys.has(key(r))) return false; keys.add(key(r)); prem.push(r); return true; };
    for (const kd of need) {
        const cands: [number, number][] = [];
        for (const a of rest) for (const b of pool) if (a !== b && (kd === 'imm' ? dist(a, b) === 1 : dist(a, b) >= 2)) cands.push([a, b]);
        const ok = rng.shuffle(cands).find(([a, b]) => push(kd === 'imm' ? imm(a, b) : kd === 'gap' ? gapOf(a, b) : notAdj(a, b)));
        if (!ok) return null;
    }
    // surface lure: the conclusion pair in a weak fact of another kind («не рядом»), never deciding the count
    if (plan.lure === 'surface' && !push(notAdj(c0, ck))) return null;
    // every free-group member: exactly one «не рядом» with an interior arc member (vacuous on an intact arc),
    // so the count never depends on the class; distractors: more such weak facts
    for (const x of rest) {
        const y = [...rng.shuffle(inner.slice()), ...rng.shuffle(rest.slice())].find(z => z !== x && dist(x, z) >= 2 && !keys.has(key(notAdj(x, z))));
        if (y === undefined || !push(notAdj(x, y))) return null;
    }
    for (let i = 0, t = 0; i < p.distractors && t < 20; t++) {
        const x = rng.pick(rest);
        const y = rng.pick(pool);
        if (x !== y && dist(x, y) >= 2 && push(notAdj(x, y))) i++;
    }
    return { world: { seats: world }, premises: rng.shuffle(prem), queries: [query], n };
}

function preferred(premises: readonly Rel[], n: number): Vals {
    const order: number[] = [];
    for (const r of premises) for (const a of r.args) if (!order.includes(idx(a))) order.push(idx(a));
    for (let i = 0; i < n; i++) if (!order.includes(i)) order.push(i);
    const { csp } = buildCsp(solver, premises.map(rel => ({ rel })), n, true, allIds(n));
    let found: Vals | null = null;
    search(csp, v => { found = v.slice(); return true; }, { order });
    if (!found) throw new Error('Inconsistent premises (preferred model)');
    return found;
}

function lure(ctx: LureContext): LureType {
    const { premises, query: q, answer, n } = ctx;
    const qs = new Set(q.args);
    if (premises.some(r => r.args.filter(a => qs.has(a)).length >= 2)) return 'surface';
    if (answer === 'undetermined') return compile(q, q.args.map(idx), n)(preferred(premises, n)) ? 'possible' : 'none';
    if (answer !== 'contradicted') return 'none';
    const isE = (r: Rel) => { try { return classify(solver, premises, r, n) === 'entailed'; } catch { return false; } };
    if (q.kind === 'immLeft' && isE({ kind: 'immRight', args: q.args })) return 'reversal';
    if (q.kind === 'gap') {
        const k = Number(q.params?.['k']);
        if ([k - 1, k + 1].some(x => x >= 1 && isE({ ...q, params: { k: x } }))) return 'nearMiss';
    }
    return 'none';
}

/** Reads the alphabetical participant list as the clockwise seating order. */
export function circInstructionBot(d: DraftItem): Answer {
    const names = d.entities.map(e => e.name);
    const order = alphabetical(names);
    const vals = new Int32Array(names.length);
    names.forEach((nm, i) => (vals[i] = order.indexOf(nm)));
    return compile(d.query, d.query.args.map(idx), names.length)(vals) ? 'entailed' : 'contradicted';
}

const bots: Bot[] = [
    { id: 'instructionOrder', predict: circInstructionBot },
    {
        id: 'degree',
        predict: d => {
            const c = new Map<string, number>();
            for (const r of d.premises) for (const a of r.args) c.set(a, (c.get(a) ?? 0) + 1);
            const ds = d.query.args.map(a => c.get(a) ?? 0);
            // "well-connected pairs are determined": both conclusion entities mentioned ≥ 3 times ⇒ follows
            return ds.every(x => x >= 3) ? 'entailed' : ds.some(x => x <= 1) ? 'undetermined' : 'contradicted';
        },
    },
];

export const circularPlugin: FamilyPlugin<CircWorld> = {
    id: 'circular',
    formats: ['ternary', 'binary'],
    limits: { minEntities: 4, maxEntities: MAX },
    ...solver,
    adjust: (p: LevelParams) => {
        const q = { ...p };
        // ≤ 8 seats: the arc (σ + 1 people) must stay shorter than half the table, or the short way round
        // runs through the free group and the support shrinks
        q.sigmaMax = Math.min(q.sigmaMax, 3);
        q.sigmaMin = Math.min(q.sigmaMin, q.sigmaMax);
        q.pConvergent = 0;          // convergence is not targeted here (supports are found, not built)
        q.requireConvergent = false;
        return q;
    },
    cueSpace: (p: LevelParams, _f: AnswerFormat) => ({ qkind: circQueryKinds(p) }),
    supportedLures: p => p.lureMix,
    construct: (rng, p, plan) => construct(rng, p, plan),
    statedDirectly: stated,
    lureOf: lure,
    preferredModel: preferred,
    cueMatches: (cue, _premises, q) => !cue['qkind'] || q.kind === cue['qkind'],
    describe: (vals, names) => describeCirc(vals, names),
    render: d => renderCirc(d),
    decorate: (d, rng, p) => decorateCirc(d, rng, p),
    invertible: kind => kind === 'immLeft' || kind === 'immRight',
    bots,
    features: d => {
        const instr = circInstructionBot(d);
        return { instrOrder: instr === 'entailed' ? 1 : -1, queryK: Number(d.query.params?.['k'] ?? 0) };
    },
};
