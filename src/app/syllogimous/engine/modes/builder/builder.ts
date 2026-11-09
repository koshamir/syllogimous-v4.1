// «Конструктор» (spec §7): the answer is a constructed model. Generation:
// enumerate worlds → pick the true world → pool of true clues → bitsets → greedy information gain (random among the
// top three) until one world remains → minimise → add declared distractors → deduction trace → accept by level
// target (≤ 30 attempts, then relaxation recorded).

import { Rng } from '../../core/rng';
import { Entity } from '../../core/types';
import { pickNames } from '../../core/names';
import { forEachCombination } from '../../core/combinatorics';
import { Clue, ClueClass, PINNING, clueText, cluePool, factText, holds, GROUP_NAMES, COLOR_NAMES } from './clues';
import { Bits, WorldKind, WorldSet, allBits, and, andInto, bitsOf, firstBit, forEachBit, has, popcount, val, worldSet } from './worlds';

export type BuilderVariant = 'build' | 'mustBe' | 'count';


export interface TraceStep {
    /** Indices of the clues used (empty for a hypothesis step). */
    clues: number[];
    facts: { e: number; a: number; v: number }[];
    hypothesis: boolean;
    /** Russian text: «Шаг 1. Подсказки 2 и 5: ВОЛ стоит третьим слева». */
    text: string;
}

export interface BuilderMetrics {
    entryK: number;
    maxK: number;
    steps: number;
    caseSplit: boolean;
    ternaryShare: number;
    conditionalShare: number;
    worlds: number;
}

export interface BuilderClue extends Clue { text: string; distractor: boolean }

export interface BuilderPuzzle {
    engineVersion: 'v5.0';
    mode: 'builder';
    seed: string;
    level: number;
    variant: BuilderVariant;
    kind: WorldKind;
    n: number;
    entities: Entity[];
    groups?: { name: string; size: number }[];
    colors?: string[];
    clues: BuilderClue[];
    /** True world: values[e * attrs + a]. */
    solution: number[];
    attrs: number;
    /** Circle: entity 0 is pre-seated at seat 0 (rotations are equivalent). */
    fixed?: { e: number; v: number };
    mustBe?: { options: string[]; correct: number };
    count?: { options: string[]; correct: number; worlds: number };
    trace: TraceStep[];
    metrics: BuilderMetrics;
    relaxations: string[];
    instructions: string[];
}

interface LevelTarget {
    kinds: WorldKind[];
    n: [number, number];
    classes: ClueClass[];
    minTernary: number;
    minConditional: number;
    distractors: [number, number];
    maxK: [number, number];
    entryKMin: number;
    hypothesis: boolean;
    noPinning: boolean;
}

export function builderTarget(level: number): LevelTarget {
    const L = Math.floor(level);
    if (L <= 3) return { kinds: ['line'], n: [4, 5], classes: ['binary'], minTernary: 0, minConditional: 0, distractors: [0, 0], maxK: [1, 2], entryKMin: 1, hypothesis: false, noPinning: false };
    if (L <= 6) return { kinds: ['line'], n: [5, 6], classes: ['binary', 'ternary'], minTernary: 1, minConditional: 0, distractors: [0, 0], maxK: [2, 3], entryKMin: L >= 5 ? 2 : 1, hypothesis: false, noPinning: L >= 5 };
    if (L <= 10) return { kinds: ['line', 'circle', 'groups'], n: [6, 7], classes: ['binary', 'ternary', 'conditional', 'quant'], minTernary: 0, minConditional: 1, distractors: [1, 1], maxK: [3, 3], entryKMin: 1, hypothesis: false, noPinning: true };
    if (L <= 14) return { kinds: ['lineAttr', 'grid'], n: [4, 5], classes: ['binary', 'ternary', 'conditional', 'quant'], minTernary: 0, minConditional: 0, distractors: [1, 2], maxK: [3, 4], entryKMin: 2, hypothesis: false, noPinning: true };
    return { kinds: ['line', 'circle', 'groups', 'lineAttr', 'grid'], n: [5, 7], classes: ['binary', 'ternary', 'conditional', 'quant'], minTernary: 1, minConditional: 0, distractors: [1, 2], maxK: [3, 4], entryKMin: 2, hypothesis: true, noPinning: true };
}

const WEIGHT: Record<ClueClass, number> = { binary: 1, ternary: 1.4, conditional: 1.2, quant: 1.1 };

