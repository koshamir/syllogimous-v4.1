// «Логические связки» (spec §5.10). Two sub-items from the engine (different families when possible), each
// with a determined answer, at level max(1, L − 3); names do not overlap; premises shuffled together;
// instructions merged. Binary format only («Верно / Неверно»).
//
// Stratification: the result comes from the answer bag (balanced), the connective from an independent bag,
// and the sub-answer combination is chosen uniformly among the combinations giving that result — preferring
// mixed ones (TF/FT) where three are possible, which minimises what a single statement reveals (see
// docs/V5_NOTES.md «Отступления»: for И/ИЛИ-type connectives one sub-answer necessarily carries information).

import { Rng, streams } from '../core/rng';
import {
    Answer, BINARY_OPS, BinaryOp, DEFAULT_ENGINE_OPTIONS, EngineOptions, ENGINE_VERSION, FamilyId, GenerateSpec, Item, ItemPart,
    LureType, Plan, Premise,
} from '../core/types';
import { planningParams } from '../difficulty/ladder';
import { lureBagContents } from '../difficulty/scheduler';
import { discontinuity } from '../core/presentation';
import { BINARY_OP_NOTES, binaryConclusion } from '../render/ru/binary';
import { AnyPlugin, eid, idx } from './plugin';

export const BINARY_PART_FAMILIES: FamilyId[] = [
    'groups', 'orderNum', 'orderTime', 'linear', 'circular', 'dir2d', 'dir3dSpace', 'dir3dTime', 'syllogism', 'analogy',
];

export const OP_FN: Record<BinaryOp, (a: boolean, b: boolean) => boolean> = {
    and: (a, b) => a && b,
    nand: (a, b) => !(a && b),
    or: (a, b) => a || b,
    nor: (a, b) => !(a || b),
    xor: (a, b) => a !== b,
    xnor: (a, b) => a === b,
};

/** Sub-answer combinations producing `result`; where three exist, only the mixed ones (TF, FT). */
export function combosFor(op: BinaryOp, result: boolean): [boolean, boolean][] {
    const all = ([[true, true], [true, false], [false, true], [false, false]] as [boolean, boolean][]).filter(([a, b]) => OP_FN[op](a, b) === result);
    return all.length === 3 ? all.filter(([a, b]) => a !== b) : all;
}

export function binaryOps(o?: Partial<EngineOptions>): BinaryOp[] {
    return o?.binaryOps?.length ? o.binaryOps : BINARY_OPS;
}

export function binaryPartFamilies(o?: Partial<EngineOptions>, available?: readonly FamilyId[]): FamilyId[] {
    const ported = BINARY_PART_FAMILIES.filter(f => !available || available.includes(f));
    const en = o?.families?.filter(f => ported.includes(f)) ?? [];
    return en.length ? en : ported;
}

export type SubGenerator = (spec: GenerateSpec) => Item;

function subPlan(plugin: AnyPlugin, level: number, target: Answer, rng: Rng, o: EngineOptions): Plan {
    const pp = planningParams(level, o);
    const cue: Record<string, string> = {};
    for (const [k, vs] of Object.entries(plugin.cueSpace(pp, 'binary', o))) cue[k] = rng.pick(vs);
    const lures = lureBagContents(target, plugin.supportedLures(pp, o));
    return { target, cue, lure: rng.pick(lures) as LureType };
}

export function generateBinary(spec: GenerateSpec, seed: string, oIn: EngineOptions | undefined, gen: SubGenerator,
    pluginOf: (f: FamilyId) => AnyPlugin, available: readonly FamilyId[]): Item | null {
    const o = oIn ?? DEFAULT_ENGINE_OPTIONS;
    const rngs = streams(seed);
    const rng = rngs.semantic.fork('binary');
    const ops = binaryOps(o);
    const op = (ops.includes(spec.plan.cue['op'] as BinaryOp) ? spec.plan.cue['op'] : rng.pick(ops)) as BinaryOp;
    const result = spec.plan.target === 'entailed';
    const combo = rng.pick(combosFor(op, result));
    const fams = binaryPartFamilies(o, available);
    const f1 = rng.pick(fams);
    const rest = fams.filter(f => f !== f1);
    const f2 = rest.length ? rng.pick(rest) : f1;
    const subLevel = Math.max(1, spec.level - 3);
    const parts: Item[] = [];
    for (const [i, f] of [f1, f2].entries()) {
        const plugin = pluginOf(f);
        const target: Answer = combo[i] ? 'entailed' : 'contradicted';
        // a statement whose own plan had to be relaxed is regenerated with another seed (up to 3 times)
        let part: Item | null = null;
        for (let t = 0; t < 3 && (!part || part.metrics.relaxations.length); t++) {
            part = gen({
                family: f, level: subLevel, seed: `${seed}:p${i + 1}${t ? ':' + t : ''}`, format: 'binary',
                plan: subPlan(plugin, subLevel, target, rng.fork(`plan${i}:${t}`), o),
                prevNames: spec.prevNames, excludeNames: [...(spec.excludeNames ?? []), ...(parts[0]?.entities.map(e => e.name) ?? [])], options: o,
            });
        }
        parts.push(part!);
    }
    return merge(spec, rngs.presentation, op, result, parts);
}

