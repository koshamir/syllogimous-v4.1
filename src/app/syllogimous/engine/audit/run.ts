// Cue-audit harness (spec §4.10). Pure: returns numbers; the *.audit.ts runner writes the reports.

import { Rng } from '../core/rng';
import { Answer, AnswerFormat, DEFAULT_ENGINE_OPTIONS, DraftItem, FamilyId, Item } from '../core/types';
import { DIRECT, generate, irredundant, pluginFor } from '../generate';
import { generalFeatures } from './features';
import { graphOf, jointSignature, mentionOrder, signatures } from '../families/graph';
import { idx } from '../families/plugin';
import { PREMISE_RANGE, clampPremises, planningParams } from '../difficulty/ladder';
import { emptySchedulerState, nextPlan } from '../difficulty/scheduler';
import { choiceDegreePick, choiceFirstMentionPick } from '../families/line';
import { allFeatures } from './features';
import { degreeBot, kindKey, myopicBot, oneModelBot, priorKey, trainPrior, Prediction } from './bots';
import { predictSoftmax, trainSoftmax } from './learned-bot';

/** Premise counts audited (clamped to each family's range, duplicates dropped). */
export const AUDIT_LEVELS = [2, 3, 4, 6, 8];
export const LEARNED_LEVELS = [3, 6];

export function auditLevelsFor(family: FamilyId): number[] {
    if (family === 'graph') return [5, 6, 7, 8];
    if (family === 'binary') return [4, 6, 8, 12];
    return [...new Set(AUDIT_LEVELS.map(l => clampPremises(family, l)))];
}

export function learnedLevelsFor(family: FamilyId): number[] {
    const [lo, hi] = PREMISE_RANGE[family];
    return [...new Set(LEARNED_LEVELS.map(l => Math.max(lo, Math.min(hi, l))))];
}

export interface Batch { items: Item[]; times: number[] }

export function runBatch(family: FamilyId, level: number, format: AnswerFormat, N: number, tag: string): Batch {
    if (DIRECT[family]) return runDirectBatch(family, level, format, N, tag);
    const plugin = pluginFor(family);
    const o = DEFAULT_ENGINE_OPTIONS;
    const pp = planningParams(level, o);
    const rng = new Rng(`audit:${tag}:${family}:${level}:${format}`);
    let st = emptySchedulerState();
    const items: Item[] = [];
    const times: number[] = [];
    for (let i = 0; i < N; i++) {
        const r = nextPlan(st, {
            family, format, params: pp,
            cueSpace: format === 'choice' ? {} : plugin.cueSpace(pp, format, o),
            lures: plugin.supportedLures(pp, o),
        }, rng);
        st = r.state;
        const t0 = performance.now();
        items.push(generate({ family, level, seed: `${tag}:${family}:${level}:${format}:${i}`, format, plan: r.plan }));
        times.push(performance.now() - t0);
    }
    return { items, times };
}

const pct = (x: number) => Math.round(x * 1000) / 10;

