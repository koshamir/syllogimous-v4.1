// «Контроль переноса» session (spec §11): alternate forms by seed `probe:<date>`, the same difficulty mix in every
// session — 10 Latin squares (complexity 1/2/3), 8 number series, 8 visual graph mappings. No feedback.

import { Rng } from '../core/rng';
import { LstItem, generateLst } from './lst';
import { SeriesItem, SeriesKind, generateSeries } from './series';
import { GraphProbeItem, generateGraphProbe } from './graph-visual';

export interface ProbeSession { seed: string; lst: LstItem[]; series: SeriesItem[]; graph: GraphProbeItem[] }

export const PROBE_REMINDER_DAYS = 14;

export function generateProbeSession(date: string): ProbeSession {
    const seed = `probe:${date}`;
    const rng = new Rng(seed);
    const lstMix: (1 | 2 | 3)[] = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3];
    const seriesMix: SeriesKind[] = ['arith', 'geom', 'interleaved', 'second', 'fib', 'interleaved', 'second', 'fib'];
    const graphMix: [number, boolean][] = [[3, false], [4, false], [4, true], [5, false], [5, true], [6, false], [6, true], [5, true]];
    return {
        seed,
        lst: rng.shuffle(lstMix).map((c, i) => generateLst(rng.fork(`lst${i}`), c)),
        series: rng.shuffle(seriesMix).map((k, i) => generateSeries(rng.fork(`ser${i}`), k)),
        graph: rng.shuffle(graphMix).map(([e, ind], i) => generateGraphProbe(rng.fork(`g${i}`), e, ind)),
    };
}

/** Days since an ISO date (UTC days). */
export function daysSince(iso: string, today: string): number {
    return Math.round((Date.parse(today) - Date.parse(iso)) / 86400000);
}
