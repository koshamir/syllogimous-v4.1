// Russian texts for «Круговой порядок».

import { Rng } from '../../core/rng';
import { DraftItem, ItemRender, LevelParams, Premise, Query } from '../../core/types';
import { Rel, idx } from '../../families/plugin';
import { NOTE_INVERSION, alphabetical, inv, pluralRu, subj } from './common';

const WORDED = new Set(['immLeft', 'immRight']);

export function decorateCirc(d: DraftItem, rng: Rng, p: LevelParams): void {
    const deco = <T extends Rel>(r: T, isQuery: boolean): T => {
        const params: Record<string, number | string | boolean> = { ...(r.params ?? {}), w: rng.int(2) };
        const flag = WORDED.has(r.kind) && p.negationRate > 0 && rng.chance(p.negationRate);
        if (isQuery) {
            if (flag) params['inv'] = true;
            return { ...r, params };
        }
        return { ...r, params, inverted: flag || undefined };
    };
    d.premises = d.premises.map(r => deco(r, false) as Premise);
    d.query = deco(d.query, true) as Query;
}

function sentence(r: Rel & { inverted?: boolean }, names: readonly string[]): string {
    const N = (j: number) => subj(names[idx(r.args[j])]);
    const sw = Number(r.params?.['w'] ?? 0) === 1;
    const I = !!(r.inverted || r.params?.['inv']);
    const side = (left: boolean) => inv(left !== I ? 'слева' : 'справа', I);
    switch (r.kind) {
        case 'immLeft':   // a = b + 1 (a is b's left neighbour)
            return sw ? `${N(1)} сидит сразу ${side(false)} от ${N(0)}` : `${N(0)} сидит сразу ${side(true)} от ${N(1)}`;
        case 'immRight':
            return sw ? `${N(1)} сидит сразу ${side(true)} от ${N(0)}` : `${N(0)} сидит сразу ${side(false)} от ${N(1)}`;
        case 'adj': return sw ? `${N(1)} и ${N(0)} сидят рядом` : `${N(0)} и ${N(1)} сидят рядом`;
        case 'notAdj': return sw ? `${N(1)} и ${N(0)} сидят не рядом` : `${N(0)} и ${N(1)} сидят не рядом`;
        case 'opposite': return sw ? `${N(1)} сидит напротив ${N(0)}` : `${N(0)} сидит напротив ${N(1)}`;
        case 'gap': {
            const k = Number(r.params?.['k'] ?? 0);
            const [x, y] = sw ? [1, 0] : [0, 1];
            return `Между ${N(x)} и ${N(y)} по короткой дуге ровно ${k} ${pluralRu(k, 'человек', 'человека', 'человек')}`;
        }
        case 'between': {
            const [x, y] = sw ? [2, 1] : [1, 2];
            return `${N(0)} сидит между ${N(x)} и ${N(y)}`;
        }
        default: throw new Error('No Russian template for ' + r.kind);
    }
}

export function renderCirc(d: DraftItem): ItemRender {
    const names = d.entities.map(e => e.name);
    const notes: string[] = [];
    if (d.premises.some(r => r.inverted) || d.query.params?.['inv']) notes.push(NOTE_INVERSION);
    return {
        instructions: [
            `Участники: ${alphabetical(names).map(subj).join(', ')} (порядок в списке — алфавитный).`,
            'Все сидят за круглым столом лицом к центру. «Слева от Х» — с точки зрения Х, сидящего лицом к центру. «Х сидит между У и Ф» — У и Ф его соседи.',
        ],
        notes,
        premises: d.displayOrder.map(i => sentence(d.premises[i], names)),
        conclusion: sentence(d.query, names),
    };
}

/** «По часовой: ДЕК → ВОЛ → ЗУМ → ПАЙ → (ДЕК)» */
export function describeCirc(vals: ArrayLike<number>, names: readonly string[]): string {
    const order = names.map((_, i) => i).sort((a, b) => vals[a] - vals[b]).map(i => names[i]);
    return `По часовой: ${order.join(' → ')} → (${order[0]})`;
}
