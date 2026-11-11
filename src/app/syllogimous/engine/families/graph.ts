// «Сравнение графов» v2 (spec §5.8). Two subtypes, alternating:
//   iso (binary) — «Проверь, одинаково ли устроены две сети». Positives: renaming + permutation + reverse
//                  wordings. Negatives: degree-preserving rewiring (u1→v1, u2→v2 ⇒ u1→v2, u2→v1), 1–3 times,
//                  exact non-isomorphism; signature multisets (in, out, mutual) and edge-type counts match.
//   map (choice) — «Найди во второй сети участника с той же ролью, что X в первой». The image of X is unique
//                  under all isomorphisms; from L ≥ 6 X's degree signature is shared by another vertex.
// No meta-relations. The world is not a constraint problem, so the family generates items directly.

import { Rng, streams } from '../core/rng';
import { Answer, DEFAULT_ENGINE_OPTIONS, EngineOptions, ENGINE_VERSION, GenerateSpec, Item, Premise } from '../core/types';
import { pickNames } from '../core/names';
import { discontinuity } from '../core/presentation';
import { describeGraphMap, graphQuestion, graphSentence, GRAPH_INSTRUCTIONS } from '../render/ru/graph';
import { eid, idx } from './plugin';

export interface GEdge { u: number; v: number; mut: boolean }
export interface Graph { n: number; edges: GEdge[] }

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Adjacency code: A[u*n+v] = 1 for u→v, 2 for a mutual link, 0 otherwise. */
export function adjacency(g: Graph): Int8Array {
    const A = new Int8Array(g.n * g.n);
    for (const e of g.edges) {
        if (e.mut) { A[e.u * g.n + e.v] = 2; A[e.v * g.n + e.u] = 2; } else A[e.u * g.n + e.v] = 1;
    }
    return A;
}

/** Degree signature «in.out.mutual» of every vertex. */
export function signatures(g: Graph): string[] {
    const ins = new Array(g.n).fill(0);
    const outs = new Array(g.n).fill(0);
    const muts = new Array(g.n).fill(0);
    for (const e of g.edges) {
        if (e.mut) { muts[e.u]++; muts[e.v]++; } else { outs[e.u]++; ins[e.v]++; }
    }
    return Array.from({ length: g.n }, (_, i) => `${ins[i]}.${outs[i]}.${muts[i]}`);
}

const linked = (g: Graph, a: number, b: number) => g.edges.some(e => (e.u === a && e.v === b) || (e.u === b && e.v === a));

