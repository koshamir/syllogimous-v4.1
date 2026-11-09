// Russian texts for «Равенство и противоположность» (groups).

import { Rng } from '../../core/rng';
import { DraftItem, ItemRender, LevelParams, Premise, Query } from '../../core/types';
import { Rel, idx } from '../../families/plugin';
import { NOTE_INVERSION, inv, subj } from './common';

export function decorateGroups(d: DraftItem, rng: Rng, p: LevelParams): void {
    const deco = <T extends Rel>(r: T, isQuery: boolean): T => {
        const params: Record<string, number | string | boolean> = { ...(r.params ?? {}), w: rng.int(2) };
        const flag = p.negationRate > 0 && rng.chance(p.negationRate);
        if (isQuery) {
            if (flag) params['inv'] = true;
            return { ...r, params };
        }
        return { ...r, params, inverted: flag || undefined };
    };
    d.premises = d.premises.map(r => deco(r, false) as Premise);
    d.query = deco(d.query, true) as Query;
}

const isInv = (r: Rel & { inverted?: boolean }) => !!(r.inverted || r.params?.['inv']);

function sentence(r: Rel, names: readonly string[]): string {
    const N = (j: number) => subj(names[idx(r.args[j])]);
    const I = isInv(r);
    const sw = Number(r.params?.['w'] ?? 0) === 1;
    if (r.kind === 'same' || r.kind === 'opp') {
        const same = r.kind === 'same';
        const shown = I ? !same : same;
        const word = inv(shown ? 'равен' : 'противоположен', I);
        return sw ? `${N(1)} ${word} ${N(0)}` : `${N(0)} ${word} ${N(1)}`;
    }
    if (r.kind === 'meta') {
        const same = r.params?.['rel'] === 'same';
        const shown = I ? !same : same;
        const [p1, p2] = sw ? [[2, 3], [0, 1]] : [[0, 1], [2, 3]];
        const rel = shown ? `${inv('такое же', I)}, как отношение` : `${inv('противоположно', I)} отношению`;
        return `Отношение ${N(p1[0])} к ${N(p1[1])} ${rel} ${N(p2[0])} к ${N(p2[1])}`;
    }
    throw new Error(`No Russian template for ${r.kind}`);
}

export function renderGroups(d: DraftItem): ItemRender {
    const names = d.entities.map(e => e.name);
    const notes: string[] = [];
    if (d.premises.some(r => r.inverted) || d.query.params?.['inv']) notes.push(NOTE_INVERSION);
    return {
        instructions: ['Каждый участник стоит на одной из двух сторон: «равен» — на той же стороне, «противоположен» — на другой.'],
        notes,
        premises: d.displayOrder.map(i => sentence(d.premises[i], names)),
        conclusion: sentence(d.query, names),
    };
}

/** «Одна сторона: ВОЛ, ДЕК · Другая сторона: ЗУМ, ПАЙ» */
export function describeGroups(vals: ArrayLike<number>, names: readonly string[]): string {
    const a: string[] = [];
    const b: string[] = [];
    names.forEach((nm, i) => (vals[i] === vals[0] ? a : b).push(nm));
    return `Одна сторона: ${a.join(', ')} · Другая сторона: ${b.length ? b.join(', ') : '—'}`;
}