export function quantile(xs: readonly number[], q: number): number {
    const s = xs.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

/** Accuracy; null (abstain) counts as a guess = 1/k. */
export function accuracy(preds: readonly Prediction[], truth: readonly string[], k: number): number {
    let s = 0;
    preds.forEach((p, i) => { s += p === null ? 1 / k : p === truth[i] ? 1 : 0; });
    return s / Math.max(1, preds.length);
}

export interface Gate { name: string; value: number; limit: string; pass: boolean }

export interface LevelReport {
    family: FamilyId;
    level: number;
    N: number;
    classes: Record<Answer, number>;
    majority: number;
    bots: Record<string, number>;
    oneModelEonU: number;
    learned?: number;
    /** Share of items with exactly the requested number of premises, %. */
    exact: number;
    /** Share of determined items in which every premise is necessary, %. */
    necessary: number;
    relaxations: number;
    p50: number;
    p95: number;
    gates: Gate[];
}

export function auditLevel(family: FamilyId, level: number, N: number, train: Batch, test: Batch): LevelReport {
    const plugin = pluginFor(family);
    const items = test.items;
    const truth = items.map(d => d.answer);
    const classes: Record<Answer, number> = { entailed: 0, contradicted: 0, undetermined: 0 };
    for (const a of truth) classes[a as Answer]++;
    (Object.keys(classes) as Answer[]).forEach(k => (classes[k] = pct(classes[k] / items.length)));
    const majority = Math.max(...Object.values(classes));
    const bots: Record<string, number> = {};
    const prior = trainPrior(train.items, priorKey);
    const kindPrior = trainPrior(train.items, kindKey);
    bots['prior'] = pct(accuracy(items.map(prior), truth, 3));
    bots['kindPrior'] = pct(accuracy(items.map(kindPrior), truth, 3));
    bots['degreeGeneral'] = pct(accuracy(items.map(degreeBot), truth, 3));
    bots['myopic'] = pct(accuracy(items.map(d => myopicBot(plugin, d)), truth, 3));
    for (const b of plugin.bots) bots[b.id] = pct(accuracy(items.map(d => b.predict(d)), truth, 3));
    const U = items.filter(d => d.answer === 'undetermined');
    const oneModelEonU = pct(U.filter(d => oneModelBot(plugin, d) === 'entailed').length / Math.max(1, U.length));
    bots['oneModel'] = pct(accuracy(items.map(d => oneModelBot(plugin, d)), truth, 3));

    let learned: number | undefined;
    if (learnedLevelsFor(family).includes(level)) {
        const model = trainSoftmax(train.items.map(d => allFeatures(plugin, d)), train.items.map(d => d.answer));
        learned = pct(accuracy(items.map(d => predictSoftmax(model, allFeatures(plugin, d))), truth, 3));
    }
    const relaxations = pct(items.filter(d => d.metrics.relaxations.length > 0).length / items.length);
    const p50 = quantile(test.times, 0.5);
    const p95 = quantile(test.times, 0.95);

    // v5.1 structural gates: exactly P premises, and every premise of a determined item is necessary
    const P = clampPremises(family, level);
    const exact = pct(items.filter(d => d.premises.length === P).length / items.length);
    const det = items.filter(d => d.answer !== 'undetermined').slice(0, 400);
    const necessary = pct(det.filter(d => irredundant(plugin, d.premises, d.query, d.answer, d.entities.length)).length / Math.max(1, det.length));

    const gates: Gate[] = [];
    for (const [k, v] of Object.entries(classes)) gates.push({ name: `class ${k}`, value: v, limit: '30–36.7', pass: v >= 30 && v <= 36.7 });
    gates.push({ name: 'premises exact', value: exact, limit: '= 100', pass: exact === 100 });
    gates.push({ name: 'all premises necessary', value: necessary, limit: '= 100', pass: necessary === 100 });
    // bots that do not read the premises at all must stay at the majority class; bots that read a part of the
    // premises (win counts, mention counts, the premises next to the conclusion, the learned bot) are reported
    for (const id of ['prior', 'kindPrior']) {
        gates.push({ name: `bot ${id}`, value: bots[id], limit: `≤ ${pct(majority / 100 + 0.05)}`, pass: bots[id] <= majority + 5 });
    }
    gates.push({ name: 'relaxations', value: relaxations, limit: '≤ 10', pass: relaxations <= 10 });
    gates.push({ name: 'p95 ms', value: Math.round(p95 * 10) / 10, limit: '≤ 40', pass: p95 <= 40 });
    return { family, level, N: items.length, classes, majority, bots, oneModelEonU, learned, exact, necessary, relaxations, p50, p95, gates };
}

export interface ChoiceReport { family: FamilyId; level: number; N: number; chance: number; none: number; degree: number; firstMention: number; relaxations: number; gates: Gate[] }

export function auditChoice(family: FamilyId, level: number, b: Batch): ChoiceReport {
    const items = b.items;
    const cfg = { id: family as 'orderNum', winsHigh: family !== 'linear' };
    const chance = pct(items.reduce((s, d) => s + 1 / (d.options?.length ?? 1), 0) / items.length);
    const none = pct(items.filter(d => d.correctOptionId === 'none').length / items.length);
    const degree = pct(items.filter(d => choiceDegreePick(cfg, d) === d.correctOptionId).length / items.length);
    const firstMention = pct(items.filter(d => choiceFirstMentionPick(d) === d.correctOptionId).length / items.length);
    const relaxations = pct(items.filter(d => d.metrics.relaxations.length > 0).length / items.length);
    const gates: Gate[] = [
        { name: 'choice «Нельзя определить»', value: none, limit: '22–28', pass: none >= 22 && none <= 28 },
        { name: 'choice bot degree', value: degree, limit: `≤ ${Math.round((chance + 7) * 10) / 10}`, pass: degree <= chance + 7 },
        { name: 'choice bot firstMention', value: firstMention, limit: `≤ ${Math.round((chance + 7) * 10) / 10}`, pass: firstMention <= chance + 7 },
        { name: 'choice relaxations', value: relaxations, limit: '≤ 10', pass: relaxations <= 10 },
    ];
    return { family, level, N: items.length, chance, none, degree, firstMention, relaxations, gates };
}

export interface BinaryReport { family: FamilyId; level: number; N: number; entailed: number; gates: Gate[] }

export function auditBinary(family: FamilyId, level: number, b: Batch): BinaryReport {
    const e = pct(b.items.filter(d => d.answer === 'entailed').length / b.items.length);
    return { family, level, N: b.items.length, entailed: e, gates: [{ name: 'binary balance', value: e, limit: '47–53', pass: e >= 47 && e <= 53 }] };
}

function runDirectBatch(family: FamilyId, level: number, format: AnswerFormat, N: number, tag: string): Batch {
    const fam = DIRECT[family]!;
    const o = DEFAULT_ENGINE_OPTIONS;
    const pp = planningParams(level, o);
    const rng = new Rng(`audit:${tag}:${family}:${level}:${format}`);
    let st = emptySchedulerState();
    const items: Item[] = [];
    const times: number[] = [];
    for (let i = 0; i < N; i++) {
        const r = nextPlan(st, { family, format, params: pp, cueSpace: fam.cueSpace(level, format, o), lures: ['none'] }, rng);
        st = r.state;
        const t0 = performance.now();
        items.push(generate({ family, level, seed: `${tag}:${family}:${level}:${format}:${i}`, format, plan: r.plan }));
        times.push(performance.now() - t0);
    }
    return { items, times };
}

const binaryClasses = (items: readonly Item[]) => pct(items.filter(d => d.answer === 'entailed').length / Math.max(1, items.length));

function learnedGeneral(train: readonly Item[], test: readonly Item[]): number {
    const model = trainSoftmax(train.map(d => generalFeatures(d)), train.map(d => d.answer));
    return pct(accuracy(test.map(d => predictSoftmax(model, generalFeatures(d))), test.map(d => d.answer), 2));
}

export interface DirectReport {
    family: FamilyId;
    level: number;
    sub: string;
    N: number;
    values: Record<string, number>;
    reported: Record<string, number>;
    p50: number;
    p95: number;
    gates: Gate[];
}

/** «Сравнение графов», iso: balance, degree-sequence and edge-type-count bots ≤ 55 %, learned ≤ 57 %. */
export function auditGraphIso(level: number, train: Batch, test: Batch): DirectReport {
    const items = test.items;
    const truth = items.map(d => d.answer);
    const degSeq = items.map(d => ([...signatures(graphOf(d, 1))].sort().join() === [...signatures(graphOf(d, 2))].sort().join() ? 'entailed' : 'contradicted'));
    const count = (g: ReturnType<typeof graphOf>) => `${g.edges.filter(e => e.mut).length}/${g.edges.length}`;
    const typeCount = items.map(d => (count(graphOf(d, 1)) === count(graphOf(d, 2)) ? 'entailed' : 'contradicted'));
    const joint = items.map(d => (jointSignature(graphOf(d, 1)) === jointSignature(graphOf(d, 2)) ? 'entailed' : 'contradicted'));
    const balance = binaryClasses(items);
    const values = {
        balance,
        degreeSequence: pct(accuracy(degSeq, truth, 2)),
        edgeTypeCount: pct(accuracy(typeCount, truth, 2)),
        learned: learnedGeneral(train.items, items),
    };
    const p50 = quantile(test.times, 0.5);
    const p95 = quantile(test.times, 0.95);
    const gates: Gate[] = [
        { name: 'iso balance', value: balance, limit: '47–53', pass: balance >= 47 && balance <= 53 },
        { name: 'bot degreeSequence', value: values.degreeSequence, limit: '≤ 55', pass: values.degreeSequence <= 55 },
        { name: 'bot edgeTypeCount', value: values.edgeTypeCount, limit: '≤ 55', pass: values.edgeTypeCount <= 55 },
        { name: 'bot learned', value: values.learned, limit: '≤ 57', pass: values.learned <= 57 },
        { name: 'p95 ms', value: Math.round(p95 * 10) / 10, limit: '≤ 40', pass: p95 <= 40 },
    ];
    return { family: 'graph', level, sub: 'iso', N: items.length, values, reported: { jointDegree: pct(accuracy(joint, truth, 2)) }, p50, p95, gates };
}

/** «Сравнение графов», map: signature bot ≤ 1/(mean class size) + 5 pp; first-mention bot ≤ mean(1/n) + 5 pp. */
export function auditGraphMap(level: number, test: Batch): DirectReport {
    const items = test.items;
    let sigAcc = 0;
    let classSum = 0;
    let fmHits = 0;
    let chance = 0;
    for (const d of items) {
        const g1 = graphOf(d, 1);
        const sig = signatures(g1);
        const x = idx(d.query.args[0]);
        const c = sig.filter(s => s === sig[x]).length;
        sigAcc += 1 / c;
        classSum += c;
        chance += 1 / g1.n;
        const shown = d.displayOrder.map(i => d.premises[i]);
        const order = (net: number) => mentionOrder(shown.filter(r => r.params?.['net'] === net));
        const pick = order(2)[order(1).indexOf(d.query.args[0])];
        if (pick !== undefined && pick === d.correctOptionId) fmHits++;
    }
    const N = items.length;
    const signature = pct(sigAcc / N);
    const meanClass = Math.round((classSum / N) * 100) / 100;
    const firstMention = pct(fmHits / N);
    const chanceN = pct(chance / N);
    const p50 = quantile(test.times, 0.5);
    const p95 = quantile(test.times, 0.95);
    const gates: Gate[] = [
        { name: 'map bot firstMention', value: firstMention, limit: `≤ ${Math.round((chanceN + 5) * 10) / 10}`, pass: firstMention <= chanceN + 5 },
        { name: 'p95 ms', value: Math.round(p95 * 10) / 10, limit: '≤ 40', pass: p95 <= 40 },
    ];
    void level;
    return { family: 'graph', level, sub: 'map', N, values: { signature, firstMention, meanClass, chance: chanceN }, reported: {}, p50, p95, gates };
}

/** «Логические связки»: balance, operatorPrior ≤ 55 %, learned ≤ 57 %; firstOnly is reported (see V5_NOTES). */
export function auditBinaryFamily(level: number, train: Batch, test: Batch): DirectReport {
    const items = test.items;
    const truth = items.map(d => d.answer);
    const opKey = (d: DraftItem) => String(d.query.params?.['op']);
    const opPrior = trainPrior(train.items, opKey);
    const firstOnly = trainPrior(train.items, (d: DraftItem) => `${opKey(d)}|${(d as Item).parts?.[0].answer}`);
    const balance = binaryClasses(items);
    const relax = pct(items.filter(d => d.metrics.relaxations.length > 0).length / items.length);
    const values = {
        balance,
        operatorPrior: pct(accuracy(items.map(opPrior), truth, 2)),
        learned: learnedGeneral(train.items, items),
        relaxations: relax,
    };
    const p50 = quantile(test.times, 0.5);
    const p95 = quantile(test.times, 0.95);
    const gates: Gate[] = [
        { name: 'binary balance', value: balance, limit: '47–53', pass: balance >= 47 && balance <= 53 },
        { name: 'bot operatorPrior', value: values.operatorPrior, limit: '≤ 55', pass: values.operatorPrior <= 55 },
        { name: 'bot learned', value: values.learned, limit: '≤ 57', pass: values.learned <= 57 },
        { name: 'relaxations', value: relax, limit: '≤ 10', pass: relax <= 10 },
        { name: 'p95 ms', value: Math.round(p95 * 10) / 10, limit: '≤ 40', pass: p95 <= 40 },
    ];
    return { family: 'binary', level, sub: 'binary', N: items.length, values, reported: { firstOnly: pct(accuracy(items.map(firstOnly), truth, 2)) }, p50, p95, gates };
}