export function weaklyConnected(g: Graph): boolean {
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

/**
 * All isomorphisms g1 → g2 (as arrays f with f[v1] = v2), by backtracking with signature pruning.
 * `limit` stops early. Exact for any n (used with n ≤ 8).
 */
export function isomorphisms(g1: Graph, g2: Graph, limit = Infinity): number[][] {
    if (g1.n !== g2.n || g1.edges.length !== g2.edges.length) return [];
    const n = g1.n;
    const A = adjacency(g1);
    const B = adjacency(g2);
    const s1 = signatures(g1);
    const s2 = signatures(g2);
    if ([...s1].sort().join() !== [...s2].sort().join()) return [];
    const f = new Int32Array(n).fill(-1);
    const used = new Uint8Array(n);
    const out: number[][] = [];
    const go = (i: number): boolean => {
        if (i === n) { out.push(Array.from(f)); return out.length >= limit; }
        for (let c = 0; c < n; c++) {
            if (used[c] || s1[i] !== s2[c]) continue;
            let ok = true;
            for (let j = 0; j < i && ok; j++) {
                if (A[i * n + j] !== B[c * n + f[j]] || A[j * n + i] !== B[f[j] * n + c]) ok = false;
            }
            if (!ok) continue;
            f[i] = c; used[c] = 1;
            if (go(i + 1)) return true;
            f[i] = -1; used[c] = 0;
        }
        return false;
    };
    go(0);
    return out;
}

export const isomorphic = (g1: Graph, g2: Graph) => isomorphisms(g1, g2, 1).length > 0;

function randomGraph(rng: Rng, n: number, m: number, pMut: number): Graph | null {
    const edges: GEdge[] = [];
    const order = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    const add = (a: number, b: number) => {
        const mut = rng.chance(pMut);
        edges.push(mut ? { u: Math.min(a, b), v: Math.max(a, b), mut } : rng.chance(0.5) ? { u: a, v: b, mut } : { u: b, v: a, mut });
    };
    for (let i = 1; i < n; i++) add(order[i], order[rng.int(i)]);
    const g: Graph = { n, edges };
    for (let t = 0; t < 200 && edges.length < m; t++) {
        const a = rng.int(n);
        const b = rng.int(n);
        if (a !== b && !linked(g, a, b)) add(a, b);
    }
    return edges.length === m ? g : null;
}

/** One degree-preserving swap; `joint` = keep the multiset of endpoint-signature pairs too. */
function rewireOnce(rng: Rng, g: Graph, joint: boolean): Graph | null {
    const sig = signatures(g);
    const idxs = rng.shuffle(g.edges.map((_, i) => i));
    for (const i of idxs) {
        for (const j of idxs) {
            if (j <= i) continue;
            const e1 = g.edges[i];
            const e2 = g.edges[j];
            if (e1.mut !== e2.mut) continue;
            const cands: [GEdge, GEdge][] = [[{ u: e1.u, v: e2.v, mut: e1.mut }, { u: e2.u, v: e1.v, mut: e1.mut }]];
            if (e1.mut) cands.push([{ u: e1.u, v: e2.u, mut: true }, { u: e1.v, v: e2.v, mut: true }]);
            for (const [a, b] of cands) {
                if (new Set([e1.u, e1.v, e2.u, e2.v]).size < 4) continue;
                if (linked(g, a.u, a.v) || linked(g, b.u, b.v)) continue;
                if (joint) {
                    const pair = (e: GEdge) => e.mut ? [sig[e.u], sig[e.v]].sort().join('|') : `${sig[e.u]}>${sig[e.v]}`;
                    const before = [pair(e1), pair(e2)].sort().join();
                    const after = [pair(a), pair(b)].sort().join();
                    if (before !== after) continue;
                }
                const edges = g.edges.filter((_, k) => k !== i && k !== j);
                const norm = (e: GEdge): GEdge => (e.mut ? { u: Math.min(e.u, e.v), v: Math.max(e.u, e.v), mut: true } : e);
                edges.push(norm(a), norm(b));
                return { n: g.n, edges };
            }
        }
    }
    return null;
}

/** Last-resort negative: one link turned round or moved to another member (connected, not isomorphic to g). */
function simpleNegative(rng: Rng, g: Graph): Graph | null {
    const cands: Graph[] = [];
    g.edges.forEach((e, i) => {
        const rest = g.edges.filter((_, k) => k !== i);
        if (!e.mut) cands.push({ n: g.n, edges: [...rest, { u: e.v, v: e.u, mut: false }] });
        for (let w = 0; w < g.n; w++) {
            if (w === e.u || w === e.v || linked(g, e.u, w)) continue;
            cands.push({ n: g.n, edges: [...rest, e.mut ? { u: Math.min(e.u, w), v: Math.max(e.u, w), mut: true } : { u: e.u, v: w, mut: false }] });
        }
    });
    for (const c of rng.shuffle(cands)) if (weaklyConnected(c) && !isomorphic(g, c)) return c;
    return null;
}

export function permute(g: Graph, pi: readonly number[]): Graph {
    return {
        n: g.n,
        edges: g.edges.map(e => (e.mut ? { u: Math.min(pi[e.u], pi[e.v]), v: Math.max(pi[e.u], pi[e.v]), mut: true } : { u: pi[e.u], v: pi[e.v], mut: false })),
    };
}

/** Vertices fixed by every automorphism (their image under any isomorphism is unique). */
export function rigidVertices(g: Graph): boolean[] {
    const autos = isomorphisms(g, g);
    return Array.from({ length: g.n }, (_, v) => autos.every(f => f[v] === v));
}

export interface GraphParams { level: number; n: number; m: number; pMut: number; jointRewire: boolean; indirect: boolean }

/**
 * v5.1: the level is the number of links in each network; the number of members follows from it.
 * Mutual links and joint rewiring are always on.
 */
export function graphParams(L: number, rng: Rng): GraphParams {
    const m = clamp(Math.floor(L), 5, 8);
    const n = clamp(m + rng.int(2) - (m >= 6 ? 1 : 0), 4, 8);
    return { level: L, n, m, pMut: 0.25, jointRewire: true, indirect: true };
}

/** Order in which entities are first mentioned in the rendered sentences (wording `w` puts args[1] first). */
export function mentionOrder(shown: readonly Premise[]): string[] {
    const out: string[] = [];
    for (const r of shown) {
        const args = Number(r.params?.['w'] ?? 0) === 1 ? [r.args[1], r.args[0]] : r.args;
        for (const a of args) if (!out.includes(a)) out.push(a);
    }
    return out;
}

const toPremises = (g: Graph, offset: number, net: 1 | 2): Premise[] =>
    g.edges.map(e => ({ kind: 'edge', args: [eid(e.u + offset), eid(e.v + offset)], params: { t: e.mut ? 'mut' : 'dir', net } }));

const edgeKey = (e: GEdge) => `${e.mut ? 'm' : 'd'}`;

function graphFingerprint(sub: string, g: Graph, answer: Answer): string {
    const kinds = g.edges.map(edgeKey).sort().join('');
    return `graph|${sub}|${kinds}|${signatures(g).sort().join(',')}|${answer}`;
}

/** Joint signature-pair multiset (a 1-WL style invariant used only for explanations and a reported bot). */
export function jointSignature(g: Graph): string {
    const sig = signatures(g);
    return g.edges.map(e => (e.mut ? [sig[e.u], sig[e.v]].sort().join('|') : `${sig[e.u]}>${sig[e.v]}`)).sort().join(',');
}

export function graphOf(item: Pick<Item, 'premises' | 'entities'>, net: 1 | 2): Graph {
    const n = item.entities.length / 2;
    const off = net === 1 ? 0 : n;
    const edges = item.premises.filter(r => r.params?.['net'] === net)
        .map(r => ({ u: idx(r.args[0]) - off, v: idx(r.args[1]) - off, mut: r.params?.['t'] === 'mut' }));
    return { n, edges };
}

export function generateGraph(spec: GenerateSpec, seed: string, oIn?: EngineOptions): Item | null {
    const o = oIn ?? DEFAULT_ENGINE_OPTIONS;
    const rngs = streams(seed);
    const L = spec.level;
    const sub: 'iso' | 'map' = spec.format === 'choice' ? 'map' : 'iso';
    for (let attempt = 0; attempt < 60; attempt++) {
        const rng = rngs.semantic.fork(`a${attempt}`);
        const gp = graphParams(L, rng);
        const g1 = randomGraph(rng, gp.n, gp.m, gp.pMut);
        if (!g1) continue;
        // at least one mutual link whenever they are enabled, and at least one one-way link
        if (gp.pMut > 0 && gp.m >= 4 && attempt < 30 && !g1.edges.some(e => e.mut)) continue;
        if (!g1.edges.some(e => !e.mut)) continue;
        const pi = rng.shuffle(Array.from({ length: gp.n }, (_, i) => i));
        let g2: Graph;
        let answer: Answer = 'entailed';
        let target = -1;
        if (sub === 'iso') {
            // a negative must exist for EVERY first network (both classes): otherwise sizes that cannot be rewired
            // would only ever appear as "same structure"
            let g: Graph | null = null;
            // several rewiring tries per network: small networks have few degree-preserving swaps
            for (let t = 0; t < 10 && !g; t++) {
                let h: Graph | null = g1;
                const swaps = 1 + rng.int(3);
                for (let s = 0; s < swaps && h; s++) h = rewireOnce(rng, h, gp.jointRewire && attempt < 25 && t < 5) ?? null;
                if (h && weaklyConnected(h) && !isomorphic(g1, h)) g = h;
            }
            // last resort (never seen in the audit samples): one link is moved or turned
            if (!g && attempt >= 55) g = simpleNegative(rng, g1);
            if (!g) continue;
            answer = spec.plan.target === 'contradicted' ? 'contradicted' : 'entailed';
            g2 = answer === 'entailed' ? permute(g1, pi) : permute(g, pi);
        } else {
            const rigid = rigidVertices(g1);
            const sig = signatures(g1);
            const classSize = (v: number) => sig.filter(s => s === sig[v]).length;
            const rigidV = Array.from({ length: gp.n }, (_, v) => v).filter(v => rigid[v]);
            // below L6 a "direct" target (unique degree signature); from L6 an "indirect" one (exactly one twin)
            // an "indirect" target (one twin with the same link counts) when the network has one, else a "direct" one
            const twin = rigidV.filter(v => classSize(v) === 2);
            const solo = rigidV.filter(v => classSize(v) === 1);
            const cands = twin.length && (rng.chance(0.6) || !solo.length) ? twin : solo.length ? solo : attempt >= 40 ? rigidV : [];
            if (!cands.length) continue;
            target = rng.pick(cands);
            g2 = permute(g1, pi);
        }
        return finalizeGraph(spec, o, rngs.presentation, gp, sub, g1, g2, answer, target, pi);
    }
    return null;
}

function finalizeGraph(spec: GenerateSpec, o: EngineOptions, pres: Rng, gp: GraphParams, sub: 'iso' | 'map',
    g1: Graph, g2: Graph, answer: Answer, target: number, pi: number[]): Item {
    const n = gp.n;
    const names = pickNames(pres.fork('names'), {
        n: 2 * n, pool: o.namePool, mode: o.nameMode, pConfusable: 0, pCarryOver: 0, prevNames: spec.prevNames, exclude: spec.excludeNames,
    }).names;
    let prem = [...toPremises(g1, 0, 1), ...toPremises(g2, n, 2)].map(r => ({ ...r, params: { ...r.params, w: pres.int(2) } }));
    const m1 = g1.edges.length;
    const order1 = pres.shuffle(Array.from({ length: m1 }, (_, i) => i));
    let order2 = pres.shuffle(Array.from({ length: g2.edges.length }, (_, i) => m1 + i));
    if (sub === 'map') {
        // first-mention control: the image of X has the same first-mention rank as X with probability 1/n only
        const want = pres.chance(1 / n);
        const rank = (ord: number[], ps: Premise[], v: number) => mentionOrder(ord.map(i => ps[i])).indexOf(eid(v));
        const r1 = rank(order1, prem, target);
        for (let t = 0; t < 60; t++) {
            if ((rank(order2, prem, n + pi[target]) === r1) === want) break;
            order2 = pres.shuffle(order2.slice());
            prem = prem.map((r, i) => (i >= m1 ? { ...r, params: { ...r.params, w: pres.int(2) } } : r));
        }
    }
    const displayOrder = [...order1, ...order2];
    const entities = names.map((name, i) => ({ id: eid(i), name }));
    const query = sub === 'iso' ? { kind: 'iso', args: [] as string[] } : { kind: 'roleOf', args: [eid(target)] };
    const shown = (ord: number[]) => ord.map(i => graphSentence(prem[i], names));
    const conclusion = [...shown(order2), graphQuestion(sub, names, target)];
    const options = sub === 'map'
        ? Array.from({ length: n }, (_, i) => ({ id: eid(n + i), label: names[n + i] })).sort((a, b) => a.label.localeCompare(b.label, 'ru'))
        : undefined;
    const correctOptionId = sub === 'map' ? eid(n + pi[target]) : answer === 'entailed' ? 'true' : 'false';
    const iso = answer === 'entailed' ? isomorphisms(g1, g2, 1)[0] : null;
    const corr = iso ? Array.from({ length: n }, (_, v) => `${names[v]} ↔ ${names[n + iso[v]]}`).join(', ') : '';
    let model: string;
    let lureNote: string | undefined;
    if (sub === 'map') {
        model = `${names[target]} ↔ ${names[n + pi[target]]}. ${describeGraphMap(corr)}`;
        const sig = signatures(g1);
        const twins = Array.from({ length: n }, (_, v) => v).filter(v => v !== target && sig[v] === sig[target]).map(v => names[n + pi[v]]);
        if (twins.length) lureNote = `У ${twins.join(', ')} столько же входящих и исходящих связей, но другая роль в сети.`;
    } else if (iso) {
        model = describeGraphMap(corr);
    } else {
        const same = jointSignature(g1) === jointSignature(g2);
        model = same
            ? 'Сети не устроены одинаково: у участников те же числа связей и даже те же пары степеней, но ни одно соответствие не сохраняет все связи (связи переставлены).'
            : 'Сети не устроены одинаково: у участников те же числа входящих, исходящих и взаимных связей, но связи между ними переставлены — участники с одинаковыми степенями соединены по-разному.';
        lureNote = 'Совпадение чисел связей ещё не означает одинаковое устройство.';
    }
    const fp = graphFingerprint(sub, g1, answer);
    return {
        engineVersion: ENGINE_VERSION,
        family: 'graph',
        level: spec.level,
        seed: spec.seed,
        entities,
        premises: prem,
        query,
        answer,
        format: sub === 'map' ? 'choice' : 'binary',
        options,
        correctOptionId,
        lure: 'none',
        metrics: {
            entities: 2 * n, premises: prem.length, support: null, supportIdx: [], width: n, arityMax: 2,
            convergent: false, nonLocal: false, modelsLog2: 0, distractors: 0, attachedDistractors: 0,
            negations: 0, metas: 0, discontinuity: discontinuity(prem, displayOrder), relaxations: [],
        },
        displayOrder,
        render: { instructions: [GRAPH_INSTRUCTIONS[sub]], notes: [], premises: shown(order1), conclusion },
        explanation: { supportDisplayIdx: [], model, lureNote, tipId: sub === 'map' ? 2 : 3 },
        fingerprint: fp,
        target: { level: Math.round(gp.level * 100) / 100, sigmaMin: 0, sigmaMax: 0 },
        subtype: sub,
    };
}
