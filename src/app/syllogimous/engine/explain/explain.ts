// Post-answer explanation (spec §4.9).

import { DraftItem, Explanation, StrategyTipId } from '../core/types';
import { LURE_NOTES } from '../render/ru/common';
import { AnyPlugin } from '../families/plugin';
import { choiceModels, contrastModels } from './counter-models';

export function buildExplanation(plugin: AnyPlugin, d: DraftItem, choicePosition?: number): Explanation {
    const names = d.entities.map(e => e.name);
    const n = d.entities.length;
    const undetermined = d.answer === 'undetermined';
    const pair = d.query.kind === 'rankAt' && choicePosition !== undefined
        ? choiceModels(plugin, d.premises, n, choicePosition, undetermined)
        : contrastModels(plugin, d.premises, d.query, n, undetermined);
    const ex: Explanation = {
        supportDisplayIdx: d.metrics.supportIdx.map(i => d.displayOrder.indexOf(i)).sort((a, b) => a - b),
    };
    if (pair.model) ex.model = plugin.describe(pair.model, names, d.query);
    if (pair.altModel) ex.altModel = plugin.describe(pair.altModel, names, d.query);
    if (d.lure !== 'none') ex.lureNote = LURE_NOTES[d.lure];
    ex.tipId = tipFor(d);
    return ex;
}

function tipFor(d: DraftItem): StrategyTipId {
    if (d.lure === 'possible') return 3;
    if (d.lure === 'surface') return 5;
    if (d.metrics.negations > 0) return 7;
    if (d.answer === 'undetermined') return 4;
    if (d.metrics.convergent) return 2;
    return 1;
}
