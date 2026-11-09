// Transfer probe 3 (spec §11): visual graph mapping — two drawn graphs with random layouts, one- and two-way
// arrows; click the vertex of the second graph corresponding to the highlighted one in the first. The visual
// format is never trained (the training modes are text only).

import { Rng } from '../core/rng';
import { Graph, isomorphisms, permute, rigidVertices, signatures, weaklyConnected } from '../families/graph';

export interface Pt { x: number; y: number }

export interface GraphProbeItem {
    g1: Graph;
    g2: Graph;
    layout1: Pt[];
    layout2: Pt[];
    target: number;
    answer: number;
    indirect: boolean;
}

function layout(rng: Rng, n: number): Pt[] {
    const start = rng.float() * Math.PI * 2;
    const order = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    const pts: Pt[] = new Array(n);
    order.forEach((v, k) => {
        const a = start + (2 * Math.PI * k) / n + (rng.float() - 0.5) * 0.5;
        const r = 36 + rng.float() * 8;
        pts[v] = { x: Math.round(50 + r * Math.cos(a)), y: Math.round(50 + r * Math.sin(a)) };
    });
    return pts;
}

export function generateGraphProbe(rng: Rng, edges: number, indirect: boolean): GraphProbeItem {
    for (let attempt = 0; attempt < 500; attempt++) {
        const n = Math.max(4, Math.min(6, edges - rng.int(2)));
        const g: Graph = { n, edges: [] };
        const linked = (a: number, b: number) => g.edges.some(e => (e.u === a && e.v === b) || (e.u === b && e.v === a));
        for (let t = 0; t < 200 && g.edges.length < edges; t++) {
            const a = rng.int(n);
            const b = rng.int(n);
            if (a === b || linked(a, b)) continue;
            const mut = rng.chance(0.25);
            g.edges.push(mut ? { u: Math.min(a, b), v: Math.max(a, b), mut } : { u: a, v: b, mut });
        }
        if (g.edges.length !== edges || !weaklyConnected(g)) continue;
        const rigid = rigidVertices(g);
        const sig = signatures(g);
        const cands = Array.from({ length: n }, (_, v) => v).filter(v => rigid[v] && (sig.filter(s => s === sig[v]).length >= 2) === indirect);
        if (!cands.length) continue;
        const target = rng.pick(cands);
        const pi = rng.shuffle(Array.from({ length: n }, (_, i) => i));
        const g2 = permute(g, pi);
        if (new Set(isomorphisms(g, g2).map(f => f[target])).size !== 1) continue;
        return { g1: g, g2, layout1: layout(rng, n), layout2: layout(rng, n), target, answer: pi[target], indirect };
    }
    throw new Error('graph probe generator failed');
}
