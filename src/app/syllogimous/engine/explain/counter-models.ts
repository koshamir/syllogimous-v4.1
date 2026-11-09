// Models for explanations: one model for determined answers, two contrasting models for "Unknown".

import { Vals } from '../core/combinatorics';
import { modelWith } from '../core/solve';
import { Premise, Query } from '../core/types';
import { Rel, SolverPlugin, eid } from '../families/plugin';

export interface ModelPair { model: Vals | null; altModel: Vals | null }

export function contrastModels(plugin: SolverPlugin, premises: readonly Premise[], q: Query, n: number, undetermined: boolean): ModelPair {
    if (!undetermined) return { model: modelWith(plugin, premises, [], n), altModel: null };
    return {
        model: modelWith(plugin, premises, [{ rel: q }], n),
        altModel: modelWith(plugin, premises, [{ rel: q, negate: true }], n),
    };
}

/** Choice items: a model, and (for "cannot be determined") a model with a different entity at the asked position. */
export function choiceModels(plugin: SolverPlugin, premises: readonly Premise[], n: number, position: number, undetermined: boolean): ModelPair {
    const model = modelWith(plugin, premises, [], n);
    if (!undetermined || !model) return { model, altModel: null };
    let occupant = -1;
    for (let e = 0; e < n; e++) if (model[e] === position) occupant = e;
    const notThere: Rel = { kind: 'pos', args: [eid(occupant)], params: { k: position + 1 } };
    return { model, altModel: modelWith(plugin, premises, [{ rel: notThere, negate: true }], n) };
}
