// Generation pipeline (spec §4.3): target answer and cue profile first, then construction, then exact verification.

import { Rng, streams } from './core/rng';
import {
    Answer, AnswerFormat, DEFAULT_ENGINE_OPTIONS, DraftItem, ENGINE_VERSION, EngineOptions, FamilyId, GenerateSpec, Item,
    LevelParams, LureType, Plan, Premise, Query,
} from './core/types';
import { classify } from './core/solve';
import { isConvergent, minimalSupport, myopicAnswer } from './core/support';
import { pickNames } from './core/names';
import { displayOrder } from './core/presentation';
import { computeMetrics } from './core/metrics';
import { fingerprint } from './core/fingerprint';
import { ladder } from './difficulty/ladder';
import { buildExplanation } from './explain/explain';
import { AnyPlugin, ChoiceConstruction, Construction, idx } from './families/plugin';
import { groupsPlugin } from './families/groups';
import { linearPlugin, orderNumPlugin, orderTimePlugin } from './families/order';
import { dir2dPlugin, dir3dSpacePlugin, dir3dTimePlugin } from './families/direction';
import { syllogismPlugin } from './families/syllogism';
import { circularPlugin } from './families/circular';
import { choiceDegreePick, choiceFirstMentionPick } from './families/line';
import { analogyPlugin } from './families/analogy';
import { groups3Plugin } from './families/groups3';
import { conditionalPlugin } from './families/conditional';
import { hierarchyPlugin } from './families/hierarchy';
import { perspectivePlugin } from './families/perspective';
import { generateGraph } from './families/graph';
import { binaryOps, generateBinary } from './families/binary';

export const PLUGINS: Partial<Record<FamilyId, AnyPlugin>> = {
    groups: groupsPlugin as AnyPlugin,
    orderNum: orderNumPlugin as AnyPlugin,
    orderTime: orderTimePlugin as AnyPlugin,
    linear: linearPlugin as AnyPlugin,
    dir2d: dir2dPlugin as AnyPlugin,
    dir3dSpace: dir3dSpacePlugin as AnyPlugin,
    dir3dTime: dir3dTimePlugin as AnyPlugin,
    syllogism: syllogismPlugin as AnyPlugin,
    circular: circularPlugin as AnyPlugin,
    analogy: analogyPlugin as AnyPlugin,
    groups3: groups3Plugin as AnyPlugin,
    conditional: conditionalPlugin as AnyPlugin,
    hierarchy: hierarchyPlugin as AnyPlugin,
    perspective: perspectivePlugin as AnyPlugin,
};

/** Families that are not constraint problems with a ternary answer: they build whole items themselves. */
export interface DirectFamily {
    id: FamilyId;
    formats: AnswerFormat[];
    cueSpace(level: number, format: AnswerFormat, o?: Partial<EngineOptions>): Record<string, string[]>;
    generate(spec: GenerateSpec, seed: string, o: EngineOptions): Item | null;
}

export const DIRECT: Partial<Record<FamilyId, DirectFamily>> = {
    graph: { id: 'graph', formats: ['binary', 'choice'], cueSpace: () => ({}), generate: (spec, seed, o) => generateGraph(spec, seed, o) },
    binary: {
        id: 'binary',
        formats: ['binary'],
        cueSpace: (_l, _f, o) => ({ op: binaryOps(o) }),
        generate: (spec, seed, o) => generateBinary(spec, seed, o, generate, pluginFor, Object.keys(PLUGINS) as FamilyId[]),
    },
};

export const ENGINE_FAMILIES = [...Object.keys(PLUGINS), ...Object.keys(DIRECT)] as FamilyId[];

export const isDirect = (f: FamilyId) => !!DIRECT[f];

/** Answer formats a family supports. */
export function familyFormats(f: FamilyId): AnswerFormat[] {
    return DIRECT[f]?.formats ?? pluginFor(f).formats;
}

export function pluginFor(family: FamilyId): AnyPlugin {
    const p = PLUGINS[family];
    if (!p) throw new Error(`Family ${family} is not ported to the v5 engine`);
    return p;
}

export const MAX_ATTEMPTS = 60;

/** Lure matching: for "Contradicts", none/reversal/nearMiss all mean "no surface lure" (the specific kind follows from the query kind). */
export function lureMatches(planned: LureType, actual: LureType, answer: Answer, uncontrolled: readonly LureType[] = []): boolean {
    if (planned === 'surface' || actual === 'surface') return planned === actual;
    if (uncontrolled.includes(actual) || uncontrolled.includes(planned)) return true;
    if (answer === 'contradicted') return true;
    return planned === actual;
}

interface Stage { lure: boolean; cue: 'full' | 'kind' | 'none'; conv: boolean; widen: number; attempts: number }

