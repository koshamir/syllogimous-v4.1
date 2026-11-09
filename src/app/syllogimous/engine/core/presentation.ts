// Premise display order (spec §4.7).

import { Rng } from './rng';
import { PremiseOrderMode } from './types';
import { Rel } from '../families/plugin';

const shares = (a: Rel, b: Rel) => a.args.some(x => b.args.includes(x));

/** Greedy: the next premise shares no entities with the previous one, while possible. */
function discontinuous(rng: Rng, premises: readonly Rel[]): number[] {
    const left = rng.shuffle(premises.map((_, i) => i));
    const out: number[] = [left.pop()!];
    while (left.length) {
        const prev = premises[out[out.length - 1]];
        let k = left.findIndex(i => !shares(prev, premises[i]));
        if (k < 0) k = 0;
        out.push(left.splice(k, 1)[0]);
    }
    return out;
}

/** Support premises spread apart (first / middle / last) with distractors between them. */
function adversarial(rng: Rng, premises: readonly Rel[], support: readonly number[]): number[] {
    const m = premises.length;
    const s = support.length;
    if (s < 2 || s >= m) return discontinuous(rng, premises);
    const slots: (number | null)[] = new Array(m).fill(null);
    const sup = rng.shuffle(support.slice());
    for (let i = 0; i < s; i++) slots[Math.round((i * (m - 1)) / (s - 1))] = sup[i];
    const sset = new Set(support);
    const rest = rng.shuffle(premises.map((_, i) => i).filter(i => !sset.has(i)));
    for (let i = 0; i < m; i++) if (slots[i] === null) slots[i] = rest.pop()!;
    return slots as number[];
}

export function displayOrder(rng: Rng, premises: readonly Rel[], mode: PremiseOrderMode, support: readonly number[]): number[] {
    if (premises.length === 0) return [];
    switch (mode) {
        case 'discontinuous': return discontinuous(rng, premises);
        case 'adversarial': return adversarial(rng, premises, support);
        default: return rng.shuffle(premises.map((_, i) => i));
    }
}

/** Share of adjacent displayed pairs with no shared entity. */
export function discontinuity(premises: readonly Rel[], order: readonly number[]): number {
    if (order.length < 2) return 0;
    let c = 0;
    for (let i = 1; i < order.length; i++) if (!shares(premises[order[i - 1]], premises[order[i]])) c++;
    return c / (order.length - 1);
}
