// «Точка зрения» (spec §9.3). World: n = 3…6 people in a row (positions left to right from YOUR viewpoint), each
// facing you or with their back to you. «Для A справа стоит B»: if A has their back to you, A's right is your right;
// if A faces you, A's right is your left. Solver: all n!·2ⁿ worlds.
//
// Construction (like the order families): the conclusion pair is joined by a chain of viewpoint links; every viewer's
// facing is given (a fact or «смотрят в одну / разные стороны» to someone with a known facing). "Follows" and
// "Contradicts" decode to a monotone chain, "Unknown" has one link that decodes the other way. The egocentric reading
// (every «для X» read as «для тебя») is uninformative because facings are random.

import { Rng } from '../core/rng';
import { Answer, AnswerFormat, Bot, DraftItem, EngineOptions, ItemRender, LevelParams, LureType, Plan, Premise, Query } from '../core/types';
import { NOTE_INVERSION, alphabetical, inv, subj } from '../render/ru/common';
import { makeEnumKit } from './enum';
import { Construction, FamilyPlugin, LureContext, Rel, eid, idx } from './plugin';

const MAX = 6;

/** value = position·2 + facing (0 — back to you ↑, 1 — facing you ↓). */
function worlds(n: number): number[][] {
    const out: number[][] = [];
    const p = Array.from({ length: n }, (_, i) => i);
    const rec = (k: number) => {
        if (k === n) {
            for (let m = 0; m < 1 << n; m++) out.push(p.map((pos, e) => pos * 2 + ((m >> e) & 1)));
            return;
        }
        for (let i = k; i < n; i++) { [p[k], p[i]] = [p[i], p[k]]; rec(k + 1); [p[k], p[i]] = [p[i], p[k]]; }
    };
    rec(0);
    return out;
}

const pos = (v: ArrayLike<number>, e: number) => v[e] >> 1;
const faces = (v: ArrayLike<number>, e: number) => v[e] & 1;

function evalPersp(r: Rel, v: ArrayLike<number>): boolean {
    const [a, b] = r.args.map(idx);
    switch (r.kind) {
        // «для A справа стоит B»: in A's own right-hand direction
        case 'right': return faces(v, a) ? pos(v, b) < pos(v, a) : pos(v, b) > pos(v, a);
        case 'left': return faces(v, a) ? pos(v, b) > pos(v, a) : pos(v, b) < pos(v, a);
        case 'youLeft': return pos(v, a) < pos(v, b);
        case 'sameDir': return faces(v, a) === faces(v, b);
        case 'diffDir': return faces(v, a) !== faces(v, b);
        case 'facing': return faces(v, a) === 1;
        case 'back': return faces(v, a) === 0;
        default: throw new Error('Unknown perspective relation ' + r.kind);
    }
}

const kit = makeEnumKit(worlds, evalPersp);
export const perspectiveKit = kit;

/** A viewpoint link stating "v is further right than u (for you)" in u's or v's own terms. */
function viewLink(rng: Rng, u: number, v: number, f: number[], avoid = -1): Premise {
    // pick the viewer: u (then v is on u's "your-right") or v (then u is on v's "your-left")
    const viewU = u === avoid ? false : v === avoid ? true : rng.chance(0.5);
    if (viewU) return { kind: f[u] ? 'left' : 'right', args: [eid(u), eid(v)] };
    return { kind: f[v] ? 'right' : 'left', args: [eid(v), eid(u)] };
}

export const chainLength = (level: number) => (level < 4 ? 2 : 3);