const STAGES: Stage[] = [
    { lure: true, cue: 'full', conv: true, widen: 0, attempts: MAX_ATTEMPTS / 2 },
    { lure: false, cue: 'full', conv: true, widen: 0, attempts: MAX_ATTEMPTS / 4 },
    { lure: false, cue: 'kind', conv: true, widen: 0, attempts: MAX_ATTEMPTS / 4 },
    { lure: false, cue: 'none', conv: false, widen: 0, attempts: MAX_ATTEMPTS / 2 },
    { lure: false, cue: 'none', conv: false, widen: 1, attempts: MAX_ATTEMPTS / 2 },
];

export function generate(spec: GenerateSpec): Item {
    const o: EngineOptions = { ...DEFAULT_ENGINE_OPTIONS, ...spec.options };
    const direct = DIRECT[spec.family];
    if (direct) {
        for (const suffix of ['', ':r1', ':r2', ':r3', ':r4', ':r5']) {
            const item = direct.generate(spec, spec.seed + suffix, o);
            if (item) return item;
        }
        throw new Error(`v5 generator failed: ${spec.family} L${spec.level} ${spec.format} seed=${spec.seed}`);
    }
    const plugin = pluginFor(spec.family);
    for (const suffix of ['', ':r1', ':r2', ':r3', ':r4', ':r5']) {
        const item = spec.format === 'choice'
            ? tryChoice(plugin, spec, spec.seed + suffix, o)
            : tryGenerate(plugin, spec, spec.seed + suffix, o);
        if (item) return item;
    }
    throw new Error(`v5 generator failed: ${spec.family} L${spec.level} ${spec.format} ${spec.plan.target} seed=${spec.seed}`);
}

/** Stratification keys that define the item type (not bot opinions): never relaxed. */
const STRUCTURAL_CUE = ['base', 'w2', 'op'];

function cueFor(plan: Plan, mode: Stage['cue']): Plan {
    if (mode === 'full') return plan;
    const cue: Record<string, string> = {};
    for (const k of STRUCTURAL_CUE) if (plan.cue[k]) cue[k] = plan.cue[k];
    if (mode === 'kind' && plan.cue['qkind']) cue['qkind'] = plan.cue['qkind'];
    // syllogisms: keep the conclusion quantifier of the cell, drop atmosphere / matching
    if (mode === 'kind' && plan.cue['cell']) cue['cell'] = `${plan.cue['cell'].split('|')[0]}|*|*`;
    return { ...plan, cue };
}

function tryGenerate(plugin: AnyPlugin, spec: GenerateSpec, seed: string, o: EngineOptions): Item | null {
    const rngs = streams(seed);
    const base = ladder(spec.level, rngs.semantic.fork('ladder'), o);
    let attempt = 0;
    for (const st of STAGES) {
        for (let t = 0; t < st.attempts; t++, attempt++) {
            const plan = cueFor(spec.plan, st.cue);
            const p0 = plugin.adjust(base, o, plan);
            const p: LevelParams = st.widen
                ? { ...p0, sigmaMin: Math.max(1, p0.sigmaMin - st.widen), sigmaMax: p0.sigmaMax + st.widen }
                : p0;
            const sem = rngs.semantic.fork(`a${attempt}`);
            let built: Construction<unknown> | null;
            try { built = plugin.construct(sem, st.conv ? p : { ...p, requireConvergent: false }, plan, o); } catch { built = null; }
            if (!built) continue;
            const c = built;
            for (const q of c.queries) {
                if (plugin.statedDirectly(q, c.premises)) continue;
                let a: Answer;
                try { a = classify(plugin, c.premises, q, c.n); } catch { continue; }
                if (a !== spec.plan.target) continue;
                let S: number[] | null = null;
                if (a !== 'undetermined') {
                    const sup = minimalSupport(plugin, c.premises, q, a, p.sigmaMax, c.n);
                    if (!sup || sup.size < p.sigmaMin) continue;
                    if (p.requireNonLocal && myopicAnswer(plugin, c.premises, q, c.n) !== 'undetermined') continue;
                    const conv = isConvergent(sup.idx.map(i => c.premises[i]), q);
                    if (st.conv && p.requireConvergent && !conv) continue;
                    S = sup.idx;
                }
                // display order first: the "first model that comes to mind" is built in reading order
                const order = displayOrder(rngs.presentation.fork(`order:${attempt}`), c.premises, p0.order, S ?? []);
                const lure = plugin.lureOf({ premises: order.map(i => c.premises[i]), query: q, answer: a, n: c.n });
                const lureOk = lureMatches(spec.plan.lure, lure, a, plugin.uncontrolledLures);
                if (st.lure && !lureOk) continue;
                const cueOk = plugin.cueMatches(spec.plan.cue, c.premises, q, c.n);
                if (st.cue === 'full' && !cueOk) continue;
                const relax: string[] = [];
                if (!cueOk) relax.push('cue');
                if (!lureOk) relax.push('lure');
                if (S && p0.requireConvergent && !isConvergent(S.map(i => c.premises[i]), q)) relax.push('convergent');
                if (S && (S.length < p0.sigmaMin || S.length > p0.sigmaMax)) relax.push('sigma');
                return finalize(plugin, spec, o, p0, rngs.presentation, c.premises, q, a, lure, S, relax, c.n, undefined, order);
            }
        }
    }
    return null;
}

