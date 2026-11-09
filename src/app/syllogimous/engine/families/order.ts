// «Сравнение чисел» / «Порядок во времени» (spec §5.2) and «Линейный порядок» (§5.4) on the shared line core.

import { Answer, Bot, DraftItem, FamilyId, LevelParams } from '../core/types';
import { decorateLine, describeLine, renderLine, LINE_INVERTIBLE } from '../render/ru/line';
import { alphabetical } from '../render/ru/common';
import {
    LINE_MAX_ENTITIES, LineCfg, LineId, LineWorld, constructLine, constructLineChoice, degreeOpinion,
    holdsLine, isOrientedQuery, lineAdjust, lineCueMatches, lineCueSpace, lineLure, linePreferred, lineSolver,
    lineStated, mentionCounts, netOpinion, winScores,
} from './line';
import { FamilyPlugin, Rel, idx } from './plugin';

const sign = (x: number): Answer => (x > 0 ? 'entailed' : x < 0 ? 'contradicted' : 'undetermined');

/** Grammatical subject of a rendered sentence (depends on the wording variant `w`). */
export function subjectOf(r: Rel): string {
    if (LINE_INVERTIBLE.has(r.kind)) return Number(r.params?.['w'] ?? 0) === 0 ? r.args[0] : r.args[1];
    return r.args[0];
}

export function subjectOpinion(premises: readonly Rel[], q: Rel): Answer | null {
    if (!isOrientedQuery(q.kind)) return null;
    const c = new Map<string, number>();
    for (const r of premises) c.set(subjectOf(r), (c.get(subjectOf(r)) ?? 0) + 1);
    return sign((c.get(q.args[0]) ?? 0) - (c.get(q.args[1]) ?? 0));
}

/** Reads the (alphabetical) participant list as if it were the left-to-right order. */
export function instructionOrderOpinion(d: DraftItem): Answer | null {
    if (d.query.kind === 'rankAt') return null;
    const names = d.entities.map(e => e.name);
    const order = alphabetical(names);
    const vals = new Int32Array(names.length);
    names.forEach((nm, i) => (vals[i] = order.indexOf(nm)));
    return holdsLine(d.query, vals, names.length) ? 'entailed' : 'contradicted';
}

const magnitude = (r: Rel): number | null => {
    const k = Number(r.params?.['k'] ?? 0);
    switch (r.kind) {
        case 'steps': return k;
        case 'dist': case 'gap': return k + 1;
        case 'immLeft': case 'succ': case 'adj': return 1;
        default: return null;
    }
};

/** Conclusion step larger than every step in the premises ⇒ "contradicts". */
export function stepMagnitudeOpinion(d: DraftItem): Answer | null {
    if (d.query.kind !== 'steps' && d.query.kind !== 'dist') return null;
    const K = magnitude(d.query)!;
    const ms = d.premises.map(magnitude).filter((x): x is number => x !== null);
    const max = ms.length ? Math.max(...ms) : 0;
    return K > max ? 'contradicted' : 'entailed';
}

function lineFeatures(d: DraftItem): Record<string, number> {
    const s = winScores(d.premises);
    const m = mentionCounts(d.premises);
    const [x, y] = d.query.args;
    const subj = new Map<string, number>();
    for (const r of d.premises) subj.set(subjectOf(r), (subj.get(subjectOf(r)) ?? 0) + 1);
    const ms = d.premises.map(magnitude).filter((v): v is number => v !== null);
    const K = magnitude(d.query) ?? 0;
    const instr = instructionOrderOpinion(d);
    return {
        net0: x ? s.get(x) ?? 0 : 0,
        net1: y ? s.get(y) ?? 0 : 0,
        netDiff: x && y ? (s.get(x) ?? 0) - (s.get(y) ?? 0) : 0,
        subjDiff: x && y ? (subj.get(x) ?? 0) - (subj.get(y) ?? 0) : 0,
        degDiff: x && y ? (m.get(x) ?? 0) - (m.get(y) ?? 0) : 0,
        queryK: K,
        maxK: ms.length ? Math.max(...ms) : 0,
        kOverMax: K - (ms.length ? Math.max(...ms) : 0),
        instrOrder: instr === 'entailed' ? 1 : instr === 'contradicted' ? -1 : 0,
    };
}

function makeLinePlugin(id: LineId): FamilyPlugin<LineWorld> {
    const cfg: LineCfg = { id, winsHigh: id !== 'linear' };
    const solver = lineSolver(id);
    const bots: Bot[] = [
        { id: 'netScore', predict: d => netOpinion(d.premises, d.query) },
        { id: 'degree', predict: d => degreeOpinion(d.premises, d.query) },
    ];
    if (id !== 'linear') bots.push({ id: 'subject', predict: d => subjectOpinion(d.premises, d.query) });
    if (id === 'linear') {
        bots.push({ id: 'instructionOrder', predict: instructionOrderOpinion });
        bots.push({ id: 'stepMagnitude', predict: stepMagnitudeOpinion });
    }
    return {
        id: id as FamilyId,
        formats: ['ternary', 'binary', 'choice'],
        limits: { minEntities: 3, maxEntities: LINE_MAX_ENTITIES },
        ...solver,
        adjust: (p: LevelParams, _o, plan) => lineAdjust(p, plan, plan.cue['qkind'] ? 'ternary' : 'choice'),
        cueSpace: (p, format) => lineCueSpace(cfg, p, format),
        supportedLures: p => p.lureMix,
        construct: (rng, p, plan) => constructLine(cfg, solver, rng, p, plan),
        constructChoice: (rng, p, plan) => constructLineChoice(cfg, solver, rng, p, plan),
        statedDirectly: lineStated,
        lureOf: ctx => lineLure(solver, ctx),
        preferredModel: (premises, n) => linePreferred(solver, premises, n),
        cueMatches: (cue, premises, q) => lineCueMatches(cue, premises, q),
        describe: (vals, names) => describeLine(id, vals, names),
        render: d => renderLine(id, d),
        decorate: (d, rng, p) => decorateLine(d, rng, p),
        invertible: kind => LINE_INVERTIBLE.has(kind),
        bots,
        features: lineFeatures,
    };
}

export const orderNumPlugin = makeLinePlugin('orderNum');
export const orderTimePlugin = makeLinePlugin('orderTime');
export const linearPlugin = makeLinePlugin('linear');

export { idx };
