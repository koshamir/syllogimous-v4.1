// Transfer probe 1 (spec §11): 4×4 Latin square task. Choose the shape for the «?» cell from 4.
// Relational complexity of an item = the smallest number of rows and columns (that contain visible cells) which,
// considered jointly, determine the cell — computed by enumerating subsets of lines over all 576 Latin squares.

import { Rng } from '../core/rng';

export const SHAPES = ['●', '▲', '■', '◆'];

export interface LstItem {
    /** 16 cells, row-major: symbol 0–3 or −1 (empty); the target cell is −2. */
    grid: number[];
    target: number;
    answer: number;
    complexity: 1 | 2 | 3;
}

let squares: number[][] | null = null;

export function latinSquares(): number[][] {
    if (squares) return squares;
    const out: number[][] = [];
    const g = new Array(16).fill(-1);
    const rec = (i: number) => {
        if (i === 16) { out.push(g.slice()); return; }
        const r = i >> 2;
        const c = i & 3;
        for (let v = 0; v < 4; v++) {
            let ok = true;
            for (let k = 0; k < 4 && ok; k++) if ((k < c && g[r * 4 + k] === v) || (k < r && g[k * 4 + c] === v)) ok = false;
            if (!ok) continue;
            g[i] = v;
            rec(i + 1);
            g[i] = -1;
        }
    };
    rec(0);
    squares = out;
    return out;
}

/** Lines: rows 0–3, columns 4–7. */
const cellsOf = (line: number) => (line < 4 ? [0, 1, 2, 3].map(c => line * 4 + c) : [0, 1, 2, 3].map(r => r * 4 + (line - 4)));

function determined(visible: Map<number, number>, lines: number[], target: number): number | null {
    const cells = new Set(lines.flatMap(cellsOf));
    const cons = [...visible].filter(([cell]) => cells.has(cell));
    let val = -1;
    for (const sq of latinSquares()) {
        if (!cons.every(([cell, v]) => sq[cell] === v)) continue;
        if (val < 0) val = sq[target];
        else if (sq[target] !== val) return null;
    }
    return val < 0 ? null : val;
}

/** Smallest number of lines (with visible cells) that determines the target; Infinity if none. */
export function relationalComplexity(visible: Map<number, number>, target: number): number {
    const used = [0, 1, 2, 3, 4, 5, 6, 7].filter(l => cellsOf(l).some(c => visible.has(c)));
    for (let k = 1; k <= used.length; k++) {
        let found = false;
        const rec = (start: number, sel: number[]) => {
            if (found) return;
            if (sel.length === k) { if (determined(visible, sel, target) !== null) found = true; return; }
            for (let i = start; i < used.length; i++) rec(i + 1, [...sel, used[i]]);
        };
        rec(0, []);
        if (found) return k;
    }
    return Infinity;
}

export function generateLst(rng: Rng, complexity: 1 | 2 | 3): LstItem {
    const all = latinSquares();
    for (let attempt = 0; attempt < 400; attempt++) {
        const sq = rng.pick(all);
        const target = rng.int(16);
        const others = rng.shuffle(Array.from({ length: 16 }, (_, i) => i).filter(i => i !== target));
        const visible = new Map<number, number>();
        for (const c of others.slice(0, 5 + rng.int(5))) visible.set(c, sq[c]);
        if (determined(visible, [0, 1, 2, 3, 4, 5, 6, 7], target) === null) continue;
        if (relationalComplexity(visible, target) !== complexity) continue;
        const grid = Array.from({ length: 16 }, (_, i) => (i === target ? -2 : visible.has(i) ? visible.get(i)! : -1));
        return { grid, target, answer: sq[target], complexity };
    }
    throw new Error('LST generator failed');
}
