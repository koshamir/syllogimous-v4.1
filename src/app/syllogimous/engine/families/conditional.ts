// «Условия» (spec §9.1). World: lamps on / off. Premises: implications in several wordings («Если…, то…»,
// «…, только если…», «или», «не горят одновременно», «ровно одна», «тогда и только тогда»), facts.
//
// Construction: a chain of implications ℓ0 → … → ℓk and two fact/rule pairs. "Follows"/"Contradicts": the main
// chain is live (modus ponens forward or modus tollens backward) and a side pair is dead; "Unknown": the main chain is
// dead (denying the antecedent / affirming the consequent — the classic lures) and the side pair is live. Every item
// therefore has one live and one dead fact–rule pair, the same premise kinds and the same counts.

import { Rng } from '../core/rng';
import { Answer, AnswerFormat, Bot, DraftItem, EngineOptions, ItemRender, LevelParams, LureType, Plan, Premise, Query } from '../core/types';
import { subj } from '../render/ru/common';
import { makeEnumKit } from './enum';
import { Construction, FamilyPlugin, LureContext, Rel, eid, idx } from './plugin';

const MAX = 9;

function allBool(n: number): number[][] {
    const out: number[][] = [];
    for (let m = 0; m < 1 << n; m++) out.push(Array.from({ length: n }, (_, e) => (m >> e) & 1));
    return out;
}

/** Semantic params: pa / pb — polarity (1 = горит) of the first / second literal; s — fact state. */
function evalCond(r: Rel, v: ArrayLike<number>): boolean {
    const [a, b] = r.args.map(idx);
    const pa = Number(r.params?.['pa'] ?? 1);
    const pb = Number(r.params?.['pb'] ?? 1);
    switch (r.kind) {
        case 'fact': return v[a] === Number(r.params?.['s'] ?? 1);
        case 'imp': return v[a] !== pa || v[b] === pb;                // (a = pa) → (b = pb)
        case 'or': return v[a] === 1 || v[b] === 1;
        case 'nand': return !(v[a] === 1 && v[b] === 1);
        case 'xor': return v[a] !== v[b];
        case 'iff': return v[a] === v[b];
        case 'lit': return v[a] === Number(r.params?.['s'] ?? 1);    // literal conclusion
        default: throw new Error('Unknown conditional relation ' + r.kind);
    }
}

const kit = makeEnumKit(allBool, evalCond);
export const conditionalKit = kit;

interface Lit { x: number; s: number }

/** A relation realising ℓu → ℓv that is true in the world `w` (random wording / kind). */
function implication(rng: Rng, u: Lit, v: Lit, w: number[], level: number, twoWay = true): Premise {
    const opts: Premise[] = [];
    const imp: Premise = { kind: 'imp', args: [eid(u.x), eid(v.x)], params: { pa: u.s, pb: v.s, form: rng.pick(['if', 'if', 'onlyif', 'contra']) } };
    opts.push(imp, imp);
    if (u.s === 0 && v.s === 1) opts.push({ kind: 'or', args: [eid(u.x), eid(v.x)] });
    if (u.s === 1 && v.s === 0) opts.push({ kind: 'nand', args: [eid(u.x), eid(v.x)] });
    if (twoWay && u.s !== v.s && w[u.x] !== w[v.x]) opts.push({ kind: 'xor', args: [eid(u.x), eid(v.x)] });
    if (twoWay && level >= 6 && u.s === v.s && w[u.x] === w[v.x]) opts.push({ kind: 'iff', args: [eid(u.x), eid(v.x)] });
    const r = rng.pick(opts);
    return evalCond(r, w) ? r : imp;
}

/**
 * Construction (v5.1): P − 1 rules that form ONE chain plus one fact — nothing else.
 *   live  — the fact starts the chain (modus ponens) or ends it negated (modus tollens): the conclusion is settled;
 *   dead  — the fact is the denied start or the affirmed end, or one inner rule points the other way: "Unknown".
 * The same kinds and counts in every class; every rule is needed to reach the other end of the chain.
 */
