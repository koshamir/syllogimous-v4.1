// General heuristic bots (spec §4.10). They see the item without the `answer` field.

import { Answer, DraftItem } from '../core/types';
import { classifySubset, touchingQuery } from '../core/support';
import { AnyPlugin, idx } from '../families/plugin';
import { relKey } from './features';

export type Prediction = Answer | string | null;

/** Key of the `prior` bot: conclusion kind × wording polarity × inversion. */
export const priorKey = (d: DraftItem) =>
    `${relKey(d.query)}|${d.query.params?.['w'] ?? 0}|${Object.keys(d.query.params ?? {}).some(k => k === 'inv' || /^i[xyz]$/.test(k)) ? 1 : 0}`;

export const kindKey = (d: DraftItem) => relKey(d.query);

export function trainPrior(items: readonly DraftItem[], key: (d: DraftItem) => string): (d: DraftItem) => Answer {
    const counts = new Map<string, Map<Answer, number>>();
    const global = new Map<Answer, number>();
    for (const d of items) {
        const k = key(d);
        if (!counts.has(k)) counts.set(k, new Map());
        const m = counts.get(k)!;
        m.set(d.answer, (m.get(d.answer) ?? 0) + 1);
        global.set(d.answer, (global.get(d.answer) ?? 0) + 1);
    }
    const argmax = (m: Map<Answer, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const g = argmax(global);
    return d => (counts.has(key(d)) ? argmax(counts.get(key(d))!) : g);
}

/** Exact solver on the premises touching the conclusion entities only. */
export function myopicBot(plugin: AnyPlugin, d: DraftItem): Answer {
    const sub = touchingQuery(d.premises, d.query).map(i => d.premises[i]);
    return classifySubset(plugin, sub, d.query, d.entities.length);
}

/** Builds the "first model that comes to mind" and checks the conclusion in it; never says "Unknown". */
export function oneModelBot(plugin: AnyPlugin, d: DraftItem): Answer {
    const n = d.entities.length;
    const shown = d.displayOrder.map(i => d.premises[i]);
    const m = plugin.preferredModel(shown, n);
    const holds = plugin.compile(d.query, d.query.args.map(idx), n)(m);
    return holds ? 'entailed' : 'contradicted';
}

/** Whichever conclusion entity is mentioned more is "greater / further left / …". */
export function degreeBot(d: DraftItem): Answer | null {
    if (d.query.args.length < 2) return null;
    const c = new Map<string, number>();
    for (const r of d.premises) for (const a of r.args) c.set(a, (c.get(a) ?? 0) + 1);
    const x = (c.get(d.query.args[0]) ?? 0) - (c.get(d.query.args[1]) ?? 0);
    return x > 0 ? 'entailed' : x < 0 ? 'contradicted' : 'undetermined';
}
