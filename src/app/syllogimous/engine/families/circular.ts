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

/** Conclusion kinds (the scheduler's `qkind`): a count on the short arc, a neighbour side, «рядом», «напротив». */
export function circQueryKinds(_p: LevelParams): string[] {
    return ['gap', 'gap', 'imm', 'adj'];
}

function stated(q: Rel, premises: readonly Rel[]): boolean {
    const t = TYPE[q.kind];
    const s = [...q.args].sort().join(',');
    return premises.some(r => TYPE[r.kind] === t && [...r.args].sort().join(',') === s);
}

const key = (r: Rel) => `${TYPE[r.kind]}:${[...r.args].sort().join(',')}:${r.params?.['k'] ?? ''}`;

export interface CircWorld { seats: number[] }

/**
 * Construction (v5.1): a random seating and ONE chain of P facts from the first conclusion person to the
 * second — nothing else. Links are neighbour sides (directed), «рядом» / «между ними k человек» (undirected:
 * the reasoner has to keep both branches until the packed table or a later fact closes one) and «между»
 * (three people in one fact). The conclusion is a true or a false claim about the two ends; the pipeline
 * keeps the item only if the class is the planned one and every premise is necessary.
 */
function construct(rng: Rng, p: LevelParams, plan: Plan): Construction<CircWorld> | null {
    const P = p.premises;
    const qkind = plan.cue['qkind'] ?? 'gap';
    // chain nodes: P + 1, plus one per «между» fact; unnamed people fill the rest of the table
    const nb = P >= 2 && rng.chance(p.pTernary) ? 1 : 0;
    const nodes = P + 1 + nb;
    const n = Math.max(4, Math.min(MAX, nodes + rng.int(3)));
    if (nodes > n) return null;
    const seat = rng.shuffle(Array.from({ length: n }, (_, i) => i));          // seat[e]
    const world = seat.map(x => mod(x - seat[0], n));
    const at = new Map(world.map((x, e) => [x, e]));
    const dist = (a: number, b: number) => { const d = mod(world[a] - world[b], n); return Math.min(d, n - d); };
    const imm = (v: number, u: number): Premise => {
        const [l, r] = mod(world[v] - world[u], n) === 1 ? [v, u] : [u, v];   // l is r's left neighbour
        return rng.chance(0.5) ? { kind: 'immLeft', args: [eid(l), eid(r)] } : { kind: 'immRight', args: [eid(r), eid(l)] };
    };
    const used = new Set<number>();
    let cur = rng.int(n);
    used.add(cur);
    const c0 = cur;
    const prem: Premise[] = [];
    let betweenLeft = nb;
    while (prem.length < P) {
        const left = P - prem.length;
        // «между»: cur's neighbour m and m's other neighbour x — "m sits between cur and x"
        if (betweenLeft && (left === 1 || rng.chance(0.4))) {
            const s = rng.chance(0.5) ? 1 : -1;
            const m = at.get(mod(world[cur] + s, n))!;
            const x = at.get(mod(world[cur] + 2 * s, n))!;
            if (!used.has(m) && !used.has(x) && m !== x) {
                prem.push({ kind: 'between', args: rng.chance(0.5) ? [eid(m), eid(cur), eid(x)] : [eid(m), eid(x), eid(cur)] });
                used.add(m); used.add(x);
                cur = x;
                betweenLeft--;
                continue;
            }
        }
        const cands = Array.from({ length: n }, (_, e) => e).filter(e => !used.has(e));
        if (!cands.length) return null;
        // near people first: long undirected jumps are loose and rarely leave a determined conclusion
        const w = cands.map(e => { const d = dist(e, cur); return d === 1 ? 5 : d === 2 ? 3 : 1; });
        let u = rng.float() * w.reduce((x, y) => x + y, 0);
        let nx = cands[cands.length - 1];
        for (let i = 0; i < cands.length; i++) { if ((u -= w[i]) < 0) { nx = cands[i]; break; } }
        const d = dist(nx, cur);
        const pair = rng.chance(0.5) ? [eid(nx), eid(cur)] : [eid(cur), eid(nx)];
        if (d === 1) prem.push(rng.chance(0.7) ? imm(nx, cur) : { kind: 'adj', args: pair });
        else if (2 * d === n && rng.chance(0.5)) prem.push({ kind: 'opposite', args: pair });
        else prem.push({ kind: 'gap', args: pair, params: { k: d - 1 } });
        used.add(nx);
        cur = nx;
    }
    if (betweenLeft) return null;
    const ck = cur;
    const D = dist(c0, ck);
    const qa = rng.chance(0.5) ? [eid(c0), eid(ck)] : [eid(ck), eid(c0)];
    const truths: Query[] = [];
    const lies: Query[] = [];
    if (qkind === 'gap') {
        if (D >= 2) truths.push({ kind: 'gap', args: qa, params: { k: D - 1 } });
        for (const k of rng.shuffle([D - 2, D].filter(x => x >= 1 && x + 1 <= Math.floor(n / 2)))) lies.push({ kind: 'gap', args: qa, params: { k } });
    } else if (qkind === 'imm') {
        const leftOf = mod(world[idx(qa[0])] - world[idx(qa[1])], n) === 1;
        const rightOf = mod(world[idx(qa[1])] - world[idx(qa[0])], n) === 1;
        const L: Query = { kind: 'immLeft', args: qa };
        const R: Query = { kind: 'immRight', args: qa };
        if (leftOf) truths.push(L); else lies.push(L);
        if (rightOf) truths.push(R); else lies.push(R);
        rng.shuffle(lies);
    } else {
        (D === 1 ? truths : lies).push({ kind: 'adj', args: qa });
    }
    const queries = plan.target === 'entailed' ? truths : plan.target === 'contradicted' ? lies : rng.shuffle([...truths, ...lies]);
    if (!queries.length) return null;
    return { world: { seats: world }, premises: rng.shuffle(prem), queries, n };
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
    fixedWorld: true,
    adjust: (p: LevelParams) => {
        const q = { ...p };
        // ≤ 8 seats: the arc (σ + 1 people) must stay shorter than half the table, or the short way round
        // runs through the free group and the support shrinks
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
    cueMatches: (cue, _premises, q) => !cue['qkind'] || TYPE[q.kind] === cue['qkind'],
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