function worldFor(kind: WorldKind, rng: Rng, nLo: number, nHi: number): WorldSet {
    switch (kind) {
        case 'line': return worldSet('line', nLo + rng.int(nHi - nLo + 1));
        case 'circle': return worldSet('circle', Math.min(7, Math.max(5, nLo + rng.int(nHi - nLo + 1))));
        case 'groups': {
            const n = 6 + rng.int(3);
            const sizes = n === 6 ? (rng.chance(0.5) ? [3, 3] : [2, 2, 2]) : n === 7 ? [3, 2, 2] : [3, 3, 2];
            return worldSet('groups', n, { groups: sizes });
        }
        case 'lineAttr': {
            const n = 4 + rng.int(2);
            return worldSet('lineAttr', n, { colors: n === 4 ? 2 : 2 + rng.int(2) });
        }
        case 'grid': return worldSet('grid', 5);
    }
}

// ---------------------------------------------------------------- deduction trace

interface FactBits { fb: Bits[][][] }

function factBits(ws: WorldSet): FactBits {
    const fb: Bits[][][] = [];
    for (let e = 0; e < ws.n; e++) {
        fb.push([]);
        for (let a = 0; a < ws.attrs; a++) {
            fb[e].push([]);
            for (let v = 0; v < ws.domain[a]; v++) fb[e][a].push(bitsOf(ws, w => val(ws, w, e, a) === v));
        }
    }
    return { fb };
}

/** For every unknown (e, a): the value shared by all worlds in M, if any. */
function forcedFacts(ws: WorldSet, M: Bits, known: boolean[]): { e: number; a: number; v: number }[] {
    const out: { e: number; a: number; v: number }[] = [];
    if (!popcount(M)) return out;
    for (let e = 0; e < ws.n; e++) {
        for (let a = 0; a < ws.attrs; a++) {
            if (known[e * ws.attrs + a]) continue;
            let v0 = -1;
            let agree = true;
            forEachBit(M, w => {
                const v = val(ws, w, e, a);
                if (v0 < 0) v0 = v;
                else if (v !== v0) { agree = false; return true; }
                return false;
            });
            if (agree && v0 >= 0) out.push({ e, a, v: v0 });
        }
    }
    return out;
}

export function deductionTrace(ws: WorldSet, clueBits: Bits[], solution: number[], names: readonly string[], kMax = 4, fixed?: { e: number; v: number }):
    { steps: TraceStep[]; metrics: Omit<BuilderMetrics, 'ternaryShare' | 'conditionalShare' | 'worlds'> } {
    const { fb } = factBits(ws);
    const known = new Array(ws.n * ws.attrs).fill(false);
    let F = allBits(ws.W);
    if (fixed) { known[fixed.e * ws.attrs] = true; F = and(F, fb[fixed.e][0][fixed.v]); }
    const steps: TraceStep[] = [];
    let entryK = 0;
    let maxK = 0;
    let caseSplit = false;
    const m = clueBits.length;
    while (known.some(k => !k)) {
        let found: { S: number[]; facts: { e: number; a: number; v: number }[] } | null = null;
        for (let k = 1; k <= Math.min(kMax, m) && !found; k++) {
            forEachCombination(m, k, sel => {
                const M = F.slice();
                for (const i of sel) andInto(M, clueBits[i]);
                const facts = forcedFacts(ws, M, known);
                if (facts.length) { found = { S: sel.slice(), facts }; return true; }
                return false;
            });
        }
        if (found) {
            const f = found as { S: number[]; facts: { e: number; a: number; v: number }[] };
            const k = f.S.length;
            if (!steps.some(s => !s.hypothesis)) entryK = k;
            maxK = Math.max(maxK, k);
            for (const x of f.facts) { known[x.e * ws.attrs + x.a] = true; andInto(F, fb[x.e][x.a][x.v]); }
            const cl = f.S.map(i => i + 1);
            const lead = cl.length === 1 ? `Подсказка ${cl[0]}` : `Подсказки ${cl.slice(0, -1).join(', ')} и ${cl[cl.length - 1]}`;
            steps.push({
                clues: f.S, facts: f.facts, hypothesis: false,
                text: `Шаг ${steps.length + 1}. ${lead}${steps.length ? ' (с уже найденным)' : ''}: ${f.facts.map(x => factText(ws, x.e, x.a, x.v, names)).join('; ')}.`,
            });
        } else {
            // case analysis: the unknown with the fewest remaining options takes its true value
            const all = F.slice();
            for (const b of clueBits) andInto(all, b);
            let best: { e: number; a: number; opts: number } | null = null;
            for (let e = 0; e < ws.n; e++) for (let a = 0; a < ws.attrs; a++) {
                if (known[e * ws.attrs + a]) continue;
                let opts = 0;
                for (let v = 0; v < ws.domain[a]; v++) if (popcount(and(all, fb[e][a][v]))) opts++;
                if (!best || opts < best.opts) best = { e, a, opts };
            }
            const b = best!;
            const v = solution[b.e * ws.attrs + b.a];
            caseSplit = true;
            known[b.e * ws.attrs + b.a] = true;
            andInto(F, fb[b.e][b.a][v]);
            steps.push({
                clues: [], facts: [{ e: b.e, a: b.a, v }], hypothesis: true,
                text: `Шаг ${steps.length + 1}. Ни одна группа из ${kMax} подсказок не даёт нового факта — нужен перебор: из вариантов только «${factText(ws, b.e, b.a, v, names)}» не приводит к противоречию.`,
            });
        }
    }
    return { steps, metrics: { entryK, maxK, steps: steps.length, caseSplit } };
}

