// «Иерархия» (spec §9.2). World: a forest "part → immediate whole" over n ≤ 6 entities.
// Premises: «A — часть B» (at any depth), «A непосредственно входит в B», «A — не часть B», «A и B непосредственно
// входят в одно и то же целое», «A ни во что не входит». Solver: all forests enumerated; supportDomain 'full'.
//
// Construction: "part" true — a chain a ⊂ … ⊂ b; false — the reversed chain b ⊂ … ⊂ a; unknown — a chain that turns
// at an interior whole (a ⊂ … ⊂ x ⊃ … ⊃ b). Identical premise kinds and counts in every class.

import { Rng } from '../core/rng';
import { Answer, AnswerFormat, Bot, DraftItem, EngineOptions, ItemRender, LevelParams, LureType, Plan, Premise, Query } from '../core/types';
import { NOTE_INVERSION, inv, subj } from '../render/ru/common';
import { makeEnumKit } from './enum';
import { Construction, FamilyPlugin, LureContext, Rel, eid, idx } from './plugin';

const MAX = 6;

/** All forests: parent[e] ∈ {0…n−1} \ {e} or n (no whole), without cycles. */
function forests(n: number): number[][] {
    const out: number[][] = [];
    const par = new Array(n).fill(n);
    const acyclic = () => {
        for (let e = 0; e < n; e++) {
            let x = par[e];
            for (let s = 0; s <= n && x !== n; s++) { if (x === e) return false; x = par[x]; }
        }
        return true;
    };
    const rec = (e: number) => {
        if (e === n) { if (acyclic()) out.push(par.slice()); return; }
        for (let v = 0; v <= n; v++) { if (v === e) continue; par[e] = v; rec(e + 1); }
    };
    rec(0);
    return out;
}

function ancestor(v: ArrayLike<number>, n: number, a: number, b: number): boolean {
    let x = v[a];
    for (let s = 0; s <= n && x !== n; s++) { if (x === b) return true; x = v[x]; }
    return false;
}

function evalHier(r: Rel, v: ArrayLike<number>, n: number): boolean {
    const [a, b] = r.args.map(idx);
    switch (r.kind) {
        case 'part': return ancestor(v, n, a, b);
        case 'notPart': return !ancestor(v, n, a, b);
        case 'direct': return v[a] === b;
        case 'sibling': return v[a] === v[b] && v[a] !== n;
        case 'root': return v[a] === n;
        default: throw new Error('Unknown hierarchy relation ' + r.kind);
    }
}

const kit = makeEnumKit(forests, evalHier);
export const hierarchyKit = kit;

type Rel3 = 'true' | 'false' | 'unknown';

/**
 * Construction (v5.1): ONE chain c0 – c1 – … – cP of «часть» / «непосредственно входит» facts, each pointing up
 * or down, and a conclusion about its two ends — nothing else. Straight chains settle the conclusion; a chain
 * that turns usually leaves it open, but «непосредственно входит» can close a turn (a part has one immediate
 * whole, so two wholes of one part are nested): the exact solver decides, and the pipeline keeps the item only
 * if the class is the planned one and every premise is necessary.
 */
function construct(rng: Rng, p: LevelParams, plan: Plan): Construction<null> | null {
    const qkind = plan.cue['qkind'] ?? 'part';
    const rel: Rel3 = plan.target === 'undetermined' ? 'unknown' : (plan.target === 'entailed') === (qkind === 'part') ? 'true' : 'false';
    const k = p.premises;
    const n = k + 1;
    if (n > MAX) return null;
    const c = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    let up: boolean[] = Array.from({ length: k }, () => rng.chance(0.5));
    if (rng.chance(0.5)) {
        if (rel === 'true') up = up.map(() => true);
        else if (rel === 'false') up = up.map(() => false);
        else if (k >= 2) {
            const j = 1 + rng.int(k - 1);
            const first = rng.chance(0.5);
            up = up.map((_, i) => (i < j ? first : !first));
        }
    }
    const premises: Premise[] = up.map((u, i) => {
        const [x, y] = u ? [c[i], c[i + 1]] : [c[i + 1], c[i]];
        return { kind: rng.chance(0.35) ? 'direct' : 'part', args: [eid(x), eid(y)] };
    });
    const ends = rng.chance(0.5) ? [c[0], c[k]] : [c[k], c[0]];
    const queries: Query[] = [
        { kind: qkind, args: [eid(ends[0]), eid(ends[1])] },
        { kind: qkind, args: [eid(ends[1]), eid(ends[0])] },
    ];
    return { world: null, premises: rng.shuffle(premises), queries, n };
}

// ---------------------------------------------------------------- Russian texts

function decorate(d: DraftItem, rng: Rng, p: LevelParams): void {
    const deco = <T extends Rel>(r: T, isQuery: boolean): T => {
        const params: Record<string, number | string | boolean> = { ...(r.params ?? {}), w: rng.int(2) };
        const flag = (r.kind === 'part' || r.kind === 'notPart') && p.negationRate > 0 && rng.chance(p.negationRate);
        if (isQuery) { if (flag) params['inv'] = true; return { ...r, params }; }
        return { ...r, params, inverted: flag || undefined };
    };
    d.premises = d.premises.map(r => deco(r, false) as Premise);
    d.query = deco(d.query, true) as Query;
}

