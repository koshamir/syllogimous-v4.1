// «Отображение структур» (spec §8): role correspondence between relational systems.
//   map (60 %)    — two systems, different vocabulary and names: «Кто во второй системе играет роль X?»
//   iso3 (20 %)   — three systems: which of 2 and 3 is structured like 1 (the other is a degree-preserving rewiring)
//   anchor (20 %) — a symmetric system; one correspondence is given, which breaks the symmetry; «Кому соответствует Y?»
// Correctness: the image is unique under all isomorphisms, including bijections of relation types.

import { Rng } from '../../core/rng';
import { Entity, NamePool } from '../../core/types';
import { pickNames } from '../../core/names';

export type MappingKind = 'map' | 'iso3' | 'anchor';

export interface TEdge { u: number; v: number; t: number }
export interface TGraph { n: number; sym: boolean[]; edges: TEdge[] }

interface Vocab { fwd: string; rev?: string }
/** «{a} … {b}» templates; `rev` — the same relation with the roles swapped (B is the grammatical subject). */
export const VOCAB: Vocab[] = [
    { fwd: '{a} пишет письма {b}', rev: '{b} получает письма от {a}' },
    { fwd: '{a} обучает {b}', rev: '{b} учится у {a}' },
    { fwd: '{a} охотится на {b}', rev: '{b} служит добычей для {a}' },
    { fwd: '{a} передаёт сигнал {b}', rev: '{b} получает сигнал от {a}' },
    { fwd: '{a} руководит {b}', rev: '{b} подчиняется {a}' },
];
export const SYM_VOCAB: Vocab[] = [
    { fwd: '{a} дружит с {b}' },
    { fwd: '{a} соседствует с {b}' },
    { fwd: '{a} работает вместе с {b}' },
];

export interface SystemRender { title: string; statements: string[]; names: string[] }