// ---------------------------------------------------------------- generation

/** Clue bitsets do not depend on the true world: cached per world set. */
const bitCache = new WeakMap<WorldSet, Map<string, Bits>>();

export function clueBits(ws: WorldSet, c: Clue): Bits {
    let m = bitCache.get(ws);
    if (!m) { m = new Map(); bitCache.set(ws, m); }
    const key = `${c.kind}:${c.args.join(',')}:${c.p ?? ''}:${c.p2 ?? ''}`;
    let b = m.get(key);
    if (!b) { b = bitsOf(ws, x => holds(ws, x, c)); m.set(key, b); }
    return b;
}

interface Draft { ws: WorldSet; w: number; clues: Clue[]; bits: Bits[]; distractors: number; M: Bits }

function greedy(ws: WorldSet, rng: Rng, pool: Clue[], poolBits: Bits[], stop: (count: number) => boolean, t: LevelTarget): { idx: number[]; M: Bits } | null {
    let M = allBits(ws.W);
    if (ws.kind === 'circle') M = and(M, bitsOf(ws, w => val(ws, w, 0) === 0));
    const chosen: number[] = [];
    let count = popcount(M);
    let tern = 0;
    let cond = 0;
    for (let guard = 0; guard < 40 && !stop(count); guard++) {
        const needT = tern < t.minTernary;
        const needC = cond < t.minConditional;
        const scored: { i: number; s: number }[] = [];
        for (let i = 0; i < pool.length; i++) {
            if (chosen.includes(i)) continue;
            const after = popcount(and(M, poolBits[i]));
            if (after === count || after === 0) continue;
            let s = Math.log2(count / after) * WEIGHT[pool[i].cls];
            if (needT && pool[i].cls === 'ternary') s *= 3;
            if (needC && pool[i].cls === 'conditional') s *= 3;
            scored.push({ i, s });
        }
        if (!scored.length) return null;
        scored.sort((a, b) => b.s - a.s);
        const pick = scored[rng.int(Math.min(3, scored.length))].i;
        chosen.push(pick);
        andInto(M, poolBits[pick]);
        count = popcount(M);
        if (pool[pick].cls === 'ternary') tern++;
        if (pool[pick].cls === 'conditional') cond++;
    }
    return stop(count) ? { idx: chosen, M } : null;
}

/** Remove clues that do not change the remaining world set. */
function minimise(ws: WorldSet, rng: Rng, idx: number[], poolBits: Bits[], base: Bits, keep: (i: number) => boolean): number[] {
    const target = (sel: number[]) => { const M = base.slice(); for (const i of sel) andInto(M, poolBits[i]); return M; };
    const ref = target(idx);
    const refCount = popcount(ref);
    let cur = idx.slice();
    for (const i of rng.shuffle(idx.slice())) {
        if (keep(i)) continue;
        const without = cur.filter(x => x !== i);
        if (popcount(target(without)) === refCount) cur = without;
    }
    return cur;
}