function finalize(
    plugin: AnyPlugin, spec: GenerateSpec, o: EngineOptions, p: LevelParams, pres: Rng,
    premises: Premise[], query: Query, answer: Answer, lure: LureType, S: number[] | null, relax: string[], n: number,
    choice?: ChoiceConstruction, fixedOrder?: number[],
): Item {
    const names = pickNames(pres.fork('names'), {
        n, pool: o.namePool, mode: o.nameMode, pConfusable: p.confusableNames, pCarryOver: p.carryOverNames, prevNames: spec.prevNames,
        exclude: spec.excludeNames,
    }).names;
    const d: DraftItem = {
        engineVersion: ENGINE_VERSION,
        family: spec.family,
        level: spec.level,
        seed: spec.seed,
        entities: names.map((name, i) => ({ id: 'e' + i, name })),
        premises: premises.map(r => ({ ...r })),
        query: { ...query },
        answer,
        format: spec.format,
        lure,
        metrics: undefined as unknown as DraftItem['metrics'],
        displayOrder: fixedOrder ?? displayOrder(pres.fork('order'), premises, p.order, S ?? []),
    };
    plugin.decorate(d, pres.fork('deco'), p);
    d.metrics = computeMetrics({
        plugin, premises: d.premises, query: d.query, answer, support: S, n,
        displayOrder: d.displayOrder, relaxations: relax, queryInverted: !!d.query.params?.['inv'],
    });
    if (choice) {
        d.options = [...d.entities.map(e => ({ id: e.id, label: e.name })), { id: 'none', label: 'Нельзя определить' }];
        d.correctOptionId = choice.correctOptionId;
    } else if (spec.format === 'binary') {
        d.correctOptionId = answer === 'entailed' ? 'true' : 'false';
    }
    const choicePos = choice ? choicePosition(spec.family, Number(choice.query.params?.['k']), n) : undefined;
    return {
        ...d,
        render: plugin.render(d, pres.fork('render')),
        explanation: buildExplanation(plugin, d, choicePos),
        fingerprint: fingerprint(spec.family, d.premises, d.query, answer),
        target: { level: Math.floor(p.level * 100) / 100, sigmaMin: p.sigmaMin, sigmaMax: p.sigmaMax },
    };
}

export function choicePosition(family: FamilyId, k: number, n: number): number {
    return family === 'orderNum' ? n - k : k - 1;
}

/** Choice format: «Кто k-й…?». Bots' hits are matched to independent coins with P = 1/(options). */
function tryChoice(plugin: AnyPlugin, spec: GenerateSpec, seed: string, o: EngineOptions): Item | null {
    if (!plugin.constructChoice) throw new Error(`${spec.family} has no choice format`);
    const rngs = streams(seed);
    const base = ladder(spec.level, rngs.semantic.fork('ladder'), o);
    const p = plugin.adjust(base, o, spec.plan);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const strict = attempt < MAX_ATTEMPTS * 0.75;
        const c = plugin.constructChoice(rngs.semantic.fork(`c${attempt}`), p, spec.plan, o);
        if (!c || c.answer !== spec.plan.target) continue;
        const nOpt = c.n + 1;
        const wantDeg = Number(spec.plan.cue['degU'] ?? 1) < 1 / nOpt;
        const wantFm = Number(spec.plan.cue['fmU'] ?? 1) < 1 / nOpt;
        for (let t = 0; t < 12; t++) {
            const order = displayOrder(rngs.presentation.fork(`co${attempt}:${t}`), c.premises, 'random', []);
            const probe = { premises: c.premises, displayOrder: order, query: c.query, entities: Array.from({ length: c.n }, (_, i) => ({ id: 'e' + i, name: '' })) } as unknown as DraftItem;
            const degHit = choiceDegreePick({ id: spec.family as 'orderNum', winsHigh: spec.family !== 'linear' }, probe) === c.correctOptionId;
            const fmHit = choiceFirstMentionPick(probe) === c.correctOptionId;
            const ok = c.answer === 'undetermined' || (degHit === wantDeg && fmHit === wantFm);
            if (!ok && strict) continue;
            return finalize(plugin, spec, o, p, rngs.presentation, c.premises, c.query, c.answer, 'none', null, ok ? [] : ['cue'], c.n, c, order);
        }
    }
    return null;
}

export { idx };
