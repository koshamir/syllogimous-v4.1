// Transfer probe 2 (spec §11): number series — arithmetic and geometric progressions, two interleaved
// progressions, second differences, "Fibonacci-like". The answer is the next number.

import { Rng } from '../core/rng';

export type SeriesKind = 'arith' | 'geom' | 'interleaved' | 'second' | 'fib';
export const SERIES_KINDS: SeriesKind[] = ['arith', 'geom', 'interleaved', 'second', 'fib'];

export interface SeriesItem { kind: SeriesKind; shown: number[]; answer: number }

export function generateSeries(rng: Rng, kind: SeriesKind): SeriesItem {
    const len = 6;
    let xs: number[] = [];
    switch (kind) {
        case 'arith': {
            const a = rng.int(40) - 10;
            const d = (rng.int(9) + 2) * (rng.chance(0.3) ? -1 : 1);
            xs = Array.from({ length: len + 1 }, (_, i) => a + i * d);
            break;
        }
        case 'geom': {
            const a = 1 + rng.int(5);
            const r = rng.pick([2, 3, -2]);
            xs = Array.from({ length: len + 1 }, (_, i) => a * r ** i);
            break;
        }
        case 'interleaved': {
            const a = rng.int(20);
            const b = rng.int(20) + 20;
            const da = 2 + rng.int(5);
            const db = -(1 + rng.int(4));
            xs = Array.from({ length: len + 1 }, (_, i) => (i % 2 === 0 ? a + (i / 2) * da : b + ((i - 1) / 2) * db));
            break;
        }
        case 'second': {
            const a = rng.int(10);
            const d0 = 1 + rng.int(4);
            const dd = 1 + rng.int(3);
            xs = [a];
            for (let i = 1; i <= len; i++) xs.push(xs[i - 1] + d0 + (i - 1) * dd);
            break;
        }
        case 'fib': {
            xs = [1 + rng.int(4), 1 + rng.int(6)];
            while (xs.length < len + 1) xs.push(xs[xs.length - 1] + xs[xs.length - 2]);
            break;
        }
    }
    return { kind, shown: xs.slice(0, len), answer: xs[len] };
}
