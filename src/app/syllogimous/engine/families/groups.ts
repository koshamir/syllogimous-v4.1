// «Равенство и противоположность» (spec §5.1). World: colour[e] ∈ {0,1}.
//
// Construction: two components always. Determined items: a path a…b of length σ plus a distractor tree;
// "Unknown" items: the same path with one interior edge cut and the distractor tree hung on one half —
// identical premise counts, a and b keep base degree 1 in every class. The parity bot is steered by the
// colour of a leaf outside the path, the degree bot by extra leaves on a/b (both independent of the target).

import { Rng } from '../core/rng';
import { Vals, search } from '../core/combinatorics';
import { allIds, buildCsp } from '../core/solve';
import { Answer, AnswerFormat, Bot, DraftItem, EngineOptions, LevelParams, LureType, Plan, Premise, Query } from '../core/types';
import { decorateGroups, describeGroups, renderGroups } from '../render/ru/groups';
import { Construction, DomainSpec, FamilyPlugin, LureContext, Rel, eid, idx } from './plugin';

const MAX = 10;

function compile(rel: Rel, vars: number[]): (v: Vals) => boolean {
    const [a, b, c, d] = vars;
    switch (rel.kind) {
        case 'same': return v => v[a] === v[b];
        case 'opp': return v => v[a] !== v[b];
        case 'meta': {
            const same = rel.params?.['rel'] === 'same';
            return v => ((v[a] ^ v[b]) === (v[c] ^ v[d])) === same;
        }
        default: throw new Error(`Unknown groups relation ${rel.kind}`);
    }
}

const domain = (): DomainSpec => ({ size: 2, allDiff: false, fixFirst: true });

const solver = { supportDomain: 'restricted' as const, domain, compile: (r: Rel, v: number[]) => compile(r, v) };

export function holdsGroups(rel: Rel, vals: ArrayLike<number>): boolean {
    return compile(rel, rel.args.map(idx))(vals as Vals);
}

// ---------------------------------------------------------------- bot signals

export function oppParity(premises: readonly Rel[]): number {
    return premises.filter(r => r.kind === 'opp').length % 2;
}

/** "Parity": even number of «противоположен» overall ⇒ the pair is on one side. */
export function parityOpinion(premises: readonly Rel[], q: Rel): Answer {
    const sameSide = oppParity(premises) === 0;
    return sameSide === (q.kind === 'same') ? 'entailed' : 'contradicted';
}

export function groupsDegrees(premises: readonly Rel[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const r of premises) for (const a of r.args) m.set(a, (m.get(a) ?? 0) + 1);
    return m;
}

/** "Degree": equally often mentioned ⇒ same side. */
export function groupsDegreeOpinion(premises: readonly Rel[], q: Rel): Answer {
    const d = groupsDegrees(premises);
    const equal = (d.get(q.args[0]) ?? 0) === (d.get(q.args[1]) ?? 0);
    return equal === (q.kind === 'same') ? 'entailed' : 'contradicted';
}

// ---------------------------------------------------------------- construction

interface Edge { u: number; v: number; opp: boolean }

function colours(n: number, edges: readonly Edge[]): Int32Array {
    const col = new Int32Array(n).fill(-1);
    const adj: [number, boolean][][] = Array.from({ length: n }, () => []);
    for (const e of edges) { adj[e.u].push([e.v, e.opp]); adj[e.v].push([e.u, e.opp]); }
    for (let s = 0; s < n; s++) {
        if (col[s] >= 0) continue;
        col[s] = 0;
        const st = [s];
        while (st.length) {
            const x = st.pop()!;
            for (const [y, o] of adj[x]) if (col[y] < 0) { col[y] = col[x] ^ (o ? 1 : 0); st.push(y); }
        }
    }
    return col;
}

function randomTree(rng: Rng, nodes: number[]): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 1; i < nodes.length; i++) out.push([nodes[i], nodes[rng.int(i)]]);
    return out;
}

export interface GroupsWorld { colour: Int32Array }

