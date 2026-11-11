// «Силлогизмы» (spec §5.3): replaces "Canyon" and "Fredo". Classical semantics with existential import.
//
// Construction: the proposition D that settles the conclusion (E: D = q; C: D = ¬q; U: q with one broken
// link) is derived by a core template of length σ (inclusion chains, a disjointness, an existence witness);
// "Unknown" reverses one «все» link of the same template (quantifier counts unchanged). The cell
// (conclusion quantifier × atmosphere agreement) comes from a bag whose quantifier marginal is uniform, so
// neither the quantifier prior nor the atmosphere heuristic carries information; atmosphere is realised by
// distractors with fresh terms (a single relation to a fresh term never changes any classification).

import { Rng } from '../core/rng';
import { Vals } from '../core/combinatorics';
import { Answer, AnswerFormat, Bot, DraftItem, LevelParams, LureType, Plan, Premise, Query } from '../core/types';
import { decorateSyl, describeSyl, renderSyl, sylOrder } from '../render/ru/syllogism';
import { NEG, Quant, QUANTS, atmosphere, catClassify, catConsistent, catLog2Models, catModel, holdsCat } from './categorical';
import { Construction, FamilyPlugin, LureContext, Rel, eid, idx } from './plugin';

const MAX_TERMS = 14;

const R = (kind: Quant, a: number, b: number): Premise => ({ kind, args: [eid(a), eid(b)] });

/**
 * Cells «quantifier | atmosphere agreement | matching premise» reachable for every answer class. Four cells per
 * quantifier (uniform quantifier marginal, so the core templates of the three classes have the same quantifier
 * mix); 1/4 agree with the atmosphere, 10/16 have a premise with the conclusion's quantifier on a conclusion term.
 * With σ = 2 a «ни один» conclusion always touches a «ни один» core premise, so «no|…|n» becomes «no|…|y».
 * Agreement and matching shares only need to be class-independent, not 50 %.
 */
export function sylCells(sigmaMin: number): string[] {
    // with σ = 2 every class's core puts the conclusion quantifier on a conclusion term for some quantifiers,
    // so the matching premise is always present there
    const N = sigmaMin >= 3 ? 'n' : 'y';
    return [
        'all|dis|y', 'all|dis|y', 'all|dis|y', 'all|dis|y',
        'some|dis|y', 'some|dis|y', `some|dis|${N}`, `some|dis|${N}`,
        'no|agr|y', `no|agr|${N}`, 'no|dis|y', `no|dis|${N}`,
        // «some_not|dis|y» is unreachable for "Follows" (the atmosphere «no» forbids particular premises)
        'some_not|agr|y', 'some_not|agr|y', `some_not|agr|${N}`, `some_not|dis|${N}`,
    ];
}

/** Atmosphere realised for each (quantifier, agreement): one value reachable from every class's core. */
const ATM_TARGET: Record<string, Quant> = {
    'all|dis': 'some_not', 'some|dis': 'some_not', 'no|agr': 'no', 'no|dis': 'some_not', 'some_not|agr': 'some_not', 'some_not|dis': 'no',
};

interface Template { prem: Premise[]; a: number; b: number }

