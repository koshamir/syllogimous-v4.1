/** xmur3 + sfc32, with named streams to prevent presentation choices affecting semantics. */
export class SeededRandom {
    private a: number;
    private b: number;
    private c: number;
    private d: number;

    constructor(readonly seed: string) {
        const hash = xmur3(seed);
        this.a = hash();
        this.b = hash();
        this.c = hash();
        this.d = hash();
    }

    next(): number {
        this.a >>>= 0;
        this.b >>>= 0;
        this.c >>>= 0;
        this.d >>>= 0;
        const t = (this.a + this.b + this.d) | 0;
        this.d = (this.d + 1) | 0;
        this.a = this.b ^ (this.b >>> 9);
        this.b = (this.c + (this.c << 3)) | 0;
        this.c = ((this.c << 21) | (this.c >>> 11));
        this.c = (this.c + t) | 0;
        return (t >>> 0) / 4294967296;
    }

    int(minInclusive: number, maxInclusive: number): number {
        if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive) || maxInclusive < minInclusive) {
            throw new Error("Invalid integer range");
        }
        return minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1));
    }

    bool(probability = 0.5): boolean {
        if (probability < 0 || probability > 1) {
            throw new Error("Probability must be in [0, 1]");
        }
        return this.next() < probability;
    }

    pick<T>(items: readonly T[]): T {
        if (!items.length) {
            throw new Error("Cannot pick from an empty collection");
        }
        return items[this.int(0, items.length - 1)];
    }

    shuffle<T>(items: readonly T[]): T[] {
        const result = [...items];
        for (let index = result.length - 1; index > 0; index--) {
            const other = this.int(0, index);
            [result[index], result[other]] = [result[other], result[index]];
        }
        return result;
    }

    fork(stream: "semantic" | "presentation" | "scheduler" | string): SeededRandom {
        return new SeededRandom(`${this.seed}::${stream}`);
    }
}

function xmur3(value: string): () => number {
    let hash = 1779033703 ^ value.length;
    for (let index = 0; index < value.length; index++) {
        hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
        hash = (hash << 13) | (hash >>> 19);
    }
    return () => {
        hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
        hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
        return (hash ^= hash >>> 16) >>> 0;
    };
}

export interface RandomStreams {
    semantic: SeededRandom;
    presentation: SeededRandom;
    scheduler: SeededRandom;
}

export function createRandomStreams(seed: string): RandomStreams {
    const root = new SeededRandom(seed);
    return {
        semantic: root.fork("semantic"),
        presentation: root.fork("presentation"),
        scheduler: root.fork("scheduler"),
    };
}
