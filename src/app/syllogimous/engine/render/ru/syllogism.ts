// Russian texts for «Силлогизмы».

import { Rng } from '../../core/rng';
import { DraftItem, ItemRender, LevelParams, Premise, Query } from '../../core/types';
import { Rel, idx } from '../../families/plugin';
import { NOTE_INVERSION, inv, subj } from './common';

const SYMMETRIC = new Set(['no', 'some']);

export function decorateSyl(d: DraftItem, rng: Rng, p: LevelParams): void {
    // inversion per premise independently (v4.1 used one flag for the whole item — itself a cue)
    const deco = <T extends Rel>(r: T, isQuery: boolean): T => {
        const params: Record<string, number | string | boolean> = { ...(r.params ?? {}), w: SYMMETRIC.has(r.kind) ? rng.int(2) : 0 };
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

/** Grammatical subject / predicate as rendered (symmetric quantifiers may be written either way). */
export function sylOrder(r: Rel): [string, string] {
    return Number(r.params?.['w'] ?? 0) === 1 ? [r.args[1], r.args[0]] : [r.args[0], r.args[1]];
}

export function sylSentence(r: Rel & { inverted?: boolean }, names: readonly string[]): string {
    const [s, p] = sylOrder(r);
    const S = subj(names[idx(s)]);
    const Pn = subj(names[idx(p)]);
    const I = !!(r.inverted || r.params?.['inv']);
    switch (r.kind) {
        case 'all': return I ? `${inv('Ни один', true)} ${S} — не ${Pn}` : `Все ${S} — это ${Pn}`;
        case 'no': return I ? `${inv('Все', true)} ${S} — это ${Pn}` : `Ни один ${S} — не ${Pn}`;
        case 'some': return I ? `Некоторые ${S} — ${inv('не', true)} ${Pn}` : `Некоторые ${S} — это ${Pn}`;
        case 'some_not': return I ? `Некоторые ${S} — ${inv('это', true)} ${Pn}` : `Некоторые ${S} — не ${Pn}`;
        default: throw new Error('No Russian template for ' + r.kind);
    }
}

export function renderSyl(d: DraftItem): ItemRender {
    const names = d.entities.map(e => e.name);
    const notes = ['Пустых категорий нет.'];
    if (d.premises.some(r => r.inverted) || d.query.params?.['inv']) notes.push(NOTE_INVERSION);
    return {
        instructions: [],
        notes,
        premises: d.displayOrder.map(i => sylSentence(d.premises[i], names)),
        conclusion: sylSentence(d.query, names),
    };
}

/** «Возможен мир: объект 1 — ВОЛ и ДЕК, не ЗУМ; объект 2 — ДЕК и ЗУМ». */
export function describeSyl(vals: ArrayLike<number>, names: readonly string[], query?: Rel): string {
    const focus = query ? query.args.map(idx) : [];
    const objs: string[] = [];
    for (let i = 0; i < vals[0]; i++) {
        const m = vals[1 + i];
        const ins = names.filter((_, t) => m & (1 << t));
        const outs = focus.filter(t => !(m & (1 << t))).map(t => names[t]);
        objs.push(`объект ${i + 1} — ${ins.join(' и ')}${outs.length ? `, не ${outs.join(' и не ')}` : ''}`);
    }
    return `Возможен мир: ${objs.join('; ')}`;
}