/** Derivation of D(a, b) with exactly s premises; `fresh` allocates new terms. */
function template(rng: Rng, D: Quant, s: number, fresh: () => number): Template | null {
    const a = fresh();
    const b = fresh();
    const prem: Premise[] = [];
    const up = (from: number, len: number): number => {           // from ⊆ x1 ⊆ … ⊆ x_len
        let cur = from;
        for (let i = 0; i < len; i++) { const nx = fresh(); prem.push(R('all', cur, nx)); cur = nx; }
        return cur;
    };
    const upTo = (from: number, len: number, to: number) => {     // from ⊆ … ⊆ to with len links
        let cur = from;
        for (let i = 0; i < len - 1; i++) { const nx = fresh(); prem.push(R('all', cur, nx)); cur = nx; }
        prem.push(R('all', cur, to));
    };
    const split = (total: number, minEach: number) => {
        const i = minEach + rng.int(total - 2 * minEach + 1);
        return [i, total - i];
    };
    switch (D) {
        case 'all':
            upTo(a, s, b);
            break;
        case 'no': {
            const [i, j] = split(s - 1, 0);
            const x = up(a, i);
            const y = up(b, j);
            prem.push(rng.chance(0.5) ? R('no', x, y) : R('no', y, x));
            break;
        }
        case 'some': {
            if (s >= 2 && rng.chance(0.5)) {
                const [i, j] = split(s, 1);
                const w = fresh();
                upTo(w, i, a);
                upTo(w, j, b);
            } else {
                if (s < 2) return null;
                const [i, j] = split(s - 1, 0);
                if (i + j === 0) return null;
                const x = i ? fresh() : a;
                const y = j ? fresh() : b;
                if (i) upTo(x, i, a);
                if (j) upTo(y, j, b);
                prem.push(rng.chance(0.5) ? R('some', x, y) : R('some', y, x));
            }
            break;
        }
        case 'some_not': {
            if (rng.chance(0.5)) {
                const [i, j] = split(s - 1, 0);
                if (i + j === 0) return null;
                const x = i ? fresh() : a;
                if (i) upTo(x, i, a);              // x ⊆ … ⊆ a
                const y = up(b, j);                // b ⊆ … ⊆ y
                prem.push(R('some_not', x, y));
            } else {
                if (s < 2) return null;
                const i = 1 + rng.int(s - 1);      // w ⊆ … ⊆ a: i ≥ 1 links; b ⊆ … ⊆ y: j links; + one «ни один»
                const j = s - 1 - i;
                const w = fresh();
                upTo(w, i, a);
                const y = up(b, j);
                prem.push(rng.chance(0.5) ? R('no', w, y) : R('no', y, w));
            }
            break;
        }
    }
    return { prem, a, b };
}

export interface SylWorld { model: Vals | null }

function construct(rng: Rng, p: LevelParams, plan: Plan): Construction<SylWorld> | null {
    const [Q, agr0, wantMatch] = (plan.cue['cell'] ?? 'all|*|*').split('|') as [Quant, string, string];
    // '*' (relaxed plan): any agreement with a known target, no matching constraint
    const agr = agr0 === '*' ? (Q === 'no' || Q === 'some_not' ? rng.pick(['agr', 'dis']) : 'dis') : agr0;
    const target = plan.target;
    const s = p.sigmaMin + rng.int(p.sigmaMax - p.sigmaMin + 1);
    let ent = 0;
    const fresh = () => ent++;
    const D: Quant = target === 'contradicted' ? NEG[Q] : Q;
    const t = template(rng, D, s, fresh);
    if (!t) return null;
    let core = t.prem;
    const q: Query = { kind: Q, args: [eid(t.a), eid(t.b)] };
    if (target === 'undetermined') {
        const links = rng.shuffle(core.map((r, i) => (r.kind === 'all' ? i : -1)).filter(i => i >= 0));
        let found: Premise[] | null = null;
        for (const i of links) {
            const np = core.slice();
            np[i] = { ...core[i], args: [core[i].args[1], core[i].args[0]] };
            if (catConsistent(np) && catClassify(np, q) === 'undetermined') { found = np; break; }
        }
        if (!found) return null;
        core = found;
    }
    // v5.1: the derivation is the whole item (no atmosphere / matching premises with fresh terms)
    const prem = core.slice();
    void agr; void wantMatch; void ATM_TARGET; void atmosphere; void QUANTS;
    if (ent > MAX_TERMS) return null;
    if (!catConsistent(prem)) return null;
    return { world: { model: catModel(prem, []) }, premises: rng.shuffle(prem), queries: [q], n: ent };
}

// ---------------------------------------------------------------- bots

/** Woodworth–Sells: the conclusion follows iff its quantifier matches the premises' atmosphere. */
export const atmosphereBot = (d: DraftItem): Answer => (atmosphere(d.premises) === d.query.kind ? 'entailed' : 'contradicted');

/** A premise sharing a term with the conclusion has the conclusion's quantifier ⇒ "follows". */
export function matchingBot(d: DraftItem): Answer {
    const qs = new Set(d.query.args);
    return d.premises.some(r => r.kind === d.query.kind && r.args.some(a => qs.has(a))) ? 'entailed' : 'contradicted';
}

