// «Беглость» (spec §10): blocks of 30 binary items, σ = 2, 2–3 premises, determined answers, families alternating
// on every item. Per-family deadline D (start 7 s, 1.5…15 s): correct within D → D·0.97, error or timeout → D·1.19
// (equilibrium ≈ 85 % correct). Score per item S = (2x − 1)·(D − t)/D. Every third block is a contextual-control
// block: relation words are pseudo-words (new pairs per block) and the frame colour is the context (blue — usual
// meaning, orange — meanings swapped; the colour changes on each item with probability 0.3).

import { Rng } from '../../core/rng';
import { getCyrillicPool } from '../../core/names';

export type FluencyFamily = 'orderNum' | 'orderTime' | 'linear' | 'dir2d' | 'groups';
export const FLUENCY_FAMILIES: FluencyFamily[] = ['orderNum', 'orderTime', 'linear', 'dir2d', 'groups'];

export const FLUENCY = {
    blockSize: 30,
    startDeadline: 7,
    minDeadline: 1.5,
    maxDeadline: 15,
    up: 0.97,
    down: 1.19,
    contextualEvery: 3,
    legendSeconds: 10,
    pColourChange: 0.3,
};

/** Words of the two relations of a family: [forward, backward] («больше» / «меньше», «равен» / «противоположен»). */
export const RELATION_WORDS: Record<FluencyFamily, [string, string]> = {
    orderNum: ['больше', 'меньше'],
    orderTime: ['позже', 'раньше'],
    linear: ['левее', 'правее'],
    dir2d: ['севернее', 'южнее'],
    groups: ['равен', 'противоположен'],
};

export const FAMILY_TITLES: Record<FluencyFamily, string> = {
    orderNum: 'Сравнение', orderTime: 'Время', linear: 'Ряд', dir2d: 'Карта', groups: 'Стороны',
};

export interface FluencyItem {
    family: FluencyFamily;
    premises: string[];
    conclusion: string;
    answer: boolean;
    /** Contextual blocks: 'normal' (blue) or 'swapped' (orange). */
    frame?: 'normal' | 'swapped';
}

export interface FluencyLegend { family: FluencyFamily; words: [string, string]; meaning: [string, string] }

export interface FluencyBlock {
    index: number;
    contextual: boolean;
    legend: FluencyLegend[];
    items: FluencyItem[];
}

export const isContextual = (blockIndex: number) => (blockIndex + 1) % FLUENCY.contextualEvery === 0;

export function nextDeadline(D: number, correct: boolean): number {
    const x = correct ? D * FLUENCY.up : D * FLUENCY.down;
    return Math.max(FLUENCY.minDeadline, Math.min(FLUENCY.maxDeadline, x));
}

/** Signed residual time: fast errors are penalised, guessing does not pay; a timeout scores 0. */
export function itemScore(correct: boolean, tSec: number, D: number): number {
    if (tSec >= D) return 0;
    return ((correct ? 1 : -1) * (D - tSec)) / D;
}

const subj = (s: string) => `<span class="subject">${s}</span>`;

/** Semantic relation between two entities: +1 forward («больше», «равен»), −1 backward. */
function phrase(family: FluencyFamily, a: string, b: string, forward: boolean, words?: [string, string]): string {
    if (words) return `${subj(a)} ${words[forward ? 0 : 1]} ${subj(b)}`;
    const w = RELATION_WORDS[family][forward ? 0 : 1];
    switch (family) {
        case 'orderNum': return `${subj(a)} ${w} ${subj(b)}`;
        case 'orderTime': return `${subj(a)} ${w} ${subj(b)}`;
        case 'linear': return `${subj(a)} ${w} ${subj(b)}`;
        case 'dir2d': return `${subj(a)} ${w} ${subj(b)}`;
        case 'groups': return `${subj(a)} ${w} ${subj(b)}`;
    }
}

function makeItem(rng: Rng, family: FluencyFamily, names: string[], words?: [string, string], frame?: 'normal' | 'swapped'): FluencyItem {
    const [a, b, c, d] = names;
    // the shown word w means relation w, or the other one in a swapped frame
    const say = (x: string, y: string, forward: boolean) => phrase(family, x, y, frame === 'swapped' ? !forward : forward, words);
    if (family === 'groups') {
        // colours: a and b same/different, b and c same/different ⇒ a vs c
        const ab = rng.chance(0.5);
        const bc = rng.chance(0.5);
        const ac = ab === bc;
        const prem = [rng.chance(0.5) ? say(a, b, ab) : say(b, a, ab), rng.chance(0.5) ? say(b, c, bc) : say(c, b, bc)];
        if (rng.chance(0.3)) prem.push(say(c, d, rng.chance(0.5)));
        const claim = rng.chance(0.5);
        return { family, premises: rng.shuffle(prem), conclusion: rng.chance(0.5) ? say(a, c, claim) : say(c, a, claim), answer: claim === ac, frame };
    }
    // order-like: positions a > b > c (forward = "greater / later / further left / further north")
    const prem = [
        rng.chance(0.5) ? say(a, b, true) : say(b, a, false),
        rng.chance(0.5) ? say(b, c, true) : say(c, b, false),
    ];
    if (rng.chance(0.3)) prem.push(rng.chance(0.5) ? say(d, b, rng.chance(0.5)) : say(d, c, rng.chance(0.5)));
    const truth = rng.chance(0.5);
    // conclusion about a and c: true statement is "a forward c" / "c backward a"
    const conclusion = rng.chance(0.5) ? say(a, c, truth) : say(c, a, !truth);
    return { family, premises: rng.shuffle(prem), conclusion, answer: truth, frame };
}

export function generateFluencyBlock(blockIndex: number, seed: string, opts: { pool?: readonly string[] } = {}): FluencyBlock {
    const rng = new Rng(`${seed}:fluency:${blockIndex}`);
    const pool = opts.pool ?? getCyrillicPool();
    const contextual = isContextual(blockIndex);
    const order = rng.shuffle(FLUENCY_FAMILIES.slice());
    const legend: FluencyLegend[] = [];
    const words = new Map<FluencyFamily, [string, string]>();
    if (contextual) {
        const used = new Set<string>();
        for (const f of order) {
            const pick = () => { let w = ''; do { w = rng.pick(pool); } while (used.has(w)); used.add(w); return w; };
            const pair: [string, string] = [pick(), pick()];
            words.set(f, pair);
            legend.push({ family: f, words: pair, meaning: RELATION_WORDS[f] });
        }
    }
    const items: FluencyItem[] = [];
    let frame: 'normal' | 'swapped' = 'normal';
    for (let i = 0; i < FLUENCY.blockSize; i++) {
        const family = order[i % order.length];             // families alternate on every item
        const names: string[] = [];
        while (names.length < 4) { const w = rng.pick(pool); if (!names.includes(w) && !legend.some(l => l.words.includes(w))) names.push(w); }
        if (contextual && i > 0 && rng.chance(FLUENCY.pColourChange)) frame = frame === 'normal' ? 'swapped' : 'normal';
        items.push(makeItem(rng, family, names, words.get(family), contextual ? frame : undefined));
    }
    return { index: blockIndex, contextual, legend, items };
}
