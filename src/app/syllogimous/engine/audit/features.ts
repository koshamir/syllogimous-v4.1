// Surface features for the learned bot (spec §4.10): only what is visible in the rendered item.

import { DraftItem } from '../core/types';
import { AnyPlugin } from '../families/plugin';

export type FeatureVec = Record<string, number>;

/** Visible relation type: kind plus its subtype (query type `q` or phrase `t`) when a family uses one kind. */
export const relKey = (r: { kind: string; params?: Record<string, unknown> }) =>
    r.kind + (r.params?.['q'] !== undefined ? ':' + String(r.params['q']) : r.params?.['t'] !== undefined ? ':' + String(r.params['t']) : '');

export function generalFeatures(d: DraftItem): FeatureVec {
    const f: FeatureVec = {};
    const shown = d.displayOrder.map(i => d.premises[i]);
    for (const r of shown) f[`kind:${relKey(r)}`] = (f[`kind:${relKey(r)}`] ?? 0) + 1;
    f['premises'] = shown.length;
    f['entities'] = d.entities.length;
    f['inversions'] = shown.filter(r => r.inverted).length;
    f['metas'] = shown.filter(r => r.kind === 'meta').length;
    f[`q:${relKey(d.query)}`] = 1;
    f['q:wording'] = Number(d.query.params?.['w'] ?? 0);
    f['q:inverted'] = d.query.params?.['inv'] ? 1 : 0;
    f['q:k'] = Number(d.query.params?.['k'] ?? 0);
    const deg = new Map<string, number>();
    for (const r of shown) for (const a of r.args) deg.set(a, (deg.get(a) ?? 0) + 1);
    const first = new Map<string, number>();
    shown.forEach((r, i) => r.args.forEach(a => { if (!first.has(a)) first.set(a, i); }));
    const m = Math.max(1, shown.length);
    d.query.args.forEach((a, j) => {
        f[`q${j}:deg`] = deg.get(a) ?? 0;
        f[`q${j}:leaf`] = (deg.get(a) ?? 0) === 1 ? 1 : 0;
        f[`q${j}:first`] = (first.get(a) ?? m) / m;
    });
    if (d.query.args.length >= 2) {
        f['q:degDiff'] = (deg.get(d.query.args[0]) ?? 0) - (deg.get(d.query.args[1]) ?? 0);
        f['q:firstDiff'] = (first.get(d.query.args[0]) ?? m) / m - (first.get(d.query.args[1]) ?? m) / m;
    }
    const qs = new Set(d.query.args);
    f['q:cooccur'] = shown.some(r => r.args.filter(a => qs.has(a)).length >= 2) ? 1 : 0;
    return f;
}

export function allFeatures(plugin: AnyPlugin, d: DraftItem): FeatureVec {
    const f = generalFeatures(d);
    for (const [k, v] of Object.entries(plugin.features(d))) f[`fam:${k}`] = v;
    return f;
}
