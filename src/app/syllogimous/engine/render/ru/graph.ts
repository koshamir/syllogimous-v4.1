// Russian texts for «Сравнение графов».

import { Premise } from '../../core/types';
import { idx } from '../../families/plugin';
import { subj } from './common';

export const GRAPH_INSTRUCTIONS = {
    iso: 'Проверь, одинаково ли устроены две сети: можно ли так сопоставить участников первой сети участникам второй, чтобы совпали все связи. Первая сеть — в посылках, вторая — ниже.',
    map: 'Две сети устроены одинаково. Найди во второй сети участника с той же ролью, что указанный участник в первой. Первая сеть — в посылках, вторая — ниже.',
} as const;

/** «A передаёт сигнал B» = «B получает сигнал от A»; mutual: «A и B обмениваются сигналами». */
export function graphSentence(r: Premise, names: readonly string[]): string {
    const N = (j: number) => subj(names[idx(r.args[j])]);
    const w = Number(r.params?.['w'] ?? 0) === 1;
    if (r.params?.['t'] === 'mut') return w ? `${N(1)} и ${N(0)} обмениваются сигналами` : `${N(0)} и ${N(1)} обмениваются сигналами`;
    return w ? `${N(1)} получает сигнал от ${N(0)}` : `${N(0)} передаёт сигнал ${N(1)}`;
}

export function graphQuestion(sub: 'iso' | 'map', names: readonly string[], target: number): string {
    if (sub === 'iso') return 'Вторая сеть устроена так же, как первая';
    return `Кто во второй сети играет ту же роль, что ${subj(names[target])} в первой?`;
}

export const describeGraphMap = (corr: string) => (corr ? `Соответствие: ${corr}` : '');