export function generateBuilder(level: number, seed: string, opts: { variant?: BuilderVariant; namePool?: 'cyrillic' | 'latin' | 'words' | 'emoji' } = {}): BuilderPuzzle {
    const rng0 = new Rng(`${seed}:builder`);
    const variant: BuilderVariant = opts.variant ?? (() => { const u = rng0.float(); return u < 0.7 ? 'build' : u < 0.85 ? 'mustBe' : 'count'; })();
    const t = builderTarget(level);
    let fallback: BuilderPuzzle | null = null;
    for (let attempt = 0; attempt < 30; attempt++) {
        const rng = rng0.fork(`a${attempt}`);
        const p = attemptPuzzle(level, seed, variant, t, rng, opts.namePool ?? 'cyrillic');
        if (!p) continue;
        const ok = accept(p, t);
        if (ok.length === 0) return p;
        if (!fallback || ok.length < fallback.relaxations.length) fallback = { ...p, relaxations: ok };
    }
    if (fallback) return fallback;
    // last resort: the simplest target
    for (let attempt = 0; attempt < 30; attempt++) {
        const p = attemptPuzzle(level, seed, variant, builderTarget(1), rng0.fork(`r${attempt}`), opts.namePool ?? 'cyrillic');
        if (p) return { ...p, relaxations: ['target'] };
    }
    throw new Error('builder generator failed ' + seed);
}

function accept(p: BuilderPuzzle, t: LevelTarget): string[] {
    if (p.variant !== 'build') return [];
    const m = p.metrics;
    const bad: string[] = [];
    if (m.maxK < t.maxK[0] || m.maxK > t.maxK[1]) bad.push('maxK');
    if (m.entryK < t.entryKMin) bad.push('entryK');
    if (m.caseSplit && !t.hypothesis) bad.push('hypothesis');
    return bad;
}

