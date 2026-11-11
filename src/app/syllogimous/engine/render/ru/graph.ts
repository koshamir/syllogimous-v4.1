// Russian texts for «Сравнение графов».

import { Premise } from '../../core/types';
import { idx } from '../../families/plugin';
import { subj } from './common';

export const GRAPH_INSTRUCTIONS = {
    iso: 'Стрелка — связь от одного участника к другому, ↔ — в обе стороны. Устроены ли две сети одинаково: можно ли сопоставить участников так, чтобы совпали все стрелки?',
    map: 'Стрелка — связь от одного участника к другому, ↔ — в обе стороны. Сети устроены одинаково: найди во второй того, кто соответствует указанному участнику первой.',
} as const;

/** «A → B» = «B ← A»; mutual: «A ↔ B». */
export function graphSentence(r: Premise, names: readonly string[]): string {
    const N = (j: number) => subj(names[idx(r.args[j])]);
    const w = Number(r.params?.['w'] ?? 0) === 1;
    if (r.params?.['t'] === 'mut') return w ? `${N(1)} ↔ ${N(0)}` : `${N(0)} ↔ ${N(1)}`;
    return w ? `${N(1)} ← ${N(0)}` : `${N(0)} → ${N(1)}`;
}

export function graphQuestion(sub: 'iso' | 'map', names: readonly string[], target: number): string {
    if (sub === 'iso') return 'Вторая сеть устроена так же, как первая';
    return `Кто во второй сети соответствует ${subj(names[target])}?`;
}

export const describeGraphMap = (corr: string) => (corr ? `Соответствие: ${corr}` : '');
