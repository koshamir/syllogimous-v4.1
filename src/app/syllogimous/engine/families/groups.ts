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

const MAX = 12;

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

export interface GroupsWorld { colour: Int32Array }

/**
 * Construction (v5.1): ONE path from a to b, nothing else. A link of the path is a plain fact
 * («равен» / «противоположен») or, with meta-relations on, a pair of facts: «u к v — как c к d» plus the c–d fact
 * (two premises that have to be combined to get one link). Determined items: the whole path. "Unknown": the
 * same path with one inner link missing, so the two halves never meet.
 */
function construct(rng: Rng, p: LevelParams, plan: Plan): Construction<GroupsWorld> | null {
    const P = p.premises;
    const qkind = plan.cue['qkind'] ?? 'same';
    const target = plan.target;
    let metas = 0;
    if (p.metaRate > 0 && P >= 2 && rng.chance(p.metaRate)) metas = P >= 5 && rng.chance(0.3) ? 2 : 1;
    let links = P - metas;                       // links actually stated
    if (target === 'undetermined' && links < 2) { metas = 0; links = P; }
    const pathLinks = target === 'undetermined' ? links + 1 : links;
    const n = pathLinks + 1 + 2 * metas;
    if (n > MAX) return null;
    const ents = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    const path = ents.slice(0, pathLinks + 1);
    const extra = ents.slice(pathLinks + 1);
    const a = path[0];
    const b = path[pathLinks];
    const col = new Int32Array(n);
    for (let i = 0; i < n; i++) col[i] = rng.int(2);
    if (target !== 'undetermined') {
        const wantSame = (target === 'entailed') === (qkind === 'same');
        col[b] = wantSame ? col[a] : 1 - col[a];
    }
    const gap = target === 'undetermined' ? 1 + rng.int(pathLinks - 2) : -1;       // inner link that is not stated
    const stated = Array.from({ length: pathLinks }, (_, i) => i).filter(i => i !== gap);
    const metaAt = new Set(rng.shuffle(stated.slice()).slice(0, metas));
    const pair = (u: number, v: number) => (rng.chance(0.5) ? [eid(u), eid(v)] : [eid(v), eid(u)]);
    const fact = (u: number, v: number): Premise => ({ kind: col[u] === col[v] ? 'same' : 'opp', args: pair(u, v) });
    const premises: Premise[] = [];
    let x = 0;
    for (const i of stated) {
        const [u, v] = [path[i], path[i + 1]];
        if (!metaAt.has(i)) { premises.push(fact(u, v)); continue; }
        const [c, d] = [extra[x++], extra[x++]];
        const rel = (col[u] ^ col[v]) === (col[c] ^ col[d]) ? 'same' : 'opp';
        const first = rng.chance(0.5);
        premises.push({ kind: 'meta', args: [...(first ? pair(u, v) : pair(c, d)), ...(first ? pair(c, d) : pair(u, v))], params: { rel } });
        premises.push(fact(c, d));
    }
    const query: Query = { kind: qkind, args: pair(a, b) };
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
        q.pConvergent = 0;              // a parity support is always a simple path (convergence only via metas)
        q.requireConvergent = false;
        q.n = Math.min(MAX, q.n);
        return q;
    },
    cueSpace: () => ({ qkind: ['same', 'opp'] }),
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