function construct(rng: Rng, p: LevelParams, plan: Plan): Construction<null> | null {
    const k = Math.max(1, p.premises - 1);            // rules in the chain
    const n = k + 1;
    if (n > MAX) return null;
    const chain = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    const target = plan.target;
    const live = target !== 'undetermined';
    const backward = rng.chance(0.5);
    const qpos = (plan.cue['qpol'] ?? 'pos') === 'pos' ? 1 : 0;
    const w = Array.from({ length: n }, () => rng.int(2));
    const lits: Lit[] = chain.map(x => ({ x, s: rng.int(2) }));
    const qLamp = backward ? chain[0] : chain[k];
    // "Unknown" by a turned inner rule (the facts stay those of a live chain) — only with ≥ 2 rules
    const turned = !live && k >= 2 && rng.chance(0.5) ? rng.int(k) : -1;
    const asLive = live || turned >= 0;
    if (live) {
        const qLit = backward ? { x: chain[0], s: 1 - lits[0].s } : lits[k];     // what the chain proves
        const wantS = target === 'entailed' ? qpos : 1 - qpos;
        if (qLit.s !== wantS) {
            if (backward) lits[0].s = 1 - lits[0].s; else lits[k].s = 1 - lits[k].s;
        }
    }
    if (asLive && !backward) for (const l of lits) w[l.x] = l.s;                  // MP: all literals true
    if (asLive && backward) for (const l of lits) w[l.x] = 1 - l.s;               // MT: all literals false
    if (!asLive && !backward) {                                                   // DA: ℓ0 false, the rest true
        w[lits[0].x] = 1 - lits[0].s;
        for (const l of lits.slice(1)) w[l.x] = l.s;
    }
    if (!asLive && backward) for (const l of lits) w[l.x] = l.s;                  // AC: ℓk true (so is the rest)
    const premises: Premise[] = [];
    // one-directional kinds only («ровно одна» / «тогда и только тогда» would validate the dead directions)
    for (let i = 0; i < k; i++) {
        premises.push(i === turned
            ? implication(rng, lits[i + 1], lits[i], w, p.level, false)
            : implication(rng, lits[i], lits[i + 1], w, p.level, false));
    }
    const factLamp = backward ? chain[k] : chain[0];
    premises.push({ kind: 'fact', args: [eid(factLamp)], params: { s: w[factLamp] } });
    const query: Query = { kind: 'lit', args: [eid(qLamp)], params: { s: qpos } };
    if (!premises.every(r => evalCond(r, w))) return null;
    return { world: null, premises: rng.shuffle(premises), queries: [query], n };
}

/** Number of «не» in the rendered sentence. */
export function negCount(r: Rel): number {
    const pa = Number(r.params?.['pa'] ?? 1);
    const pb = Number(r.params?.['pb'] ?? 1);
    switch (r.kind) {
        case 'fact':
        case 'lit': return Number(r.params?.['s'] ?? 1) ? 0 : 1;
        case 'imp': return r.params?.['form'] === 'contra' ? pa + pb : (1 - pa) + (1 - pb);
        case 'nand': return 1;
        default: return 0;
    }
}

// ---------------------------------------------------------------- Russian texts

const L = (name: string, s: number) => `${subj(name)} ${s ? 'горит' : 'не горит'}`;

function sentence(r: Rel, names: readonly string[]): string {
    const N = (j: number) => names[idx(r.args[j])];
    const pa = Number(r.params?.['pa'] ?? 1);
    const pb = Number(r.params?.['pb'] ?? 1);
    const sw = Number(r.params?.['w'] ?? 0) === 1;
    switch (r.kind) {
        case 'fact': return L(N(0), Number(r.params?.['s']));
        case 'lit': return L(N(0), Number(r.params?.['s']));
        case 'imp': {
            const form = String(r.params?.['form'] ?? 'if');
            if (form === 'onlyif') return `${L(N(0), pa)}, только если ${L(N(1), pb)}`;
            if (form === 'contra') return `Если ${L(N(1), 1 - pb)}, то ${L(N(0), 1 - pa)}`;
            return `Если ${L(N(0), pa)}, то ${L(N(1), pb)}`;
        }
        case 'or': return sw ? `${subj(N(1))} или ${subj(N(0))} горит` : `${subj(N(0))} или ${subj(N(1))} горит`;
        case 'nand': return sw ? `${subj(N(1))} и ${subj(N(0))} не горят вместе` : `${subj(N(0))} и ${subj(N(1))} не горят вместе`;
        case 'xor': return sw ? `Горит ровно одна: ${subj(N(1))} или ${subj(N(0))}` : `Горит ровно одна: ${subj(N(0))} или ${subj(N(1))}`;
        case 'iff': return `${subj(N(0))} горит тогда и только тогда, когда горит ${subj(N(1))}`;
        default: throw new Error('No Russian template for ' + r.kind);
    }
}

