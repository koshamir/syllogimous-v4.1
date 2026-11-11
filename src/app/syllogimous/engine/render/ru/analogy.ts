// Russian texts for «Аналогии». Premises are rendered by the base family; this file adds the definition of
// "the same relation" for the base and the conclusion sentence.

import { DraftItem, ItemRender, Query } from '../../core/types';
import { idx } from '../../families/plugin';
import { subj } from './common';

export type AnaBaseId = 'groups' | 'orderNum' | 'orderTime' | 'linear' | 'circular' | 'dir2d';

export const ANALOGY_DEFINITION: Record<AnaBaseId, string> = {
    groups: '«Как» — обе пары равны или обе противоположны.',
    orderNum: '«Как» — в обеих парах первый больше или в обеих меньше.',
    orderTime: '«Как» — в обеих парах первое позже или в обеих раньше.',
    linear: '«Как» — с той же стороны и на том же расстоянии.',
    circular: '«Как» — столько же мест по часовой стрелке.',
    dir2d: '«Как» — в ту же сторону и на столько же шагов.',
};

export function analogySentence(q: Query, names: readonly string[]): string {
    const N = (j: number) => subj(names[idx(q.args[j])]);
    const swap = Number(q.params?.['w'] ?? 0) === 1;
    const [p1, p2] = swap ? [[2, 3], [0, 1]] : [[0, 1], [2, 3]];
    const same = q.params?.['w2'] !== 'diff';
    return `${N(p1[0])} к ${N(p1[1])} — ${same ? 'как' : 'не как'} ${N(p2[0])} к ${N(p2[1])}`;
}

/** Base render (premises, instructions, notes) + definition + conclusion. */
export function renderAnalogy(base: AnaBaseId, d: DraftItem, baseRender: ItemRender): ItemRender {
    const names = d.entities.map(e => e.name);
    return {
        instructions: [...baseRender.instructions, ANALOGY_DEFINITION[base]],
        notes: baseRender.notes,
        premises: baseRender.premises,
        conclusion: analogySentence(d.query, names),
    };
}

/** Base model + the two compared pairs. */
export function describeAnalogy(baseModel: string, names: readonly string[], q: Query): string {
    const [a, b, c, d] = q.args.map(x => names[idx(x)]);
    return `${baseModel} · пары: ${a} к ${b} и ${c} к ${d}`;
}