function construct(rng: Rng, p: LevelParams, plan: Plan): Construction<GroupsWorld> | null {
    const d = p.sigmaMin + rng.int(p.sigmaMax - p.sigmaMin + 1);
    const n = Math.min(MAX, Math.max(p.n, d + 5));
    const ents = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    const path = ents.slice(0, d + 1);
    const spares = ents.slice(d + 1, d + 3);
    const comp2 = ents.slice(d + 3);
    if (comp2.length < 2) return null;
    const a = path[0];
    const b = path[d];
    const qkind = plan.cue['qkind'] ?? 'same';
    const target = plan.target;

    const tree: [number, number][] = [];
    for (let i = 0; i < d; i++) tree.push([path[i], path[i + 1]]);
    tree.push(...randomTree(rng, rng.shuffle(comp2.slice())));
    if (target === 'undetermined') {
        const j = d >= 3 ? 1 + rng.int(d - 2) : 0;
        tree.splice(j, 1);                                       // cut path edge (path[j], path[j+1])
        const interior = path.slice(1, d);
        const anchor = j === 0 && d <= 2 ? a : rng.pick(interior.length ? interior : [a]);
        tree.push([rng.pick(comp2), anchor]);
    }
    const edges: Edge[] = tree.map(([u, v]) => ({ u, v, opp: rng.chance(0.5) }));
    let col = colours(n, edges);
    if (target !== 'undetermined') {
        const wantSame = (target === 'entailed') === (qkind === 'same');
        // flip exactly one path edge (edges[0…d-1] are the path) if the a–b relation is wrong
        if ((col[a] === col[b]) !== wantSame) {
            const e = edges[rng.int(d)];
            e.opp = !e.opp;
            col = colours(n, edges);
        }
    }
    // cycles inside the distractor tree
    const extra: Edge[] = [];
    if (p.level >= 4 && comp2.length >= 3) {
        const cyc = rng.int(3);
        const has = (u: number, v: number) => [...edges, ...extra].some(e => (e.u === u && e.v === v) || (e.u === v && e.v === u));
        for (let t = 0; t < 10 && extra.length < cyc; t++) {
            const [u, v] = rng.shuffle(comp2.slice()).slice(0, 2);
            if (!has(u, v)) extra.push({ u, v, opp: col[u] !== col[v] });
        }
    }
    // metas (stochastic rounding of metaRate × edges) and the surface lure
    const metas: [number, number, number, number][] = [];
    const mExpected = p.metaRate * (edges.length + extra.length);
    const mCount = Math.floor(mExpected) + (rng.chance(mExpected - Math.floor(mExpected)) ? 1 : 0);
    for (let t = 0; t < mCount; t++) metas.push(rng.shuffle(ents.slice()).slice(0, 4) as [number, number, number, number]);
    if (plan.lure === 'surface') {
        const others = rng.shuffle(ents.filter(e => e !== a && e !== b)).slice(0, 2);
        metas.push(rng.chance(0.5) ? [a, b, others[0], others[1]] : [others[0], others[1], b, a]);
    }
    // degree steering with the two spare entities
    const degOf = (e: number) =>
        [...edges, ...extra].filter(x => x.u === e || x.v === e).length + metas.filter(m => m.includes(e)).length;
    const wantDeg = plan.cue['deg'];
    let da = degOf(a);
    let db = degOf(b);
    const spare = spares.slice();
    const leaf = (host: number) => { const s = spare.pop()!; edges.push({ u: s, v: host, opp: rng.chance(0.5) }); return s; };
    if (wantDeg) {
        const wantEqual = (wantDeg === 'entailed') === (qkind === 'same');
        if (wantEqual && da !== db) {
            if (Math.abs(da - db) > spare.length) return null;
            while (da < db) { leaf(a); da++; }
            while (db < da) { leaf(b); db++; }
        } else if (!wantEqual && da === db) {
            if (rng.chance(0.5)) { leaf(a); da++; } else { leaf(b); db++; }
        }
    }
    while (spare.length) leaf(rng.pick(comp2));
    col = colours(n, edges);

    // parity steering: flip the colour of a leaf outside {a, b} (exactly one binary edge changes)
    const wantPar = plan.cue['parity'];
    const binary = (): Edge[] => [...edges, ...extra.map(e => ({ ...e, opp: col[e.u] !== col[e.v] }))];
    const oppOf = () => binary().filter(e => col[e.u] !== col[e.v]).length;
    if (wantPar) {
        const q: Rel = { kind: qkind, args: [eid(a), eid(b)] };
        const opinion = ((oppOf() % 2 === 0) === (q.kind === 'same')) ? 'entailed' : 'contradicted';
        if (opinion !== wantPar) {
            const all = binary();
            const deg = (x: number) => all.filter(e => e.u === x || e.v === x).length;
            const leaves = ents.filter(x => x !== a && x !== b && deg(x) === 1);
            if (!leaves.length) return null;
            const L = rng.pick(leaves);
            col[L] ^= 1;
        }
    }
    const premises: Premise[] = [];
    for (const e of [...edges, ...extra]) {
        const kind = col[e.u] === col[e.v] ? 'same' : 'opp';
        premises.push({ kind, args: rng.chance(0.5) ? [eid(e.u), eid(e.v)] : [eid(e.v), eid(e.u)] });
    }
    for (const [u, v, w, z] of metas) {
        const rel = (col[u] ^ col[v]) === (col[w] ^ col[z]) ? 'same' : 'opp';
        premises.push({ kind: 'meta', args: [u, v, w, z].map(eid), params: { rel } });
    }
    const query: Query = { kind: qkind, args: rng.chance(0.5) ? [eid(a), eid(b)] : [eid(b), eid(a)] };
    return { world: { colour: col }, premises: rng.shuffle(premises), queries: [query], n };
}