function merge(spec: GenerateSpec, pres: Rng, op: BinaryOp, result: boolean, parts: Item[]): Item {
    const [a, b] = parts;
    const off = a.entities.length;
    const shift = (r: Premise): Premise => ({ ...r, args: r.args.map(x => eid(idx(x) + off)) });
    const premises: Premise[] = [...a.premises.map(r => ({ ...r })), ...b.premises.map(shift)];
    const textOf = (it: Item, i: number) => it.render.premises[it.displayOrder.indexOf(i)];
    const texts = [...a.premises.map((_, i) => textOf(a, i)), ...b.premises.map((_, i) => textOf(b, i))];
    const displayOrder = pres.shuffle(premises.map((_, i) => i));
    const entities = [...a.entities, ...b.entities.map(e => ({ id: eid(idx(e.id) + off), name: e.name }))];
    const conc = (it: Item) => (Array.isArray(it.render.conclusion) ? it.render.conclusion[0] : it.render.conclusion);
    const uniq = (xs: string[]) => [...new Set(xs)];
    const answer: Answer = result ? 'entailed' : 'contradicted';
    const supIdx = [...a.metrics.supportIdx, ...b.metrics.supportIdx.map(i => i + a.premises.length)].sort((x, y) => x - y);
    const partOf = (it: Item, offset: number, pOff: number): ItemPart => ({
        family: it.family, premiseIdx: it.premises.map((_, i) => i + pOff),
        query: { ...it.query, args: it.query.args.map(x => eid(idx(x) + offset)) },
        answer: it.answer, offset, n: it.entities.length, level: it.level, seed: it.seed,
    });
    const verdict = (it: Item) => (it.answer === 'entailed' ? 'верно' : 'неверно');
    const ex = (it: Item, k: number) => `Утверждение ${k} — ${verdict(it)}${it.explanation.model ? `: ${it.explanation.model}` : ''}`;
    const m = (k: keyof Item['metrics']) => (a.metrics[k] as number) + (b.metrics[k] as number);
    return {
        engineVersion: ENGINE_VERSION,
        family: 'binary',
        level: spec.level,
        seed: spec.seed,
        entities,
        premises,
        query: { kind: 'binop', args: [], params: { op, q: op } },
        answer,
        format: 'binary',
        correctOptionId: result ? 'true' : 'false',
        lure: 'none',
        metrics: {
            entities: entities.length,
            premises: premises.length,
            support: (a.metrics.support ?? 0) + (b.metrics.support ?? 0),
            supportIdx: supIdx,
            width: m('width'),
            arityMax: Math.max(a.metrics.arityMax, b.metrics.arityMax),
            convergent: a.metrics.convergent || b.metrics.convergent,
            nonLocal: a.metrics.nonLocal && b.metrics.nonLocal,
            modelsLog2: Math.min(16, m('modelsLog2')),
            distractors: m('distractors'),
            attachedDistractors: m('attachedDistractors'),
            negations: m('negations'),
            metas: m('metas'),
            discontinuity: discontinuity(premises, displayOrder),
            relaxations: [...a.metrics.relaxations.map(x => `1:${x}`), ...b.metrics.relaxations.map(x => `2:${x}`)],
        },
        displayOrder,
        render: {
            instructions: uniq([...a.render.instructions, ...b.render.instructions]),
            notes: uniq([...a.render.notes, ...b.render.notes]),
            premises: displayOrder.map(i => texts[i]),
            conclusion: binaryConclusion(op, conc(a), conc(b)),
        },
        explanation: {
            supportDisplayIdx: supIdx.map(i => displayOrder.indexOf(i)).sort((x, y) => x - y),
            model: `${ex(a, 1)}<br>${ex(b, 2)}`,
            lureNote: BINARY_OP_NOTES[op],
            tipId: 1,
        },
        fingerprint: `binary|${op}|${a.fingerprint}|${b.fingerprint}|${answer}`,
        target: a.target,
        parts: [partOf(a, 0, 0), partOf(b, off, a.premises.length)],
    };
}