export interface MappingPuzzle {
    engineVersion: 'v5.0';
    mode: 'mapping';
    seed: string;
    level: number;
    kind: MappingKind;
    systems: SystemRender[];
    /** Entities of system 1, 2 (and 3). */
    entities: Entity[][];
    question: string;
    options: { id: string; label: string }[];
    correct: string;
    /** Russian explanation lines. */
    explanation: string[];
    /** Internal (tests, bots): the graphs and the statement order of each system. */
    graphs: TGraph[];
    order: number[][];
    wording: boolean[][];
    target: number;
    anchor?: { x: number; k: number };
    typePerm: number[];
    metrics: { n: number; edges: number; types: number; indirect: boolean; reverseShare: number; permuted: boolean };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// ---------------------------------------------------------------- typed isomorphism

/** Per-vertex signature (type-blind or under a type map): out/in per directed type, degree per symmetric type. */
export function signatures(g: TGraph, typeMap?: number[]): string[] {
    const T = g.sym.length;
    const s = Array.from({ length: g.n }, () => new Array(3 * T).fill(0));
    for (const e of g.edges) {
        const t = typeMap ? typeMap[e.t] : e.t;
        if (g.sym[e.t]) { s[e.u][3 * t + 2]++; s[e.v][3 * t + 2]++; } else { s[e.u][3 * t]++; s[e.v][3 * t + 1]++; }
    }
    return s.map(x => x.join('.'));
}

export function typeBlindSignature(g: TGraph): string[] {
    const s = Array.from({ length: g.n }, () => [0, 0, 0]);
    for (const e of g.edges) { if (g.sym[e.t]) { s[e.u][2]++; s[e.v][2]++; } else { s[e.u][0]++; s[e.v][1]++; } }
    return s.map(x => x.join('.'));
}

function codes(g: TGraph, typeMap: number[]): Int32Array {
    const A = new Int32Array(g.n * g.n);
    for (const e of g.edges) {
        const t = typeMap[e.t];
        if (g.sym[e.t]) { A[e.u * g.n + e.v] |= 1 << (2 * t); A[e.v * g.n + e.u] |= 1 << (2 * t); } else { A[e.u * g.n + e.v] |= 1 << (2 * t); A[e.v * g.n + e.u] |= 1 << (2 * t + 1); }
    }
    return A;
}

/** Valid relation-type bijections g1 → g2 (symmetric ↔ symmetric). */
export function typeMaps(g1: TGraph, g2: TGraph): number[][] {
    const T = g1.sym.length;
    if (T !== g2.sym.length) return [];
    const perms = T === 1 ? [[0]] : [[0, 1], [1, 0]];
    return perms.filter(p => p.every((t2, t1) => g1.sym[t1] === g2.sym[t2]));
}

/** All isomorphisms g1 → g2 over all valid type maps: [{ f, typeMap }]. */
export function isomorphisms(g1: TGraph, g2: TGraph, limit = Infinity, fixed?: { x: number; k: number }): { f: number[]; tm: number[] }[] {
    const out: { f: number[]; tm: number[] }[] = [];
    if (g1.n !== g2.n || g1.edges.length !== g2.edges.length) return out;
    const n = g1.n;
    const id = g2.sym.map((_, i) => i);
    const B = codes(g2, id);
    const s2 = signatures(g2);
    for (const tm of typeMaps(g1, g2)) {
        const A = codes(g1, tm);
        const s1 = signatures(g1, tm);
        if ([...s1].sort().join() !== [...s2].sort().join()) continue;
        const f = new Int32Array(n).fill(-1);
        const used = new Uint8Array(n);
        const go = (i: number): boolean => {
            if (i === n) { out.push({ f: Array.from(f), tm }); return out.length >= limit; }
            for (let c = 0; c < n; c++) {
                if (used[c] || s1[i] !== s2[c]) continue;
                if (fixed && i === fixed.x && c !== fixed.k) continue;
                let ok = true;
                for (let j = 0; j < i && ok; j++) if (A[i * n + j] !== B[c * n + f[j]] || A[j * n + i] !== B[f[j] * n + c]) ok = false;
                if (!ok) continue;
                f[i] = c; used[c] = 1;
                if (go(i + 1)) return true;
                f[i] = -1; used[c] = 0;
            }
            return false;
        };
        if (go(0)) break;
    }
    return out;
}

const linked = (g: TGraph, a: number, b: number) => g.edges.some(e => (e.u === a && e.v === b) || (e.u === b && e.v === a));

function connected(g: TGraph): boolean {
    const seen = new Set([0]);
    const st = [0];
    while (st.length) {
        const x = st.pop()!;
        for (const e of g.edges) {
            const y = e.u === x ? e.v : e.v === x ? e.u : -1;
            if (y >= 0 && !seen.has(y)) { seen.add(y); st.push(y); }
        }
    }
    return seen.size === g.n;
}

function randomGraph(rng: Rng, n: number, m: number, sym: boolean[]): TGraph | null {
    const g: TGraph = { n, sym, edges: [] };
    const add = (a: number, b: number) => {
        const t = rng.int(sym.length);
        g.edges.push(sym[t] ? { u: Math.min(a, b), v: Math.max(a, b), t } : rng.chance(0.5) ? { u: a, v: b, t } : { u: b, v: a, t });
    };
    const order = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    for (let i = 1; i < n; i++) add(order[i], order[rng.int(i)]);
    for (let k = 0; k < 300 && g.edges.length < m; k++) {
        const a = rng.int(n);
        const b = rng.int(n);
        if (a !== b && !linked(g, a, b)) add(a, b);
    }
    if (g.edges.length !== m) return null;
    if (!sym.every((_, t) => g.edges.some(e => e.t === t))) return null;
    return g;
}

export function permuteGraph(g: TGraph, pi: readonly number[], tm: readonly number[], sym2: boolean[]): TGraph {
    return {
        n: g.n,
        sym: sym2,
        edges: g.edges.map(e => {
            const u = pi[e.u];
            const v = pi[e.v];
            return g.sym[e.t] ? { u: Math.min(u, v), v: Math.max(u, v), t: tm[e.t] } : { u, v, t: tm[e.t] };
        }),
    };
}

/** A graph with a mirror symmetry: two copies of a random part, joined symmetrically (anchor items). */
function symmetricGraph(rng: Rng, n: number, sym: boolean[]): TGraph | null {
    const k = Math.floor(n / 2);
    const part = randomGraph(rng, k, k - 1 + rng.int(2), sym);
    if (!part || !connected(part)) return null;
    const edges: TEdge[] = [...part.edges, ...part.edges.map(e => ({ u: e.u + k, v: e.v + k, t: e.t }))];
    const t = rng.int(sym.length);
    const norm = (e: TEdge) => (sym[e.t] ? { u: Math.min(e.u, e.v), v: Math.max(e.u, e.v), t: e.t } : e);
    if (n % 2 === 1) {
        const c = 2 * k;
        const a = rng.int(k);
        edges.push(norm({ u: c, v: a, t }), norm({ u: c, v: a + k, t }));
    } else {
        const a = rng.int(k);
        let b = rng.int(k);
        if (sym[t]) b = a;
        else while (b === a && k > 1) b = rng.int(k);
        if (sym[t]) edges.push(norm({ u: a, v: a + k, t }));
        else edges.push({ u: a, v: b + k, t }, { u: a + k, v: b, t });
    }
    const g: TGraph = { n, sym, edges };
    const seen = new Set(edges.map(e => `${Math.min(e.u, e.v)}-${Math.max(e.u, e.v)}`));
    return seen.size === edges.length && connected(g) ? g : null;
}

/** Degree-preserving swap of two same-type edges with four distinct endpoints. */
function rewire(rng: Rng, g: TGraph): TGraph | null {
    const idx = rng.shuffle(g.edges.map((_, i) => i));
    for (const i of idx) for (const j of idx) {
        if (j <= i) continue;
        const a = g.edges[i];
        const b = g.edges[j];
        if (a.t !== b.t || new Set([a.u, a.v, b.u, b.v]).size < 4) continue;
        const x = { u: a.u, v: b.v, t: a.t };
        const y = { u: b.u, v: a.v, t: a.t };
        if (linked(g, x.u, x.v) || linked(g, y.u, y.v)) continue;
        const norm = (e: TEdge) => (g.sym[e.t] ? { u: Math.min(e.u, e.v), v: Math.max(e.u, e.v), t: e.t } : e);
        return { n: g.n, sym: g.sym, edges: [...g.edges.filter((_, k) => k !== i && k !== j), norm(x), norm(y)] };
    }
    return null;
}

// ---------------------------------------------------------------- generation

export interface MappingParams { n: number; m: number; types: number; pIndirect: number; pReverse: number; pPermute: number; confusable: number }

export function mappingParams(level: number, rng: Rng): MappingParams {
    const L = level;
    const n = clamp(4 + Math.floor(L / 3), 4, 8);
    const lo = n - 1;
    const hi = Math.floor(1.8 * n);
    const m = clamp(lo + Math.round((hi - lo) * clamp((L - 1) / 16, 0, 1)) + rng.int(3) - 1, lo, hi);
    return {
        n, m,
        types: L >= 8 ? 2 : 1,
        pIndirect: clamp((L - 3) / 10, 0, 0.8),
        pReverse: L >= 4 ? 0.5 : 0.1,
        pPermute: L >= 12 ? 0.5 : 0,
        confusable: L >= 10 ? 0.4 : 0,
    };
}

function render(rng: Rng, g: TGraph, names: string[], vocab: Vocab[], pReverse: number): { statements: string[]; order: number[]; wording: boolean[] } {
    const order = rng.shuffle(g.edges.map((_, i) => i));
    const wording = g.edges.map(() => rng.chance(pReverse));
    const S = (x: number) => `<span class="subject">${names[x]}</span>`;
    const statements = order.map(i => {
        const e = g.edges[i];
        const v = vocab[e.t];
        if (g.sym[e.t]) return (wording[i] ? v.fwd.replace('{a}', S(e.v)).replace('{b}', S(e.u)) : v.fwd.replace('{a}', S(e.u)).replace('{b}', S(e.v)));
        const tpl = wording[i] && v.rev ? v.rev : v.fwd;
        return tpl.replace('{a}', S(e.u)).replace('{b}', S(e.v));
    });
    return { statements, order, wording };
}

function pickVocab(rng: Rng, sym: boolean[], avoid: Vocab[]): Vocab[] {
    const used: Vocab[] = [];
    return sym.map(isSym => {
        const all = isSym ? SYM_VOCAB : VOCAB;
        const pool = all.filter(v => !avoid.includes(v) && !used.includes(v));
        const v = rng.pick(pool.length ? pool : all.filter(x => !used.includes(x)));
        used.push(v);
        return v;
    });
}

export function generateMapping(level: number, seed: string, opts: { kind?: MappingKind; namePool?: NamePool } = {}): MappingPuzzle {
    const rng0 = new Rng(`${seed}:mapping`);
    const kind: MappingKind = opts.kind ?? (() => { const u = rng0.float(); return u < 0.6 ? 'map' : u < 0.8 ? 'iso3' : 'anchor'; })();
    for (let attempt = 0; attempt < 200; attempt++) {
        const rng = rng0.fork(`a${attempt}`);
        const p = mappingParams(level, rng);
        const sym = Array.from({ length: p.types }, (_, t) => (p.types === 2 ? t === 1 && rng.chance(0.5) : rng.chance(0.2)));
        const g1 = kind === 'anchor' ? symmetricGraph(rng, p.n, sym) : randomGraph(rng, p.n, p.m, sym);
        if (!g1 || !connected(g1)) continue;
        const permuted = p.types === 2 && sym[0] === sym[1] && rng.chance(p.pPermute);
        const tm = permuted ? [1, 0] : sym.map((_, i) => i);
        const sym2 = tm.map((_, t2) => sym[tm.indexOf(t2)]);
        const pi = rng.shuffle(Array.from({ length: p.n }, (_, i) => i));
        const g2 = permuteGraph(g1, pi, tm, sym2);
        const sig = typeBlindSignature(g1);
        const classSize = (v: number) => sig.filter(s => s === sig[v]).length;
        if (kind === 'map') {
            const autos = isomorphisms(g1, g1);
            const rigid = Array.from({ length: p.n }, (_, v) => v).filter(v => autos.every(a => a.f[v] === v));
            const indirect = rng.chance(p.pIndirect);
            const cands = rigid.filter(v => (indirect ? classSize(v) >= 2 : classSize(v) === 1));
            if (!cands.length) continue;
            const x = rng.pick(cands);
            const images = new Set(isomorphisms(g1, g2).map(i => i.f[x]));
            if (images.size !== 1) continue;
            return finish(rng, seed, level, kind, p, [g1, g2], [sym, sym2], x, pi, tm, permuted, indirect, opts.namePool);
        }
        if (kind === 'anchor') {
            const autos = isomorphisms(g1, g1);
            if (autos.length < 2) continue;
            // anchor x and asked y: without the anchor y has ≥ 2 images; with x ↔ π(x) exactly one
            const orbitOf = (v: number) => new Set(autos.map(a => a.f[v]));
            const pairs: [number, number][] = [];
            for (let x = 0; x < p.n; x++) for (let y = 0; y < p.n; y++) {
                if (x === y || orbitOf(y).size < 2) continue;
                const fixed = autos.filter(a => a.f[x] === x);
                if (new Set(fixed.map(a => a.f[y])).size === 1) pairs.push([x, y]);
            }
            if (!pairs.length) continue;
            const [x, y] = rng.pick(pairs);
            const imgs = new Set(isomorphisms(g1, g2, Infinity, { x, k: pi[x] }).map(i => i.f[y]));
            if (imgs.size !== 1) continue;
            const puzzle = finish(rng, seed, level, kind, p, [g1, g2], [sym, sym2], y, pi, tm, permuted, classSize(y) >= 2, opts.namePool);
            puzzle.anchor = { x, k: pi[x] };
            const n1 = puzzle.systems[0].names;
            const n2 = puzzle.systems[1].names;
            puzzle.question = `Известно, что <span class="subject">${n1[x]}</span> соответствует <span class="subject">${n2[pi[x]]}</span>. Кому во второй системе соответствует <span class="subject">${n1[y]}</span>?`;
            return puzzle;
        }
        // iso3: one copy, one rewired lure with the same degree set
        let lure: TGraph | null = g1;
        for (let s = 0; s < 1 + rng.int(2) && lure; s++) lure = rewire(rng, lure);
        if (!lure || !connected(lure) || isomorphisms(g1, lure, 1).length) continue;
        const pi3 = rng.shuffle(Array.from({ length: p.n }, (_, i) => i));
        const g3 = permuteGraph(lure, pi3, tm, sym2);
        const swap = rng.chance(0.5);
        const graphs = swap ? [g1, g3, g2] : [g1, g2, g3];
        const puzzle = finish(rng, seed, level, kind, p, graphs, [sym, sym2, sym2], -1, pi, tm, permuted, false, opts.namePool);
        puzzle.correct = swap ? 's3' : 's2';
        return puzzle;
    }
    throw new Error('mapping generator failed ' + seed);
}

function finish(rng: Rng, seed: string, level: number, kind: MappingKind, p: MappingParams, graphs: TGraph[], syms: boolean[][],
    target: number, pi: number[], tm: number[], permuted: boolean, indirect: boolean, namePool: NamePool = 'cyrillic'): MappingPuzzle {
    const names: string[][] = [];
    const used: string[] = [];
    for (const g of graphs) {
        const nm = pickNames(rng.fork('names' + names.length), { n: g.n, pool: namePool, mode: 'byLevel', pConfusable: p.confusable, pCarryOver: 0, exclude: used }).names;
        names.push(nm);
        used.push(...nm);
    }
    const v1 = pickVocab(rng, syms[0], []);
    const v2 = pickVocab(rng, syms[1], v1);
    const renders = graphs.map((g, i) => render(rng, g, names[i], i === 0 ? v1 : v2, i === 0 ? 0.15 : p.pReverse));
    const titles = ['Система 1', 'Система 2', 'Система 3'];
    const S = (s: string) => `<span class="subject">${s}</span>`;
    let question = '';
    let options: { id: string; label: string }[] = [];
    let correct = '';
    const explanation: string[] = [];
    if (kind === 'iso3') {
        question = 'Какая из систем 2 и 3 устроена так же, как система 1?';
        options = [{ id: 's2', label: 'Система 2' }, { id: 's3', label: 'Система 3' }];
    } else {
        question = `Кто во второй системе играет ту же роль, что ${S(names[0][target])} в первой?`;
        options = names[1].map((nm, i) => ({ id: 'e' + i, label: nm })).sort((a, b) => a.label.localeCompare(b.label, 'ru'));
        correct = 'e' + pi[target];
        const iso = isomorphisms(graphs[0], graphs[1], 1)[0];
        explanation.push('Соответствие: ' + names[0].map((nm, v) => `${nm} ↔ ${names[1][iso.f[v]]}`).join(', ') + '.');
        if (permuted) explanation.push('Отношения переставлены: первое отношение второй системы соответствует второму отношению первой.');
        const sig = typeBlindSignature(graphs[0]);
        const twins = names[0].filter((_, v) => v !== target && sig[v] === sig[target]);
        const deg = (g: TGraph, v: number) => g.edges.filter(e => e.u === v || e.v === v).map(e => (e.u === v ? e.v : e.u));
        explanation.push(`Связи ${names[0][target]}: ${deg(graphs[0], target).map(x => names[0][x]).join(', ')}.`);
        if (twins.length) explanation.push(`У ${twins.join(', ')} столько же связей, но связаны они с другими участниками — поэтому роль у них другая.`);
    }
    if (kind === 'iso3') {
        explanation.push('Числа связей у всех трёх систем совпадают, но в одной из них связи переставлены: ни одно соответствие не сохраняет все связи.');
        const twin = isomorphisms(graphs[0], graphs[1], 1).length ? 1 : 2;
        const iso = isomorphisms(graphs[0], graphs[twin], 1)[0];
        if (iso) explanation.push(`Соответствие с системой ${twin + 1}: ` + names[0].map((nm, v) => `${nm} ↔ ${names[twin][iso.f[v]]}`).join(', ') + '.');
    }
    const revShare = renders.slice(1).reduce((s, r) => s + r.wording.filter(Boolean).length, 0) / Math.max(1, renders.slice(1).reduce((s, r) => s + r.wording.length, 0));
    return {
        engineVersion: 'v5.0', mode: 'mapping', seed, level, kind,
        systems: renders.map((r, i) => ({ title: titles[i], statements: r.statements, names: names[i] })),
        entities: names.map(nm => nm.map((name, i) => ({ id: 'e' + i, name }))),
        question, options, correct, explanation,
        graphs, order: renders.map(r => r.order), wording: renders.map(r => r.wording),
        target, typePerm: tm,
        metrics: { n: p.n, edges: p.m, types: syms[0].length, indirect, reverseShare: Math.round(revShare * 100) / 100, permuted },
    };
}

// ---------------------------------------------------------------- bots (audit)

/** The vertex of system 2 with the same first-mention rank as the target in system 1. */
export function firstMentionPick(p: MappingPuzzle): string | null {
    const ranks = (k: number) => {
        const out: number[] = [];
        const g = p.graphs[k];
        for (const i of p.order[k]) {
            const e = g.edges[i];
            const rev = p.wording[k][i];
            const args = g.sym[e.t] ? (rev ? [e.v, e.u] : [e.u, e.v]) : rev && !g.sym[e.t] ? [e.v, e.u] : [e.u, e.v];
            for (const a of args) if (!out.includes(a)) out.push(a);
        }
        return out;
    };
    const x = p.target;
    const r1 = ranks(0).indexOf(x);
    const pick = ranks(1)[r1];
    return pick === undefined ? null : 'e' + pick;
}

/** The entity standing at the same place (statement index, word position) in system 2 as the target's first appearance. */
export function wordPositionPick(p: MappingPuzzle): string | null {
    const g1 = p.graphs[0];
    const x = p.target;
    for (let s = 0; s < p.order[0].length; s++) {
        const e = g1.edges[p.order[0][s]];
        const rev = p.wording[0][p.order[0][s]];
        const args = rev ? [e.v, e.u] : [e.u, e.v];
        const pos = args.indexOf(x);
        if (pos < 0) continue;
        const g2 = p.graphs[1];
        const i2 = p.order[1][s];
        if (i2 === undefined) return null;
        const e2 = g2.edges[i2];
        const rev2 = p.wording[1][i2];
        return 'e' + (rev2 ? [e2.v, e2.u] : [e2.u, e2.v])[pos];
    }
    return null;
}

/** Expected accuracy of "a random vertex with the same (type-blind) signature". */
export function signatureBot(p: MappingPuzzle): number {
    const s1 = typeBlindSignature(p.graphs[0]);
    const s2 = typeBlindSignature(p.graphs[1]);
    const same = s2.filter(s => s === s1[p.target]).length;
    return same ? 1 / same : 0;
}

/** iso3: the system whose sorted degree sequence equals system 1 (ties → system 2). */
export function degreeSequencePick(p: MappingPuzzle): string {
    const key = (g: TGraph) => [...typeBlindSignature(g)].sort().join();
    return key(p.graphs[2]) === key(p.graphs[0]) && key(p.graphs[1]) !== key(p.graphs[0]) ? 's3' : 's2';
}