function construct(rng: Rng, p: LevelParams, plan: Plan): Construction<null> | null {
    // the chain length depends on the level only (never on the class): an "Unknown" needs ≥ 2 links
    const k = chainLength(p.level);
    const n = Math.min(MAX, Math.max(k + 2, p.n));
    const ents = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    const chain = ents.slice(0, k + 1);
    const rest = ents.slice(k + 1);
    const f = Array.from({ length: n }, () => rng.int(2));
    const target = plan.target;
    const qkind = plan.cue['qkind'] ?? 'youLeft';
    // positions: the chain is monotone left→right except one flipped link in "Unknown"
    const flip = target === 'undetermined' ? rng.int(k) : -1;
    const posOf = new Array(n).fill(-1);
    // place the chain members with a random monotone order; the flipped link reverses one step
    const order: number[] = [chain[0]];
    for (let i = 1; i <= k; i++) {
        if (i - 1 === flip) order.splice(order.indexOf(chain[i - 1]), 0, chain[i]);
        else order.push(chain[i]);
    }
    const all = [...order];
    for (const e of rest) all.splice(rng.int(all.length + 1), 0, e);
    all.forEach((e, i) => (posOf[e] = i));
    const premises: Premise[] = [];
    // every link has its own viewer (a shared viewer would make the egocentric misreading consistent along the
    // chain); a «для A …» conclusion: A is never the viewer of a premise (else A's facing would cancel out)
    const split = qkind !== 'youLeft' ? 0 : rng.int(k + 1);
    for (let i = 0; i < k; i++) {
        const viewer = i < split ? chain[i] : chain[i + 1];
        const other = i < split ? chain[i + 1] : chain[i];
        const [u, v] = posOf[viewer] < posOf[other] ? [viewer, other] : [other, viewer];
        premises.push(viewLink(rng, u, v, f, viewer === u ? v : u));
    }
    // facings of every viewer: a fact or a same/different-direction link to someone already known
    const known: number[] = [];
    const viewers = [...new Set(premises.map(r => idx(r.args[0])))];
    // a «для A …» conclusion needs A's facing in every class
    if (qkind !== 'youLeft' && !viewers.includes(chain[0])) viewers.push(chain[0]);
    for (const x of rng.shuffle(viewers)) {
        if (known.length && rng.chance(0.5)) {
            const y = rng.pick(known);
            premises.push({ kind: f[x] === f[y] ? 'sameDir' : 'diffDir', args: rng.chance(0.5) ? [eid(x), eid(y)] : [eid(y), eid(x)] });
        } else {
            premises.push({ kind: f[x] ? 'facing' : 'back', args: [eid(x)] });
        }
        known.push(x);
    }
    // the rest: one "your view" fact each (distractors), so everybody is mentioned
    for (const e of rest) {
        const o = rng.pick(chain);
        premises.push(posOf[e] < posOf[o] ? { kind: 'youLeft', args: [eid(e), eid(o)] } : { kind: 'youLeft', args: [eid(o), eid(e)] });
    }
    const v = Array.from({ length: n }, (_, e) => posOf[e] * 2 + f[e]);
    if (!premises.every(r => evalPersp(r, v))) return null;
    const [a, b] = [chain[0], chain[k]];
    // "true" relation: a left of b (for you) when the chain goes left→right
    const leftTrue = posOf[a] < posOf[b];
    const wantTrue = target === 'entailed';
    let query: Query;
    if (qkind === 'youLeft') {
        const [x, y] = (leftTrue === wantTrue) ? [a, b] : [b, a];
        query = { kind: 'youLeft', args: [eid(x), eid(y)] };
    } else {
        // from a's viewpoint: «для A справа стоит B»
        const rightForA = f[a] ? posOf[b] < posOf[a] : posOf[b] > posOf[a];
        query = { kind: rightForA === wantTrue ? 'right' : 'left', args: [eid(a), eid(b)] };
        if (target === 'undetermined') query = { kind: rng.chance(0.5) ? 'right' : 'left', args: [eid(a), eid(b)] };
    }
    if (target === 'undetermined' && qkind === 'youLeft' && rng.chance(0.5)) query = { kind: 'youLeft', args: [query.args[1], query.args[0]] };
    return { world: null, premises: rng.shuffle(premises), queries: [query], n };
}

// ---------------------------------------------------------------- Russian texts

