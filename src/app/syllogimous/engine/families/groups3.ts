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

/**
 * Construction (v5.1): every premise is part of the reasoning.
 *  - chain: a…b joined by P links. «в одной» only → same group; exactly one «в разных» → different groups;
 *    two or more → unknown. Half of the "Unknown" items instead miss one inner link (the halves never meet),
 *    so counting the words «в разных» does not give the answer.
 *  - clique (P ≥ 5): A, X, Y are pairwise in different groups and B differs from X and from Y, so B is with A
 *    (five «в разных» that DO determine the answer); the "Unknown" twin is a ring of five «в разных».
 *    Extra premises lengthen the structure with «в одной» links.
 */
function construct(rng: Rng, p: LevelParams, plan: Plan): Construction<null> | null {
    const P = p.premises;
    const target = plan.target;
    const qkind = plan.cue['qkind'] ?? 'same';
    const sameTrue = (target === 'entailed') === (qkind === 'same');
    const pair = (u: number, v: number) => (rng.chance(0.5) ? [eid(u), eid(v)] : [eid(v), eid(u)]);
    const premises: Premise[] = [];
    let n = 0;
    const fresh = () => n++;
    let a: number;
    let b: number;
    const clique = P >= 5 && p.requireConvergent && (target === 'undetermined' || sameTrue);
    if (clique) {
        const diffs: [number, number][] = [];
        a = fresh();
        if (target === 'undetermined') {
            // ring a – x – b – y – z – a
            const [x, bb, y, z] = [fresh(), fresh(), fresh(), fresh()];
            b = bb;
            diffs.push([a, x], [x, b], [b, y], [y, z], [z, a]);
        } else {
            const [x, y] = [fresh(), fresh()];
            b = fresh();
            diffs.push([a, x], [a, y], [x, y], [b, x], [b, y]);
        }
        // lengthen: an end of a «в разных» fact is replaced by a newcomer who is «в одной группе» with it
        for (let i = 5; i < P; i++) {
            const e = diffs[rng.int(diffs.length)];
            const side = rng.int(2);
            const nu = fresh();
            premises.push({ kind: 'same', args: pair(e[side], nu) });
            e[side] = nu;
        }
        for (const [u, v] of diffs) premises.push({ kind: 'diff', args: pair(u, v) });
    } else {
        const gap = target === 'undetermined' && (P < 2 || rng.chance(0.5));
        const links = gap ? P + 1 : P;
        if (gap && links < 3) return null;
        const chain = Array.from({ length: links + 1 }, () => fresh());
        a = chain[0];
        b = chain[links];
        const missing = gap ? 1 + rng.int(links - 2) : -1;
        const stated = Array.from({ length: links }, (_, i) => i).filter(i => i !== missing);
        const nDiff = gap ? rng.int(2) : target === 'undetermined' ? (P >= 4 && rng.chance(0.3) ? 3 : 2) : sameTrue ? 0 : 1;
        if (nDiff > stated.length) return null;
        const diffAt = new Set(rng.shuffle(stated.slice()).slice(0, nDiff));
        for (const i of stated) premises.push({ kind: diffAt.has(i) ? 'diff' : 'same', args: pair(chain[i], chain[i + 1]) });
    }
    if (n > MAX) return null;
    // entity ids carry no role: shuffle them
    const perm = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    const re = (x: string) => eid(perm[idx(x)]);
    const out = premises.map(r => ({ ...r, args: r.args.map(re) }));
    const query: Query = { kind: qkind, args: pair(a, b).map(re) };
    return { world: null, premises: rng.shuffle(out), queries: [query], n };
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
        instructions: ['Групп три. «В разных группах» не говорит, в каких именно.'],
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
