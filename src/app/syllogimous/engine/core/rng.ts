// Deterministic seeded RNG for the v5 engine: xmur3 (string hash → seed) + sfc32 (generator).
// Pure: no Math.random(), no wall clock. Same seed label → same sequence on every platform.

/** xmur3 string hash; each call of the returned function yields the next 32-bit seed. */
export function xmur3(str: string): () => number {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return () => {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return (h ^= h >>> 16) >>> 0;
    };
}

/** sfc32 generator; returns floats in [0, 1). */
export function sfc32(a: number, b: number, c: number, d: number): () => number {
    return () => {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
        let t = (a + b) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        d = (d + 1) | 0;
        t = (t + d) | 0;
        c = (c + t) | 0;
        return (t >>> 0) / 4294967296;
    };
}

export class Rng {
    private readonly next: () => number;

    constructor(private readonly seedLabel: string) {
        const h = xmur3(seedLabel);
        this.next = sfc32(h(), h(), h(), h());
    }

    get label(): string { return this.seedLabel; }

    /** Float in [0, 1). */
    float(): number { return this.next(); }

    /** Integer in [0, n). */
    int(n: number): number { return Math.floor(this.next() * n); }

    /** True with probability p. */
    chance(p: number): boolean { return this.next() < p; }

    pick<T>(a: readonly T[]): T {
        if (a.length === 0) {
            throw new Error('Rng.pick: empty array');
        }
        return a[this.int(a.length)];
    }

    /** In-place Fisher–Yates shuffle; returns the same array. */
    shuffle<T>(a: T[]): T[] {
        for (let i = a.length - 1; i > 0; i--) {
            const j = this.int(i + 1);
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    /** Independent child stream; does not consume values from this one. */
    fork(label: string): Rng { return new Rng(`${this.seedLabel}:${label}`); }
}

export interface RngStreams {
    /** Logical item: world, premises, query. */
    semantic: Rng;
    /** Display order, names, wording — changing it never changes the logical item. */
    presentation: Rng;
    /** Family/plan selection in the scheduler. */
    scheduler: Rng;
}

export const streams = (seed: string): RngStreams => ({
    semantic: new Rng(seed + ':sem'),
    presentation: new Rng(seed + ':pres'),
    scheduler: new Rng(seed + ':sch'),
});