// ---------------------------------------------------------------- plugin

function preferred(premises: readonly Rel[], n: number): Vals {
    const order: number[] = [];
    for (const r of premises) for (const x of r.args) if (!order.includes(idx(x))) order.push(idx(x));
    for (let i = 0; i < n; i++) if (!order.includes(i)) order.push(i);
    const { csp } = buildCsp(solver, premises.map(rel => ({ rel })), n, true, allIds(n));
    let found: Vals | null = null;
    search(csp, v => { found = v.slice(); return true; }, { order });
    if (!found) throw new Error('Inconsistent premises (preferred model)');
    return found;
}

function lure(ctx: LureContext): LureType {
    const qs = new Set(ctx.query.args);
    if (ctx.premises.some(r => r.args.filter(x => qs.has(x)).length >= 2)) return 'surface';
    if (ctx.answer === 'undetermined') return holdsGroups(ctx.query, preferred(ctx.premises, ctx.n)) ? 'possible' : 'none';
    return 'none';
}

const ansVals = (format: AnswerFormat) => ['entailed', 'contradicted'];

const shown = (d: DraftItem) => d.displayOrder.map(i => d.premises[i]);

const bots: Bot[] = [
    { id: 'parity', predict: d => parityOpinion(d.premises, d.query) },
    { id: 'degree', predict: d => groupsDegreeOpinion(d.premises, d.query) },
    {
        id: 'endpoint',
        predict: d => {
            const deg = groupsDegrees(d.premises);
            return deg.get(d.query.args[0]) === 1 && deg.get(d.query.args[1]) === 1 ? parityOpinion(d.premises, d.query) : null;
        },
    },
];

export const groupsPlugin: FamilyPlugin<GroupsWorld> = {
    id: 'groups',
    formats: ['ternary', 'binary'],
    limits: { minEntities: 3, maxEntities: MAX },
    ...solver,
    adjust(p: LevelParams, _o: EngineOptions, _plan: Plan): LevelParams {
        const q = { ...p };
        q.sigmaMax = Math.min(q.sigmaMax, MAX - 5);
        q.sigmaMin = Math.min(q.sigmaMin, q.sigmaMax);
        q.pConvergent = 0;              // a parity support is always a simple path (convergence only via metas)
        q.requireConvergent = false;
        q.n = Math.min(MAX, q.n);
        return q;
    },
    cueSpace: (_p, format) => ({ qkind: ['same', 'opp'], parity: ansVals(format), deg: ansVals(format) }),
    supportedLures: (p, o) => p.lureMix.filter(l => l !== 'reversal' && l !== 'nearMiss' && (l !== 'surface' || o.metas)),
    construct: (rng, p, plan) => construct(rng, p, plan),
    statedDirectly: (q, premises) => {
        const k = [...q.args].sort().join(',');
        return premises.some(r => (r.kind === 'same' || r.kind === 'opp') && [...r.args].sort().join(',') === k);
    },
    lureOf: lure,
    preferredModel: preferred,
    cueMatches: (cue, premises, q) =>
        (!cue['qkind'] || q.kind === cue['qkind'])
        && (!cue['parity'] || parityOpinion(premises, q) === cue['parity'])
        && (!cue['deg'] || groupsDegreeOpinion(premises, q) === cue['deg']),
    describe: (vals, names) => describeGroups(vals, names),
    render: d => renderGroups(d),
    decorate: (d, rng, p) => decorateGroups(d, rng, p),
    invertible: kind => kind === 'same' || kind === 'opp' || kind === 'meta',
    bots,
    features: d => {
        const deg = groupsDegrees(d.premises);
        const [x, y] = d.query.args;
        const opp = d.premises.filter(r => r.kind === 'opp').length;
        const shownOpp = shown(d).filter(r => (r.kind === 'opp') !== !!r.inverted).length;
        return {
            parity: parityOpinion(d.premises, d.query) === 'entailed' ? 1 : -1,
            degEqual: (deg.get(x) ?? 0) === (deg.get(y) ?? 0) ? 1 : 0,
            oppCount: opp,
            oppShownParity: shownOpp % 2,
            querySame: d.query.kind === 'same' ? 1 : 0,
        };
    },
};
