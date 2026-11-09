// «Три группы» (spec §9.4). World: each participant in one of three groups. «В разных группах» is not transitive,
// so "Unknown" arises naturally on a connected chain (A ≠ X, X ≠ B ⇒ A vs B unknown).
//
// Construction: a chain a…b of σ links — "Follows" all «в одной», "Contradicts" exactly one «в разных», "Unknown"
// exactly two. Pendant leaves on interior members bring the total number of «в разных» to a value drawn
// independently of the class, so the counts of both kinds are identical across classes.

import { Rng } from '../core/rng';
import { Answer, AnswerFormat, Bot, DraftItem, EngineOptions, ItemRender, LevelParams, LureType, Plan, Premise, Query } from '../core/types';
import { NOTE_INVERSION, inv, subj } from '../render/ru/common';
import { makeEnumKit, partitions } from './enum';
import { Construction, FamilyPlugin, LureContext, Rel, eid, idx } from './plugin';

const MAX = 10;

const kit = makeEnumKit(n => partitions(n, 3), (r, v) => {
    const [a, b] = r.args.map(idx);
    return r.kind === 'same' ? v[a] === v[b] : v[a] !== v[b];
});

export const groups3Kit = kit;

function construct(rng: Rng, p: LevelParams, plan: Plan): Construction<null> | null {
    const k = Math.max(2, p.sigmaMin + rng.int(p.sigmaMax - p.sigmaMin + 1));
    const d = Math.max(2, Math.min(p.distractors + 1, MAX - k - 1));
    const n = k + 1 + d;
    if (n > MAX) return null;
    const target = plan.target;
    const qkind = plan.cue['qkind'] ?? 'same';
    // «в одной группе» true → 0 «в разных» on the chain; false → 1; unknown → 2
    const sameTrue = (target === 'entailed') === (qkind === 'same');
    const coreDiff = target === 'undetermined' ? 2 : sameTrue ? 0 : 1;
    if (coreDiff > k) return null;
    const diffAt = new Set(rng.shuffle(Array.from({ length: k }, (_, i) => i)).slice(0, coreDiff));
    const ents = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    const chain = ents.slice(0, k + 1);
    const leaves = ents.slice(k + 1);
    const g = new Array(n).fill(0);
    g[chain[0]] = rng.int(3);
    const other = (x: number) => (x + 1 + rng.int(2)) % 3;
    const premises: Premise[] = [];
    const link = (u: number, v: number, diff: boolean): Premise => ({ kind: diff ? 'diff' : 'same', args: rng.chance(0.5) ? [eid(u), eid(v)] : [eid(v), eid(u)] });
    for (let i = 0; i < k; i++) {
        const diff = diffAt.has(i);
        g[chain[i + 1]] = diff ? other(g[chain[i]]) : g[chain[i]];
        premises.push(link(chain[i], chain[i + 1], diff));
    }
    // total «в разных» drawn independently of the class: T ∈ [2, d]
    const T = 2 + rng.int(d - 1);
    const leafDiff = new Set(rng.shuffle(leaves.slice()).slice(0, T - coreDiff));
    const hosts = chain.slice(1, k);
    const attached: number[] = [];
    for (const l of leaves) {
        const h = rng.pick([...hosts, ...attached]);
        const diff = leafDiff.has(l);
        g[l] = diff ? other(g[h]) : g[h];
        premises.push(link(h, l, diff));
        attached.push(l);
    }
    const [a, b] = [chain[0], chain[k]];
    const query: Query = { kind: qkind, args: rng.chance(0.5) ? [eid(a), eid(b)] : [eid(b), eid(a)] };
    return { world: null, premises: rng.shuffle(premises), queries: [query], n };
}

function decorate(d: DraftItem, rng: Rng, p: LevelParams): void {
    const deco = <T extends Rel>(r: T, isQuery: boolean): T => {
        const params: Record<string, number | string | boolean> = { ...(r.params ?? {}), w: rng.int(2) };
        const flag = p.negationRate > 0 && rng.chance(p.negationRate);
        if (isQuery) { if (flag) params['inv'] = true; return { ...r, params }; }
        return { ...r, params, inverted: flag || undefined };
    };
    d.premises = d.premises.map(r => deco(r, false) as Premise);
    d.query = deco(d.query, true) as Query;
}