function attemptPuzzle(level: number, seed: string, variant: BuilderVariant, t: LevelTarget, rng: Rng, namePool: 'cyrillic' | 'latin' | 'words' | 'emoji'): BuilderPuzzle | null {
    const kind = rng.pick(t.kinds);
    const ws = worldFor(kind, rng, t.n[0], t.n[1]);
    let w = rng.int(ws.W);
    if (kind === 'circle') {
        // the true world has entity 0 on seat 0 (rotation symmetry)
        for (let g = 0; g < 1000 && val(ws, w, 0) !== 0; g++) w = rng.int(ws.W);
    }
    const allowed = (c: Clue) => t.classes.includes(c.cls) && !(t.noPinning && PINNING.has(c.kind)) && !(c.kind === 'pos' && level > 6);
    const pool = cluePool(ws, w, rng, allowed);
    const poolBits = pool.map(c => clueBits(ws, c));
    const base = kind === 'circle' ? bitsOf(ws, x => val(ws, x, 0) === 0) : allBits(ws.W);
    const wantCount = variant === 'count' ? 1 + rng.int(4) : 1;            // 1, 2, 3 or 4+ (4–6)
    const stop = variant === 'build' ? (c: number) => c === 1
        : variant === 'mustBe' ? (c: number) => c >= 2 && c <= 6
            : (c: number) => (wantCount < 4 ? c === wantCount : c >= 4 && c <= 6);
    const g = greedy(ws, rng, pool, poolBits, stop, t);
    if (!g) return null;
    if (!has(g.M, w)) return null;
    // one clue of each required class is protected from minimisation
    const protect = new Set<number>();
    const firstOf = (cls: ClueClass) => g.idx.find(i => pool[i].cls === cls);
    if (t.minTernary && firstOf('ternary') !== undefined) protect.add(firstOf('ternary')!);
    if (t.minConditional && firstOf('conditional') !== undefined) protect.add(firstOf('conditional')!);
    let idx = minimise(ws, rng, g.idx, poolBits, base, i => protect.has(i));
    // a protected clue must still be necessary: drop another clue it can replace, then minimise again
    const worldsWith = (sel: number[]) => { const M = base.slice(); for (const i of sel) andInto(M, poolBits[i]); return popcount(M); };
    const target = worldsWith(idx);
    for (const pr of protect) {
        if (worldsWith(idx.filter(i => i !== pr)) !== target) continue;
        const swap = idx.find(x => !protect.has(x) && worldsWith(idx.filter(i => i !== x)) === target);
        if (swap === undefined) return null;
        idx = minimise(ws, rng, idx.filter(i => i !== swap), poolBits, base, i => protect.has(i));
        if (worldsWith(idx.filter(i => i !== pr)) === target) return null;
    }
    if (idx.filter(i => pool[i].cls === 'ternary').length < t.minTernary) return null;
    if (idx.filter(i => pool[i].cls === 'conditional').length < t.minConditional) return null;
    // declared distractors: redundant true clues
    const nd = t.distractors[0] + rng.int(t.distractors[1] - t.distractors[0] + 1);
    // distractors must not make any core clue redundant (minimality holds for the core with the distractors present)
    const rest = rng.shuffle(pool.map((_, i) => i).filter(i => !idx.includes(i)));
    const distractors: number[] = [];
    for (const d of rest) {
        if (distractors.length >= nd) break;
        const sel = [...idx, ...distractors, d];
        const full = worldsWith(sel);
        if (idx.every(i => worldsWith(sel.filter(x => x !== i)) !== full)) distractors.push(d);
    }
    if (distractors.length < nd) return null;
    const order = rng.shuffle([...idx, ...distractors]);
    const M = base.slice();
    for (const i of order) andInto(M, poolBits[i]);
    const worlds = popcount(M);
    if (variant === 'build' && worlds !== 1) return null;

    const names = pickNames(rng.fork('names'), { n: ws.n, pool: namePool, mode: 'distinct', pConfusable: 0, pCarryOver: 0 }).names;
    const solution: number[] = [];
    for (let e = 0; e < ws.n; e++) for (let a = 0; a < ws.attrs; a++) solution.push(val(ws, w, e, a));
    const fixed = kind === 'circle' ? { e: 0, v: 0 } : undefined;
    const clues: BuilderClue[] = order.map(i => ({ ...pool[i], text: clueText(ws, pool[i], names), distractor: distractors.includes(i) }));
    const bits = order.map(i => poolBits[i]);
    const trace = variant === 'build' ? deductionTrace(ws, bits, solution, names, 4, fixed) : { steps: [], metrics: { entryK: 0, maxK: 0, steps: 0, caseSplit: false } };
    const share = (c: ClueClass) => Math.round((100 * clues.filter(x => x.cls === c).length) / clues.length) / 100;

    const puzzle: BuilderPuzzle = {
        engineVersion: 'v5.0', mode: 'builder', seed, level, variant, kind, n: ws.n,
        entities: names.map((name, i) => ({ id: 'e' + i, name })),
        groups: ws.groups?.map((size, i) => ({ name: GROUP_NAMES[i], size })),
        colors: ws.colors ? COLOR_NAMES.slice(0, ws.colors).map(c => c.short) : undefined,
        clues, solution, attrs: ws.attrs, fixed,
        trace: trace.steps,
        metrics: { ...trace.metrics, ternaryShare: share('ternary'), conditionalShare: share('conditional'), worlds },
        relaxations: [],
        instructions: instructionsFor(ws, names, fixed),
    };
    if (variant === 'mustBe') {
        const ms = mustBeOptions(ws, rng, pool, poolBits, M, order, names);
        if (!ms) return null;
        puzzle.mustBe = ms;
    }
    if (variant === 'count') {
        const opts = ['1', '2', '3', '4 и больше'];
        puzzle.count = { options: opts, correct: Math.min(4, worlds) - 1, worlds };
    }
    return puzzle;
}

/** Four statements: exactly one holds in every remaining world; the others fail in at least one. */
function mustBeOptions(ws: WorldSet, rng: Rng, pool: Clue[], poolBits: Bits[], M: Bits, used: number[], names: readonly string[]): { options: string[]; correct: number } | null {
    const count = popcount(M);
    const always: number[] = [];
    const sometimes: number[] = [];
    for (let i = 0; i < pool.length; i++) {
        if (used.includes(i)) continue;
        const k = popcount(and(M, poolBits[i]));
        if (k === count) always.push(i);
        else if (k > 0) sometimes.push(i);
    }
    // a statement true in some world of the full space but in none of M also works as a wrong option (pool clues
    // hold in the true world, so "sometimes" ones are the honest distractors here)
    if (!always.length || sometimes.length < 3) return null;
    const right = rng.pick(always);
    const wrong = rng.shuffle(sometimes.slice()).slice(0, 3);
    const all = rng.shuffle([right, ...wrong]);
    return { options: all.map(i => clueText(ws, pool[i], names)), correct: all.indexOf(right) };
}