/** Illicit conversion (all A→B ⇒ all B→A; some A not B ⇒ some B not A), then the exact solver. Reported only. */
export function conversionBot(d: DraftItem): Answer | null {
    const extra = d.premises.filter(r => r.kind === 'all' || r.kind === 'some_not').map(r => ({ kind: r.kind, args: [r.args[1], r.args[0]] }));
    try { return catClassify([...d.premises, ...extra], d.query); } catch { return null; }
}

/** Figural effect: the conclusion's subject is a subject and its predicate a predicate somewhere ⇒ "follows". */
export function figuralBot(d: DraftItem): Answer {
    const [S, P] = sylOrder(d.query);
    const subj = d.premises.some(r => sylOrder(r)[0] === S);
    const pred = d.premises.some(r => sylOrder(r)[1] === P);
    return subj && pred ? 'entailed' : 'contradicted';
}

function lure(ctx: LureContext): LureType {
    const qs = new Set(ctx.query.args);
    if (ctx.premises.some(r => r.args.every(a => qs.has(a)))) return 'surface';
    if (ctx.answer === 'undetermined') {
        const m = catModel(ctx.premises, []);
        return m && holdsCat(ctx.query, m) ? 'possible' : 'none';
    }
    return 'none';
}

const bots: Bot[] = [
    { id: 'atmosphere', predict: atmosphereBot },
    { id: 'matching', predict: matchingBot },
    { id: 'figural', predict: figuralBot },
    { id: 'conversion', predict: conversionBot, gated: false },
];

export const syllogismPlugin: FamilyPlugin<SylWorld> = {
    id: 'syllogism',
    // with minimal witness models a negative conclusion is always true in the first model and an affirmative
    // one never: the possible/none label of "Unknown" follows the conclusion quantifier (uniform, so ≈ 50 %)
    uncontrolledLures: ['possible'],
    formats: ['ternary', 'binary'],
    limits: { minEntities: 3, maxEntities: MAX_TERMS },
    supportDomain: 'restricted',
    custom: {
        classify: (premises, q) => catClassify(premises, q),
        consistent: premises => catConsistent(premises),
        model: (premises, extra) => catModel(premises, extra),
        log2Models: (premises, n) => catLog2Models(premises, n),
    },
    domain: () => ({ size: 0, allDiff: false }),
    compile: rel => (v: Vals) => holdsCat(rel, v),
    adjust: (p: LevelParams) => {
        const q = { ...p };
        q.pConvergent = 0;              // categorical supports are always simple term paths
        q.requireConvergent = false;
        return q;
    },
    cueSpace: (_p: LevelParams, _f: AnswerFormat) => ({ cell: QUANTS.map(q => `${q}|*|*`) }),
    supportedLures: p => p.lureMix.filter(l => l !== 'reversal' && l !== 'nearMiss'),
    construct: (rng, p, plan) => construct(rng, p, plan),
    statedDirectly: (q, premises) => {
        const sym = q.kind === 'no' || q.kind === 'some';
        return premises.some(r => r.kind === q.kind && (
            (r.args[0] === q.args[0] && r.args[1] === q.args[1]) || (sym && r.args[0] === q.args[1] && r.args[1] === q.args[0])));
    },
    lureOf: lure,
    preferredModel: premises => catModel(premises, []) ?? new Int32Array([0]),
    cueMatches: (cue, premises, q) => {
        if (!cue['cell']) return true;
        const [Q, agr, m] = cue['cell'].split('|');
        const ends = new Set(q.args);
        const match = premises.some(r => r.kind === q.kind && r.args.some(a => ends.has(a)));
        return q.kind === Q && (agr === '*' || (atmosphere(premises) === Q) === (agr === 'agr')) && (m === '*' || match === (m === 'y'));
    },
    describe: (vals, names, query) => describeSyl(vals, names, query),
    render: d => renderSyl(d),
    decorate: (d, rng, p) => decorateSyl(d, rng, p),
    invertible: () => true,
    bots,
    features: d => ({
        atmAgree: atmosphere(d.premises) === d.query.kind ? 1 : 0,
        matching: matchingBot(d) === 'entailed' ? 1 : 0,
        figural: figuralBot(d) === 'entailed' ? 1 : 0,
        negPremises: d.premises.filter(r => r.kind === 'no' || r.kind === 'some_not').length,
        partPremises: d.premises.filter(r => r.kind === 'some' || r.kind === 'some_not').length,
    }),
};

export { QUANTS, idx };
