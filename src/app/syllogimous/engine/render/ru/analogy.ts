// Russian texts for «Аналогии». Premises are rendered by the base family; this file adds the definition of
// "the same relation" for the base and the conclusion sentence.

import { DraftItem, ItemRender, Query } from '../../core/types';
import { idx } from '../../families/plugin';
import { subj } from './common';

export type AnaBaseId = 'groups' | 'orderNum' | 'orderTime' | 'linear' | 'circular' | 'dir2d';

export const ANALOGY_DEFINITION: Record<AnaBaseId, string> = {
    groups: '«Такое же отношение» — обе пары на одной стороне или обе пары на разных сторонах.',
    orderNum: '«Такое же отношение» — в обеих парах первый больше второго или в обеих меньше.',
    orderTime: '«Такое же отношение» — в обеих парах первое событие позже второго или в обеих раньше.',
    linear: '«Такое же отношение» — первый стоит с той же стороны от второго и на том же расстоянии.',
    circular: '«Такое же отношение» — от второго до первого по часовой стрелке одинаковое число шагов.',
    dir2d: '«Такое же отношение» — первый смещён относительно второго одинаково: в ту же сторону и на столько же шагов.',
};

export function analogySentence(q: Query, names: readonly string[]): string {
    const N = (j: number) => subj(names[idx(q.args[j])]);
    const swap = Number(q.params?.['w'] ?? 0) === 1;
    const [p1, p2] = swap ? [[2, 3], [0, 1]] : [[0, 1], [2, 3]];
    const same = q.params?.['w2'] !== 'diff';
    const middle = same ? 'такое же, как отношение' : 'отличается от отношения';
    return `Отношение ${N(p1[0])} к ${N(p1[1])} ${middle} ${N(p2[0])} к ${N(p2[1])}`;
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
