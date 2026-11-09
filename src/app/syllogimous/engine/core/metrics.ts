// Item metrics (spec §4.5).

import { Answer, ItemMetrics, Premise, Query } from './types';
import { log2Models } from './solve';
import { isConvergent, myopicAnswer } from './support';
import { discontinuity } from './presentation';
import { SolverPlugin } from '../families/plugin';

export interface MetricsInput {
    plugin: SolverPlugin;
    premises: readonly Premise[];
    query: Query;
    answer: Answer;
    support: number[] | null;
    n: number;
    displayOrder: readonly number[];
    relaxations: string[];
    queryInverted: boolean;
}

export function computeMetrics(x: MetricsInput): ItemMetrics {
    const S = (x.support ?? []).map(i => x.premises[i]);
    const inS = new Set(x.support ?? []);
    const sEnts = new Set<string>();
    for (const r of S) for (const a of r.args) sEnts.add(a);
    const width = new Set([...sEnts, ...x.query.args]).size;
    const distractors = x.premises.length - S.length;
    const attached = x.premises.filter((r, i) => !inS.has(i) && r.args.some(a => sEnts.has(a))).length;
    const determined = x.answer !== 'undetermined' && x.query.args.length > 0;
    return {
        entities: x.n,
        premises: x.premises.length,
        support: x.support ? x.support.length : null,
        supportIdx: (x.support ?? []).slice().sort((a, b) => a - b),
        width: x.support ? width : 0,
        arityMax: S.reduce((m, r) => Math.max(m, r.args.length), 0),
        convergent: x.support ? isConvergent(S, x.query) : false,
        nonLocal: determined ? myopicAnswer(x.plugin, x.premises, x.query, x.n) === 'undetermined' : false,
        modelsLog2: log2Models(x.plugin, x.premises, x.n),
        distractors,
        attachedDistractors: attached,
        negations: x.premises.filter(r => r.inverted).length + (x.queryInverted ? 1 : 0),
        metas: x.premises.filter(r => r.kind === 'meta').length,
        discontinuity: discontinuity(x.premises, x.displayOrder),
        relaxations: x.relaxations.slice(),
    };
}