function sentence(r: Rel & { inverted?: boolean }, names: readonly string[]): string {
    const N = (j: number) => subj(names[idx(r.args[j])]);
    const I = !!(r.inverted || r.params?.['inv']);
    const sw = Number(r.params?.['w'] ?? 0) === 1;
    switch (r.kind) {
        case 'part':
        case 'notPart': {
            const isPart = (r.kind === 'part') !== I;
            return `${N(0)} — ${inv(isPart ? 'часть' : 'не часть', I)} ${N(1)}`;
        }
        case 'direct': return `${N(0)} — прямая часть ${N(1)}`;
        case 'sibling': return sw ? `${N(1)} и ${N(0)} — прямые части одного целого` : `${N(0)} и ${N(1)} — прямые части одного целого`;
        case 'root': return `${N(0)} ни во что не входит`;
        default: throw new Error('No Russian template for ' + r.kind);
    }
}

function render(d: DraftItem): ItemRender {
    const names = d.entities.map(e => e.name);
    const notes: string[] = [];
    if (d.premises.some(r => r.inverted) || d.query.params?.['inv']) notes.push(NOTE_INVERSION);
    return {
        instructions: ['«Часть» — на любой глубине (часть части — тоже часть). «Прямая часть» — без промежуточных; прямое целое у каждого одно.'],
        notes,
        premises: d.displayOrder.map(i => sentence(d.premises[i], names)),
        conclusion: sentence(d.query, names),
    };
}

/** Indented tree. */
function describe(vals: ArrayLike<number>, names: readonly string[]): string {
    const n = names.length;
    const lines: string[] = [];
    const walk = (x: number, depth: number) => {
        lines.push(`${'&nbsp;&nbsp;&nbsp;'.repeat(depth)}${depth ? '└ ' : ''}${names[x]}`);
        for (let c = 0; c < n; c++) if (vals[c] === x) walk(c, depth + 1);
    };
    for (let r = 0; r < n; r++) if (vals[r] === n) walk(r, 0);
    return lines.join('<br>');
}

/** "Part of" is transitive in reading order only: a chain of «часть» from a to b in the premises ⇒ follows. */
function directLinkBot(d: DraftItem): Answer | null {
    const [a, b] = d.query.args;
    const parts = d.premises.filter(r => r.kind === 'part' || r.kind === 'direct');
    const reach = (from: string, to: string) => {
        const seen = new Set([from]);
        const st = [from];
        while (st.length) {
            const x = st.pop()!;
            for (const r of parts) if (r.args[0] === x && !seen.has(r.args[1])) { if (r.args[1] === to) return true; seen.add(r.args[1]); st.push(r.args[1]); }
        }
        return false;
    };
    const part = reach(a, b);
    return (part === (d.query.kind === 'part')) ? 'entailed' : 'contradicted';
}

/** The first-named entity is the part ⇒ "part" follows. */
function wordOrderBot(d: DraftItem): Answer {
    const mention = (x: string) => d.premises.filter(r => r.args[0] === x).length - d.premises.filter(r => r.args[1] === x).length;
    const part = mention(d.query.args[0]) > mention(d.query.args[1]);
    return part === (d.query.kind === 'part') ? 'entailed' : 'contradicted';
}

const bots: Bot[] = [
    // follows the stated chains exactly: reasoning, reported only
    { id: 'chainOnly', predict: directLinkBot, gated: false },
    { id: 'wordOrder', predict: wordOrderBot },
];

function lure(ctx: LureContext): LureType {
    if (ctx.answer === 'undetermined') return kit.holdsIn(ctx.query, kit.preferred(ctx.premises, ctx.n), ctx.n) ? 'possible' : 'none';
    return 'none';
}

export const hierarchyPlugin: FamilyPlugin<null> = {
    id: 'hierarchy',
    formats: ['ternary', 'binary'],
    limits: { minEntities: 3, maxEntities: MAX },
    supportDomain: 'full',
    custom: kit.custom,
    domain: () => ({ size: 0, allDiff: false }),
    compile: (rel, vars) => v => kit.holdsIn({ ...rel, args: vars.map(eid) }, v, v.length),
    adjust(p: LevelParams, _o: EngineOptions, _plan: Plan): LevelParams {
        const q = { ...p };
        return q;
    },
    cueSpace: (_p: LevelParams, _f: AnswerFormat) => ({ qkind: ['part', 'notPart'] }),
    supportedLures: p => p.lureMix.filter(l => l === 'none' || l === 'possible'),
    construct: (rng, p, plan) => construct(rng, p, plan),
    statedDirectly: (q, premises) => premises.some(r => r.args.length === 2 && r.args[0] === q.args[0] && r.args[1] === q.args[1] && r.kind !== 'sibling'),
    lureOf: lure,
    preferredModel: (premises, n) => kit.preferred(premises, n),
    cueMatches: (cue, _premises, q) => !cue['qkind'] || q.kind === cue['qkind'],
    describe: (vals, names) => describe(vals, names),
    render: d => render(d),
    decorate: (d, rng, p) => decorate(d, rng, p),
    invertible: kind => kind === 'part' || kind === 'notPart',
    bots,
    features: d => ({
        parts: d.premises.filter(r => r.kind === 'part').length,
        directs: d.premises.filter(r => r.kind === 'direct').length,
        nots: d.premises.filter(r => r.kind === 'notPart').length,
        queryPart: d.query.kind === 'part' ? 1 : 0,
        q0Role: d.premises.filter(r => r.args[0] === d.query.args[0]).length - d.premises.filter(r => r.args[1] === d.query.args[0]).length,
        q1Role: d.premises.filter(r => r.args[0] === d.query.args[1]).length - d.premises.filter(r => r.args[1] === d.query.args[1]).length,
    }),
};
