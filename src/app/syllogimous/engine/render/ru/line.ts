// Russian texts for orderNum («Сравнение чисел»), orderTime («Порядок во времени») and linear («Линейный порядок»).

import { Rng } from '../../core/rng';
import { DraftItem, ItemRender, LevelParams, Premise, Query } from '../../core/types';
import { Rel, idx } from '../../families/plugin';
import type { LineId } from '../../families/line';
import { NOTE_INVERSION, ORD_INS, ORD_NOM, alphabetical, inv, listRu, pluralRu, subj } from './common';

const WORDED = new Set(['gt', 'left', 'succ', 'immLeft', 'steps']);
export const LINE_INVERTIBLE = WORDED;

const PERMS3 = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

/** Presentation choices: wording variant `w`, list permutation `p`, red inversions. */
export function decorateLine(d: DraftItem, rng: Rng, p: LevelParams): void {
    const deco = <T extends Rel>(r: T, isQuery: boolean): T => {
        const params: Record<string, number | string | boolean> = { ...(r.params ?? {}) };
        if (WORDED.has(r.kind) || r.kind === 'between') params['w'] = rng.int(2);
        if (r.kind === 'between') params['p'] = rng.int(6);
        const invertible = WORDED.has(r.kind) && p.negationRate > 0;
        const flag = invertible && rng.chance(p.negationRate);
        if (isQuery) {
            if (flag) params['inv'] = true;
            return { ...r, params };
        }
        return { ...r, params, inverted: flag || undefined };
    };
    d.premises = d.premises.map(r => deco(r, false) as Premise);
    if (d.query.kind !== 'rankAt') d.query = deco(d.query, true) as Query;
}

const inverted = (r: Rel & { inverted?: boolean }) => !!(r.inverted || r.params?.['inv']);
const w = (r: Rel) => Number(r.params?.['w'] ?? 0);
const k = (r: Rel) => Number(r.params?.['k'] ?? 0);

/** Pick word i of an antonym pair, swapped (and red) when inverted. */
function pairWord(pair: [string, string], i: number, isInv: boolean): string {
    return inv(pair[isInv ? 1 - i : i], isInv);
}

function sentence(id: LineId, r: Rel, names: readonly string[]): string {
    const N = (j: number) => subj(names[idx(r.args[j])]);
    const I = inverted(r);
    switch (r.kind) {
        case 'gt': {
            const pair: [string, string] = id === 'orderTime' ? ['позже', 'раньше'] : ['больше', 'меньше'];
            const verb = id === 'orderTime' ? 'произошло ' : '';
            return w(r) === 0 ? `${N(0)} ${verb}${pairWord(pair, 0, I)}, чем ${N(1)}` : `${N(1)} ${verb}${pairWord(pair, 1, I)}, чем ${N(0)}`;
        }
        case 'succ':
            return w(r) === 0
                ? `${N(0)} произошло сразу ${pairWord(['после', 'перед'], 0, I)} ${N(1)}`
                : `${N(1)} произошло сразу ${pairWord(['после', 'перед'], 1, I)} ${N(0)}`;
        case 'left':
            return w(r) === 0 ? `${N(0)} стоит ${pairWord(['левее', 'правее'], 0, I)}, чем ${N(1)}` : `${N(1)} стоит ${pairWord(['левее', 'правее'], 1, I)}, чем ${N(0)}`;
        case 'immLeft':
            return w(r) === 0 ? `${N(0)} стоит сразу ${pairWord(['слева', 'справа'], 0, I)} от ${N(1)}` : `${N(1)} стоит сразу ${pairWord(['слева', 'справа'], 1, I)} от ${N(0)}`;
        case 'steps': {
            const pos = `${k(r)} ${pluralRu(k(r), 'позицию', 'позиции', 'позиций')}`;
            return w(r) === 0 ? `${N(0)} стоит на ${pos} ${pairWord(['левее', 'правее'], 0, I)}, чем ${N(1)}` : `${N(1)} стоит на ${pos} ${pairWord(['левее', 'правее'], 1, I)}, чем ${N(0)}`;
        }
        case 'between': {
            const [x, y] = w(r) === 0 ? [1, 2] : [2, 1];
            if (id === 'orderNum') return `По величине ${N(0)} — между ${N(x)} и ${N(y)}`;
            if (id === 'orderTime') return `${N(0)} произошло между ${N(x)} и ${N(y)}`;
            const perm = PERMS3[Number(r.params?.['p'] ?? 0)];
            return `Из ${listRu(perm.map(N))} посередине стоит ${N(0)}`;
        }
        case 'gap': return `Между ${N(0)} и ${N(1)} произошло ровно ${k(r)} ${pluralRu(k(r), 'событие', 'события', 'событий')}`;
        case 'dist': return `${N(0)} и ${N(1)} разделяют ровно ${k(r)} ${pluralRu(k(r), 'человек', 'человека', 'человек')}`;
        case 'adj': return `${N(0)} и ${N(1)} стоят рядом`;
        case 'notAdj': return `${N(0)} и ${N(1)} стоят не рядом`;
        case 'extreme': {
            const max = r.params?.['side'] === 'max';
            if (id === 'orderTime') return `${N(0)} произошло ${max ? 'последним' : 'первым'}`;
            return `${N(0)} — самый ${max ? 'большой' : 'маленький'}`;
        }
        case 'end': return `${N(0)} стоит с краю`;
        case 'notEnd': return `${N(0)} стоит не с краю`;
        case 'pos': return `${N(0)} стоит ${ORD_INS[k(r)]} слева`;
        default: throw new Error(`No Russian template for ${r.kind}`);
    }
}

export function renderLine(id: LineId, d: DraftItem): ItemRender {
    const names = d.entities.map(e => e.name);
    const premises = d.displayOrder.map(i => sentence(id, d.premises[i], names));
    const instructions: string[] = [];
    const notes: string[] = [];
    if (id === 'linear') {
        instructions.push(`Участники: ${alphabetical(names).map(subj).join(', ')} (порядок в списке — алфавитный).`);
        instructions.push('Все стоят в один ряд; «левее» и «правее» — с точки зрения наблюдателя.');
    }
    if (d.premises.some(r => r.inverted) || d.query.params?.['inv']) notes.push(NOTE_INVERSION);
    let conclusion: string;
    if (d.query.kind === 'rankAt') {
        const r = k(d.query);
        conclusion = id === 'orderNum' ? `Кто ${ORD_NOM[r]} по величине?`
            : id === 'orderTime' ? `Какое событие произошло ${ORD_INS[r]} по счёту?`
                : `Кто стоит ${ORD_INS[r]} слева?`;
        notes.push('Если ответ нельзя определить однозначно, выбери «Нельзя определить».');
    } else {
        conclusion = sentence(id, d.query, names);
    }
    return { instructions, notes, premises, conclusion };
}

/** Compact model: «ДЕК < ВОЛ < ЗУМ», «ДЕК → ВОЛ → ЗУМ, от раннего к позднему», «[ДЕК] [ВОЛ] [ЗУМ]». */
export function describeLine(id: LineId, vals: ArrayLike<number>, names: readonly string[]): string {
    const order = Array.from({ length: names.length }, (_, i) => i).sort((a, b) => vals[a] - vals[b]).map(i => names[i]);
    if (id === 'orderNum') return order.join(' < ');
    if (id === 'orderTime') return `${order.join(' → ')}, от раннего к позднему`;
    return order.map(x => `[${x}]`).join(' ');
}
