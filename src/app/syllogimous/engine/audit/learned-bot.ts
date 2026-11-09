// Multinomial logistic regression (softmax, L2) on surface features — the "learned" bot (spec §4.10).

import { FeatureVec } from './features';

export interface LearnedModel {
    keys: string[];
    classes: string[];
    mean: number[];
    std: number[];
    W: number[][];   // [class][feature + bias]
}

export function trainSoftmax(X: FeatureVec[], y: string[], opts: { l2?: number; iters?: number; lr?: number } = {}): LearnedModel {
    const l2 = opts.l2 ?? 1e-3;
    const iters = opts.iters ?? 400;
    const lr = opts.lr ?? 0.5;
    const keys = [...new Set(X.flatMap(x => Object.keys(x)))].sort();
    const classes = [...new Set(y)].sort();
    const n = X.length;
    const d = keys.length;
    const rows = X.map(x => keys.map(k => x[k] ?? 0));
    const mean = keys.map((_, j) => rows.reduce((s, r) => s + r[j], 0) / n);
    const std = keys.map((_, j) => Math.sqrt(rows.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / n) || 1);
    const Z = rows.map(r => [...r.map((v, j) => (v - mean[j]) / std[j]), 1]);
    const Y = y.map(c => classes.indexOf(c));
    const K = classes.length;
    const W = Array.from({ length: K }, () => new Array(d + 1).fill(0));
    const P = Array.from({ length: n }, () => new Array(K).fill(0));
    for (let it = 0; it < iters; it++) {
        for (let i = 0; i < n; i++) {
            let mx = -Infinity;
            for (let c = 0; c < K; c++) {
                let s = 0;
                for (let j = 0; j <= d; j++) s += W[c][j] * Z[i][j];
                P[i][c] = s;
                if (s > mx) mx = s;
            }
            let tot = 0;
            for (let c = 0; c < K; c++) { P[i][c] = Math.exp(P[i][c] - mx); tot += P[i][c]; }
            for (let c = 0; c < K; c++) P[i][c] /= tot;
        }
        for (let c = 0; c < K; c++) {
            for (let j = 0; j <= d; j++) {
                let g = 0;
                for (let i = 0; i < n; i++) g += (P[i][c] - (Y[i] === c ? 1 : 0)) * Z[i][j];
                g = g / n + (j < d ? l2 * W[c][j] : 0);
                W[c][j] -= lr * g;
            }
        }
    }
    return { keys, classes, mean, std, W };
}

export function predictSoftmax(m: LearnedModel, x: FeatureVec): string {
    const z = [...m.keys.map((k, j) => ((x[k] ?? 0) - m.mean[j]) / m.std[j]), 1];
    let best = 0;
    let bestS = -Infinity;
    m.classes.forEach((_, c) => {
        let s = 0;
        for (let j = 0; j < z.length; j++) s += m.W[c][j] * z[j];
        if (s > bestS) { bestS = s; best = c; }
    });
    return m.classes[best];
}