function decorate(d: DraftItem, rng: Rng, p: LevelParams): void {
    const deco = <T extends Rel>(r: T, isQuery: boolean): T => {
        const params: Record<string, number | string | boolean> = { ...(r.params ?? {}), w: rng.int(2) };
        const flag = ['right', 'left', 'youLeft'].includes(r.kind) && p.negationRate > 0 && rng.chance(p.negationRate);
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
    const side = (right: boolean) => inv(right !== I ? 'справа' : 'слева', I);
    switch (r.kind) {
        case 'right': return `Для ${N(0)} ${side(true)} стоит ${N(1)}`;
        case 'left': return `Для ${N(0)} ${side(false)} стоит ${N(1)}`;
        case 'youLeft': return sw
            ? `Для тебя ${N(1)} ${inv(I ? 'левее' : 'правее', I)}, чем ${N(0)}`
            : `Для тебя ${N(0)} ${inv(I ? 'правее' : 'левее', I)}, чем ${N(1)}`;
        case 'sameDir': return `${N(0)} и ${N(1)} смотрят в одну сторону`;
        case 'diffDir': return `${N(0)} и ${N(1)} смотрят в разные стороны`;
        case 'facing': return `${N(0)} стоит лицом к тебе`;
        case 'back': return `${N(0)} стоит спиной к тебе`;
        default: throw new Error('No Russian template for ' + r.kind);
    }
}

function render(d: DraftItem): ItemRender {
    const names = d.entities.map(e => e.name);
    const notes: string[] = [];
    if (d.premises.some(r => r.inverted) || d.query.params?.['inv']) notes.push(NOTE_INVERSION);
    return {
        instructions: [
            `Участники: ${alphabetical(names).map(subj).join(', ')} (порядок в списке — алфавитный).`,
            'Все стоят в один ряд перед тобой, каждый — лицом к тебе или спиной. «Для Х справа» — с точки зрения Х: если Х стоит спиной к тебе, его право совпадает с твоим, если лицом — его право это твоё лево. «Справа» — не обязательно рядом.',
        ],
        notes,
        premises: d.displayOrder.map(i => sentence(d.premises[i], names)),
        conclusion: sentence(d.query, names),
    };
}

/** «[ВОЛ ↑] [ДЕК ↓] [ЗУМ ↑]» (↑ — back to you, ↓ — facing you). */
function describe(vals: ArrayLike<number>, names: readonly string[]): string {
    const order = names.map((_, e) => e).sort((a, b) => pos(vals, a) - pos(vals, b));
    return order.map(e => `[${names[e]} ${faces(vals, e) ? '↓' : '↑'}]`).join(' ') + ' (↑ — спиной к тебе, ↓ — лицом)';
}

/** Reads every «для X» as «для тебя». */
function egocentricBot(d: DraftItem): Answer {
    const ego = (r: Rel): Rel => (r.kind === 'right' ? { kind: 'youLeft', args: [r.args[0], r.args[1]] }
        : r.kind === 'left' ? { kind: 'youLeft', args: [r.args[1], r.args[0]] } : r);
    const prem = d.premises.map(ego).filter(r => r.kind === 'youLeft');
    const q = ego(d.query);
    if (q.kind !== 'youLeft') return 'undetermined';
    // order implied by the egocentric reading: reachability left → right
    const reach = (x: string, y: string) => {
        const seen = new Set([x]);
        const st = [x];
        while (st.length) { const z = st.pop()!; for (const r of prem) if (r.args[0] === z && !seen.has(r.args[1])) { if (r.args[1] === y) return true; seen.add(r.args[1]); st.push(r.args[1]); } }
        return false;
    };
    if (reach(q.args[0], q.args[1])) return 'entailed';
    if (reach(q.args[1], q.args[0])) return 'contradicted';
    return 'undetermined';
}

/** «справа» more often than «слева» ⇒ follows. */
function wordBot(d: DraftItem): Answer {
    const names = d.entities.map(e => e.name);
    const text = d.premises.map(r => sentence(r, names)).join(' ');
    const r = (text.match(/справа|правее/g) ?? []).length;
    const l = (text.match(/слева|левее/g) ?? []).length;
    return r >= l ? 'entailed' : 'contradicted';
}

const bots: Bot[] = [
    { id: 'egocentric', predict: egocentricBot },
    { id: 'word', predict: wordBot },
];

function lure(ctx: LureContext): LureType {
    if (ctx.answer !== 'undetermined') return 'none';
    return kit.holdsIn(ctx.query, kit.preferred(ctx.premises, ctx.n), ctx.n) ? 'possible' : 'none';
}

export const perspectivePlugin: FamilyPlugin<null> = {
    id: 'perspective',
    formats: ['ternary', 'binary'],
    limits: { minEntities: 3, maxEntities: MAX },
    supportDomain: 'full',
    custom: kit.custom,
    domain: () => ({ size: 0, allDiff: false }),
    compile: (rel, vars) => v => kit.holdsIn({ ...rel, args: vars.map(eid) }, v, v.length),
    adjust(p: LevelParams, _o: EngineOptions, _plan: Plan): LevelParams {
        const q = { ...p };
        q.n = Math.min(MAX, Math.max(4, q.n));
        // σ = links + the facings of their viewers (k + 1 … 3k): set by the chain length, not by the ladder
        const k = chainLength(p.level);
        q.sigmaMin = 2;
        q.sigmaMax = 3 * k + 1;
        q.pConvergent = 0;              // a viewpoint link and the viewer's facing always converge (see V5_NOTES)
        q.requireConvergent = false;
        return q;
    },
    cueSpace: (_p: LevelParams, _f: AnswerFormat) => ({ qkind: ['youLeft', 'view'] }),
    supportedLures: p => p.lureMix.filter(l => l === 'none' || l === 'possible'),
    construct: (rng, p, plan) => construct(rng, p, plan),
    statedDirectly: (q, premises) => {
        const k = [...q.args].sort().join(',');
        return premises.some(r => r.args.length === 2 && ['right', 'left', 'youLeft'].includes(r.kind) && [...r.args].sort().join(',') === k);
    },
    lureOf: lure,
    preferredModel: (premises, n) => kit.preferred(premises, n),
    cueMatches: (cue, _premises, q) => !cue['qkind'] || (cue['qkind'] === 'youLeft') === (q.kind === 'youLeft'),
    describe: (vals, names) => describe(vals, names),
    render: d => render(d),
    decorate: (d, rng, p) => decorate(d, rng, p),
    invertible: kind => ['right', 'left', 'youLeft'].includes(kind),
    bots,
    features: d => ({
        views: d.premises.filter(r => r.kind === 'right' || r.kind === 'left').length,
        facts: d.premises.filter(r => r.kind === 'facing' || r.kind === 'back').length,
        dirs: d.premises.filter(r => r.kind === 'sameDir' || r.kind === 'diffDir').length,
        qYou: d.query.kind === 'youLeft' ? 1 : 0,
        ego: egocentricBot(d) === 'entailed' ? 1 : egocentricBot(d) === 'contradicted' ? -1 : 0,
    }),
};