function instructionsFor(ws: WorldSet, names: readonly string[], fixed?: { e: number; v: number }): string[] {
    const subj = (s: string) => `<span class="subject">${s}</span>`;
    const list = names.slice().sort((a, b) => a.localeCompare(b, 'ru')).map(subj).join(', ');
    const out = [`Участники: ${list} (порядок в списке — алфавитный).`];
    switch (ws.kind) {
        case 'line': out.push(`Все стоят в один ряд из ${ws.n} мест; «левее» — с точки зрения наблюдателя.`); break;
        case 'lineAttr': out.push(`Все стоят в один ряд из ${ws.n} мест, у каждого шапка одного из цветов: ${COLOR_NAMES.slice(0, ws.colors).map(c => c.short).join(', ')} (каждый цвет есть хотя бы у одного).`); break;
        case 'circle': out.push(`Все сидят за круглым столом на ${ws.n} местах лицом к центру; «слева от Х» — с точки зрения Х. Места пронумерованы по часовой стрелке, ${subj(names[fixed!.e])} сидит на месте 1.`); break;
        case 'groups': out.push(`Участники разделены на группы: ${ws.groups!.map((s, i) => `${GROUP_NAMES[i]} — ${s}`).join(', ')}.`); break;
        case 'grid': out.push('Поле 3×3: ряды сверху вниз, столбцы слева направо; часть клеток пуста, в клетке не больше одного участника.'); break;
    }
    return out;
}

// ---------------------------------------------------------------- checking and the audit bot

/** placement[e * attrs + a] (−1 = not placed). */
export function checkBuilder(p: BuilderPuzzle, placement: readonly number[]): { correct: number; total: number; wrong: number[]; violated: number[] } {
    const total = p.n;
    let correct = 0;
    const wrong: number[] = [];
    for (let e = 0; e < p.n; e++) {
        let ok = true;
        for (let a = 0; a < p.attrs; a++) if (placement[e * p.attrs + a] !== p.solution[e * p.attrs + a]) ok = false;
        if (ok) correct++; else wrong.push(e);
    }
    const ws = wsOf(p);
    const violated: number[] = [];
    const complete = placement.every(v => v >= 0);
    if (complete) {
        // evaluate clues on the placement as a world: find it among the enumerated worlds
        const w = findWorld(ws, placement);
        p.clues.forEach((c, i) => { if (w < 0 || !holds(ws, w, c)) violated.push(i); });
    }
    return { correct, total, wrong, violated };
}

export function wsOf(p: Pick<BuilderPuzzle, 'kind' | 'n' | 'groups' | 'colors'>): WorldSet {
    return worldSet(p.kind, p.n, { groups: p.groups?.map(g => g.size), colors: p.colors?.length });
}

function findWorld(ws: WorldSet, placement: readonly number[]): number {
    for (let w = 0; w < ws.W; w++) {
        let ok = true;
        for (let i = 0; i < ws.n * ws.attrs && ok; i++) if (ws.values[w * ws.n * ws.attrs + i] !== placement[i]) ok = false;
        if (ok) return w;
    }
    return -1;
}

/**
 * "Clues one at a time" bot (spec §7 acceptance): filters each entity's domain by every clue separately (a value
 * survives if some world of that clue alone has it), then guesses uniformly among the worlds left by the domains.
 * Returns the probability of solving.
 */
export function oneAtATimeBot(p: BuilderPuzzle): number {
    const ws = wsOf(p);
    const bits = p.clues.map(c => clueBits(ws, c));
    const dom: boolean[][] = [];
    for (let e = 0; e < ws.n; e++) for (let a = 0; a < ws.attrs; a++) {
        const d = new Array(ws.domain[a]).fill(true);
        for (let v = 0; v < ws.domain[a]; v++) {
            for (const b of bits) {
                let any = false;
                forEachBit(b, w => { if (val(ws, w, e, a) === v) { any = true; return true; } return false; });
                if (!any) { d[v] = false; break; }
            }
        }
        dom.push(d);
    }
    if (p.fixed) dom[p.fixed.e * ws.attrs] = dom[p.fixed.e * ws.attrs].map((_, v) => v === p.fixed!.v);
    let left = 0;
    for (let w = 0; w < ws.W; w++) {
        let ok = true;
        for (let e = 0; e < ws.n && ok; e++) for (let a = 0; a < ws.attrs && ok; a++) if (!dom[e * ws.attrs + a][val(ws, w, e, a)]) ok = false;
        if (ok) left++;
    }
    return left ? 1 / left : 0;
}

export { firstBit };
