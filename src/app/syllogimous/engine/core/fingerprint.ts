// Structural fingerprint (spec §4.8): family + multiset of premise kinds + canonical degree sequence
// of the premise graph + conclusion kind + answer. Names, order and wording do not matter.

import { Answer, FamilyId, Premise, Query } from './types';

export function fingerprint(family: FamilyId, premises: readonly Premise[], query: Query, answer: Answer): string {
    const kinds = premises.map(p => p.kind).sort().join(',');
    const deg = new Map<string, number>();
    for (const p of premises) for (const a of p.args) deg.set(a, (deg.get(a) ?? 0) + 1);
    const degSeq = [...deg.values()].sort((a, b) => b - a).join('');
    const qDeg = query.args.map(a => deg.get(a) ?? 0).sort((a, b) => b - a).join('');
    return `${family}|${kinds}|${degSeq}|${query.kind}:${qDeg}|${answer}`;
}
