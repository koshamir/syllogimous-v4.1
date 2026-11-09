// «Конструктор» (spec §7.1): exhaustive world sets, bitsets over worlds.

export type WorldKind = 'line' | 'circle' | 'groups' | 'lineAttr' | 'grid';

export interface WorldSet {
    kind: WorldKind;
    n: number;
    /** Attributes per entity: 1 (position / seat / group / cell) or 2 (lineAttr: position + colour). */
    attrs: number;
    /** Number of values of each attribute. */
    domain: number[];
    W: number;
    /** values[(w * n + e) * attrs + a] */
    values: Int8Array;
    groups?: number[];
    colors?: number;
}

export const val = (ws: WorldSet, w: number, e: number, a = 0) => ws.values[(w * ws.n + e) * ws.attrs + a];

function permutations(n: number, cb: (p: number[]) => void, fixFirst = false) {
    const p = Array.from({ length: n }, (_, i) => i);
    const rec = (k: number) => {
        if (k === n) { cb(p); return; }
        for (let i = k; i < n; i++) {
            if (fixFirst && k === 0 && i !== 0) continue;
            [p[k], p[i]] = [p[i], p[k]];
            rec(k + 1);
            [p[k], p[i]] = [p[i], p[k]];
        }
    };
    rec(0);
}

const cache = new Map<string, WorldSet>();

export function worldSet(kind: WorldKind, n: number, opts: { groups?: number[]; colors?: number } = {}): WorldSet {
    const key = `${kind}:${n}:${opts.groups?.join(',') ?? ''}:${opts.colors ?? ''}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const rows: number[][] = [];
    let attrs = 1;
    let domain: number[] = [n];
    switch (kind) {
        case 'line':
            permutations(n, p => rows.push(p.slice()));
            break;
        case 'circle':
            permutations(n, p => rows.push(p.slice()), true);
            break;
        case 'groups': {
            const sizes = opts.groups!;
            domain = [sizes.length];
            const g = new Array(n).fill(0);
            const cnt = new Array(sizes.length).fill(0);
            const rec = (e: number) => {
                if (e === n) { rows.push(g.slice()); return; }
                for (let k = 0; k < sizes.length; k++) {
                    if (cnt[k] >= sizes[k]) continue;
                    g[e] = k; cnt[k]++;
                    rec(e + 1);
                    cnt[k]--;
                }
            };
            rec(0);
            break;
        }
        case 'lineAttr': {
            const C = opts.colors!;
            attrs = 2;
            domain = [n, C];
            const cols: number[][] = [];
            const c = new Array(n).fill(0);
            const rec = (e: number) => {
                if (e === n) { if (new Set(c).size === C) cols.push(c.slice()); return; }
                for (let k = 0; k < C; k++) { c[e] = k; rec(e + 1); }
            };
            rec(0);
            permutations(n, p => { for (const col of cols) rows.push(p.flatMap((pos, e) => [pos, col[e]])); });
            break;
        }
        case 'grid': {
            domain = [9];
            const cell = new Array(n).fill(0);
            const used = new Array(9).fill(false);
            const rec = (e: number) => {
                if (e === n) { rows.push(cell.slice()); return; }
                for (let x = 0; x < 9; x++) {
                    if (used[x]) continue;
                    used[x] = true; cell[e] = x;
                    rec(e + 1);
                    used[x] = false;
                }
            };
            rec(0);
            break;
        }
    }
    const values = new Int8Array(rows.length * n * attrs);
    rows.forEach((r, w) => r.forEach((v, i) => (values[w * n * attrs + i] = v)));
    const ws: WorldSet = { kind, n, attrs, domain, W: rows.length, values, groups: opts.groups, colors: opts.colors };
    cache.set(key, ws);
    return ws;
}

// ---------------------------------------------------------------- bitsets

export type Bits = Uint32Array;

export const words = (W: number) => (W + 31) >>> 5;

export function allBits(W: number): Bits {
    const b = new Uint32Array(words(W)).fill(0xffffffff);
    const extra = words(W) * 32 - W;
    if (extra) b[b.length - 1] = 0xffffffff >>> extra;
    return b;
}

export function andInto(dst: Bits, src: Bits): Bits {
    for (let i = 0; i < dst.length; i++) dst[i] &= src[i];
    return dst;
}

export function and(a: Bits, b: Bits): Bits {
    const out = new Uint32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i] & b[i];
    return out;
}

export function popcount(b: Bits): number {
    let c = 0;
    for (let i = 0; i < b.length; i++) {
        let x = b[i];
        x -= (x >>> 1) & 0x55555555;
        x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
        c += (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
    }
    return c;
}

export function forEachBit(b: Bits, cb: (w: number) => boolean | void): void {
    for (let i = 0; i < b.length; i++) {
        let x = b[i];
        while (x) {
            const t = x & -x;
            const w = (i << 5) + (31 - Math.clz32(t));
            if (cb(w) === true) return;
            x ^= t;
        }
    }
}

export function firstBit(b: Bits): number {
    let found = -1;
    forEachBit(b, w => { found = w; return true; });
    return found;
}

export function bitsOf(ws: WorldSet, pred: (w: number) => boolean): Bits {
    const b = new Uint32Array(words(ws.W));
    for (let w = 0; w < ws.W; w++) if (pred(w)) b[w >>> 5] |= 1 << (w & 31);
    return b;
}

export const has = (b: Bits, w: number) => (b[w >>> 5] >>> (w & 31)) & 1;