function render(d: DraftItem): ItemRender {
    const names = d.entities.map(e => e.name);
    return {
        instructions: ['Лампы. «Если А, то Б» ничего не говорит о случае, когда А неверно. «Или» допускает обе.'],
        notes: [],
        premises: d.displayOrder.map(i => sentence(d.premises[i], names)),
        conclusion: sentence(d.query, names),
    };
}

function describe(vals: ArrayLike<number>, names: readonly string[]): string {
    const on = names.filter((_, i) => vals[i] === 1);
    const off = names.filter((_, i) => vals[i] !== 1);
    return `Горят: ${on.length ? on.join(', ') : '—'} · Не горят: ${off.length ? off.join(', ') : '—'}`;
}

/** The literal is the consequent of a rule whose antecedent is a stated fact ⇒ "follows". */
function matchingBot(d: DraftItem): Answer | null {
    const q = d.query;
    const facts = d.premises.filter(r => r.kind === 'fact');
    const fires = d.premises.some(r => r.kind === 'imp' && r.args[1] === q.args[0] && Number(r.params?.['pb']) === Number(q.params?.['s'])
        && facts.some(f => f.args[0] === r.args[0] && Number(f.params?.['s']) === Number(r.params?.['pa'])));
    return fires ? 'entailed' : null;
}

/** Even number of «не» in everything shown ⇒ "follows". */
function polarityBot(d: DraftItem): Answer {
    const names = d.entities.map(e => e.name);
    const text = [...d.premises.map(r => sentence(r, names)), sentence(d.query, names)].join(' ');
    const k = (text.match(/(^|\s)не\s/g) ?? []).length;
    return k % 2 === 0 ? 'entailed' : 'contradicted';
}

const bots: Bot[] = [
    { id: 'matching', predict: matchingBot },
    { id: 'polarity', predict: polarityBot },
];

function lure(ctx: LureContext): LureType {
    if (ctx.answer !== 'undetermined') return 'none';
    return kit.holdsIn(ctx.query, kit.preferred(ctx.premises, ctx.n), ctx.n) ? 'possible' : 'none';
}

export const conditionalPlugin: FamilyPlugin<null> = {
    id: 'conditional',
    formats: ['ternary', 'binary'],
    limits: { minEntities: 2, maxEntities: MAX },
    supportDomain: 'full',
    custom: kit.custom,
    // a fact makes a rule it does not fire vacuously true: such a rule "follows" formally, yet it is the trap
    skipRedundancyCheck: true,
    domain: () => ({ size: 0, allDiff: false }),
    compile: (rel, vars) => v => kit.holdsIn({ ...rel, args: vars.map(eid) }, v, v.length),
    adjust(p: LevelParams, _o: EngineOptions, _plan: Plan): LevelParams {
        const q = { ...p };
        q.pConvergent = 0;
        q.requireConvergent = false;
        return q;
    },
    cueSpace: (_p: LevelParams, _f: AnswerFormat) => ({ qpol: ['pos', 'neg'] }),
    uncontrolledLures: ['possible'],
    supportedLures: p => p.lureMix.filter(l => l === 'none' || l === 'possible'),
    construct: (rng, p, plan) => construct(rng, p, plan),
    statedDirectly: (q, premises) => premises.some(r => r.kind === 'fact' && r.args[0] === q.args[0]),
    lureOf: lure,
    preferredModel: (premises, n) => kit.preferred(premises, n),
    cueMatches: (cue, _premises, q) => !cue['qpol'] || (Number(q.params?.['s']) === 1) === (cue['qpol'] === 'pos'),
    describe: (vals, names) => describe(vals, names),
    render: d => render(d),
    decorate: (d, rng) => { d.premises = d.premises.map(r => ({ ...r, params: { ...(r.params ?? {}), w: rng.int(2) } })); },
    invertible: () => false,
    bots,
    features: d => ({
        rules: d.premises.filter(r => r.kind !== 'fact').length,
        facts: d.premises.filter(r => r.kind === 'fact').length,
        queryPos: Number(d.query.params?.['s'] ?? 1),
        qIsConsequent: d.premises.some(r => r.kind === 'imp' && r.args[1] === d.query.args[0]) ? 1 : 0,
        qIsAntecedent: d.premises.some(r => r.kind === 'imp' && r.args[0] === d.query.args[0]) ? 1 : 0,
    }),
};