function sentence(r: Rel & { inverted?: boolean }, names: readonly string[]): string {
    const I = !!(r.inverted || r.params?.['inv']);
    const sw = Number(r.params?.['w'] ?? 0) === 1;
    const [x, y] = sw ? [1, 0] : [0, 1];
    const same = (r.kind === 'same') !== I;
    return `${subj(names[idx(r.args[x])])} и ${subj(names[idx(r.args[y])])} в ${inv(same ? 'одной группе' : 'разных группах', I)}`;
}

function render(d: DraftItem): ItemRender {
    const names = d.entities.map(e => e.name);
    const notes: string[] = [];
    if (d.premises.some(r => r.inverted) || d.query.params?.['inv']) notes.push(NOTE_INVERSION);
    return {
        instructions: ['Есть три группы, каждый участник ровно в одной из них. «В разных группах» не говорит, в какой именно: третий участник может оказаться в любой из оставшихся.'],
        notes,
        premises: d.displayOrder.map(i => sentence(d.premises[i], names)),
        conclusion: sentence(d.query, names),
    };
}

function describe(vals: ArrayLike<number>, names: readonly string[]): string {
    const groups: string[][] = [[], [], []];
    names.forEach((nm, i) => groups[vals[i]].push(nm));
    return groups.filter(g => g.length).map((g, i) => `Группа ${i + 1}: ${g.join(', ')}`).join(' · ');
}

/** Reads «в разных группах» as in two groups: parity of all «в разных». */
function twoGroupsBot(d: DraftItem): Answer {
    const odd = d.premises.filter(r => r.kind === 'diff').length % 2 === 1;
    return (odd ? 'diff' : 'same') === d.query.kind ? 'entailed' : 'contradicted';
}

function degreeBot(d: DraftItem): Answer {
    const c = new Map<string, number>();
    for (const r of d.premises) for (const a of r.args) c.set(a, (c.get(a) ?? 0) + 1);
    const eq = (c.get(d.query.args[0]) ?? 0) === (c.get(d.query.args[1]) ?? 0);
    return (eq ? 'same' : 'diff') === d.query.kind ? 'entailed' : 'contradicted';
}

const bots: Bot[] = [
    { id: 'twoGroups', predict: twoGroupsBot },
    { id: 'degree', predict: degreeBot },
];

function lure(ctx: LureContext): LureType {
    if (ctx.answer !== 'undetermined') return 'none';
    return kit.holdsIn(ctx.query, kit.preferred(ctx.premises, ctx.n), ctx.n) ? 'possible' : 'none';
}

export const groups3Plugin: FamilyPlugin<null> = {
    id: 'groups3',
    formats: ['ternary', 'binary'],
    limits: { minEntities: 4, maxEntities: MAX },
    supportDomain: 'full',
    custom: kit.custom,
    domain: () => ({ size: 0, allDiff: false }),
    compile: (rel, vars) => v => kit.holdsIn({ ...rel, args: vars.map(eid) }, v, v.length),
    adjust(p: LevelParams, _o: EngineOptions, _plan: Plan): LevelParams {
        const q = { ...p };
        q.sigmaMax = Math.min(q.sigmaMax, 6);
        q.sigmaMin = Math.max(2, Math.min(q.sigmaMin, q.sigmaMax));
        q.pConvergent = 0;            // a chain support (see V5_NOTES)
        q.requireConvergent = false;
        return q;
    },
    cueSpace: (_p: LevelParams, _f: AnswerFormat) => ({ qkind: ['same', 'diff'] }),
    // whether the first model satisfies an "Unknown" conclusion follows from its wording (see V5_NOTES)
    uncontrolledLures: ['possible'],
    supportedLures: p => p.lureMix.filter(l => l === 'none' || l === 'possible'),
    construct: (rng, p, plan) => construct(rng, p, plan),
    statedDirectly: (q, premises) => {
        const k = [...q.args].sort().join(',');
        return premises.some(r => [...r.args].sort().join(',') === k);
    },
    lureOf: lure,
    preferredModel: (premises, n) => kit.preferred(premises, n),
    cueMatches: (cue, _premises, q) => !cue['qkind'] || q.kind === cue['qkind'],
    describe: (vals, names) => describe(vals, names),
    render: d => render(d),
    decorate: (d, rng, p) => decorate(d, rng, p),
    invertible: () => true,
    bots,
    features: d => ({
        diffCount: d.premises.filter(r => r.kind === 'diff').length,
        sameCount: d.premises.filter(r => r.kind === 'same').length,
        querySame: d.query.kind === 'same' ? 1 : 0,
    }),
};
