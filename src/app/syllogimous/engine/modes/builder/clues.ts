// «Конструктор» clues (spec §7.2): binary, ternary, conditional and quantitative templates over a world set.

import { Rng } from '../../core/rng';
import { WorldSet } from './worlds';

export type ClueClass = 'binary' | 'ternary' | 'conditional' | 'quant';

export interface Clue {
    kind: string;
    /** Entity indices. */
    args: number[];
    /** k / group / colour, depending on the kind. */
    p?: number;
    p2?: number;
    cls: ClueClass;
}

const CLASS: Record<string, ClueClass> = {
    left: 'binary', immLeft: 'binary', adj: 'binary', notAdj: 'binary', end: 'binary', notEnd: 'binary', pos: 'binary',
    same: 'binary', diff: 'binary', in: 'binary', notIn: 'binary', color: 'binary', notColor: 'binary',
    sameRow: 'binary', sameCol: 'binary', above: 'binary', leftRow: 'binary',
    between: 'ternary', closer: 'ternary', sides: 'ternary', oneNext: 'ternary',
    ifEndThenAdj: 'conditional', ifInThenIn: 'conditional',
    gap: 'quant', countIn: 'quant', countColor: 'quant',
};

/** Unary clues that pin a value outright (excluded where entryK ≥ 2 is wanted). */
export const PINNING = new Set(['pos', 'in', 'color']);

const mod = (x: number, n: number) => ((x % n) + n) % n;

export function holds(ws: WorldSet, w: number, c: Clue): boolean {
    const n = ws.n;
    const at = ws.attrs;
    const V = ws.values;
    const base = w * n * at;
    const args = c.args;
    const pa = args.length > 0 ? V[base + args[0] * at] : 0;
    const pb = args.length > 1 ? V[base + args[1] * at] : 0;
    const pd = args.length > 2 ? V[base + args[2] * at] : 0;
    const circle = ws.kind === 'circle';
    const dist = (x: number, y: number) => {
        const t = x > y ? x - y : y - x;
        return circle && n - t < t ? n - t : t;
    };
    switch (c.kind) {
        case 'left': return pa < pb;
        case 'immLeft': return circle ? mod(pa - pb, n) === 1 : pb === pa + 1;
        case 'adj': return dist(pa, pb) === 1;
        case 'notAdj': return dist(pa, pb) !== 1;
        case 'end': return pa === 0 || pa === n - 1;
        case 'notEnd': return pa !== 0 && pa !== n - 1;
        case 'pos': return pa === c.p;
        case 'between': return (pb < pa && pa < pd) || (pd < pa && pa < pb);
        case 'closer': return dist(pa, pb) < dist(pa, pd);
        case 'sides': return (pa - pd) * (pb - pd) < 0;
        case 'oneNext': return (dist(pa, pb) === 1) !== (dist(pa, pd) === 1);
        case 'gap': return dist(pa, pb) === c.p! + 1;
        case 'ifEndThenAdj': return !(pa === 0 || pa === n - 1) || dist(pb, pd) === 1;
        // groups
        case 'same': return pa === pb;
        case 'diff': return pa !== pb;
        case 'in': return pa === c.p;
        case 'notIn': return pa !== c.p;
        case 'ifInThenIn': return pa !== c.p || pb === c.p2;
        case 'countIn': return (pa === c.p ? 1 : 0) + (pb === c.p ? 1 : 0) + (pd === c.p ? 1 : 0) === c.p2;
        // colours (attribute 1)
        case 'color': return V[base + args[0] * at + 1] === c.p;
        case 'notColor': return V[base + args[0] * at + 1] !== c.p;
        case 'countColor': { let k = 0; for (let e = 0; e < n; e++) if (V[base + e * at + 1] === c.p) k++; return k === c.p2; }
        // grid (cell = row·3 + column)
        case 'sameRow': return ((pa / 3) | 0) === ((pb / 3) | 0);
        case 'sameCol': return pa % 3 === pb % 3;
        case 'above': return ((pa / 3) | 0) < ((pb / 3) | 0);
        case 'leftRow': return ((pa / 3) | 0) === ((pb / 3) | 0) && pa % 3 < pb % 3;
        default: throw new Error('Unknown builder clue ' + c.kind);
    }
}

const mk = (kind: string, args: number[], p?: number, p2?: number): Clue => ({ kind, args, p, p2, cls: CLASS[kind] });

/** Every template instance true in world `w` (ternary and conditional ones sampled). */
export function cluePool(ws: WorldSet, w: number, rng: Rng, allowed: (c: Clue) => boolean): Clue[] {
    const n = ws.n;
    const out: Clue[] = [];
    const push = (c: Clue) => { if (allowed(c) && holds(ws, w, c)) out.push(c); };
    const E = Array.from({ length: n }, (_, i) => i);
    const pairs: [number, number][] = [];
    for (const a of E) for (const b of E) if (a !== b) pairs.push([a, b]);
    const triples: [number, number, number][] = [];
    for (const a of E) for (const b of E) for (const c of E) if (a !== b && b !== c && a !== c) triples.push([a, b, c]);
    const sample = <T>(xs: T[], k: number) => rng.shuffle(xs.slice()).slice(0, k);
    const lineLike = ws.kind === 'line' || ws.kind === 'lineAttr';
    if (lineLike || ws.kind === 'circle') {
        for (const [a, b] of pairs) {
            if (lineLike) push(mk('left', [a, b]));
            push(mk('immLeft', [a, b]));
            if (a < b) { push(mk('adj', [a, b])); push(mk('notAdj', [a, b])); }
            if (a < b) for (let k = 1; k <= Math.min(3, n - 2); k++) push(mk('gap', [a, b], k));
        }
        if (lineLike) for (const a of E) { push(mk('end', [a])); push(mk('notEnd', [a])); for (let k = 0; k < n; k++) push(mk('pos', [a], k)); }
        for (const [a, b, c] of sample(triples, 50)) {
            if (lineLike && b < c) push(mk('between', [a, b, c]));
            push(mk('closer', [a, b, c]));
            if (lineLike && a < b) push(mk('sides', [a, b, c]));
            if (b < c) push(mk('oneNext', [a, b, c]));
        }
        if (lineLike) for (const [a, b, c] of sample(triples, 20)) if (b < c) push(mk('ifEndThenAdj', [a, b, c]));
    }
    if (ws.kind === 'groups') {
        const G = ws.groups!.length;
        for (const [a, b] of pairs) if (a < b) { push(mk('same', [a, b])); push(mk('diff', [a, b])); }
        for (const a of E) for (let g = 0; g < G; g++) { push(mk('in', [a], g)); push(mk('notIn', [a], g)); }
        for (const [a, b] of sample(pairs, 15)) for (let g1 = 0; g1 < G; g1++) for (let g2 = 0; g2 < G; g2++) push(mk('ifInThenIn', [a, b], g1, g2));
        for (const [a, b, c] of sample(triples, 30)) if (a < b && b < c) for (let g = 0; g < G; g++) push(mk('countIn', [a, b, c], g, 2));
    }
    if (ws.kind === 'lineAttr') {
        const C = ws.colors!;
        for (const a of E) for (let c = 0; c < C; c++) { push(mk('color', [a], c)); push(mk('notColor', [a], c)); }
        for (let c = 0; c < C; c++) for (let k = 1; k <= n - 1; k++) push(mk('countColor', [], c, k));
    }
    if (ws.kind === 'grid') {
        for (const [a, b] of pairs) {
            if (a < b) { push(mk('sameRow', [a, b])); push(mk('sameCol', [a, b])); }
            push(mk('above', [a, b]));
            push(mk('leftRow', [a, b]));
        }
    }
    return out;
}

// ---------------------------------------------------------------- Russian texts

export const GROUP_NAMES = ['Альфа', 'Бета', 'Гамма'];
export const COLOR_NAMES = [
    { adj: 'синяя', plural: 'синих', short: 'синий' },
    { adj: 'красная', plural: 'красных', short: 'красный' },
    { adj: 'зелёная', plural: 'зелёных', short: 'зелёный' },
];
const ORD_NOM = ['первый', 'второй', 'третий', 'четвёртый', 'пятый', 'шестой', 'седьмой', 'восьмой'];
const subj = (s: string) => `<span class="subject">${s}</span>`;

function people(k: number): string {
    const a = k % 10;
    const b = k % 100;
    if (b >= 11 && b <= 14) return `${k} человек`;
    if (a === 1) return `${k} человек`;
    if (a >= 2 && a <= 4) return `${k} человека`;
    return `${k} человек`;
}

export function clueText(ws: WorldSet, c: Clue, names: readonly string[]): string {
    const N = (i: number) => subj(names[c.args[i]]);
    void ws;
    switch (c.kind) {
        case 'left': return `${N(0)} левее ${N(1)}`;
        case 'immLeft': return `${N(0)} сразу слева от ${N(1)}`;
        case 'adj': return `${N(0)} и ${N(1)} рядом`;
        case 'notAdj': return `${N(0)} и ${N(1)} не рядом`;
        case 'end': return `${N(0)} с краю`;
        case 'notEnd': return `${N(0)} не с краю`;
        case 'pos': return `${N(0)} — ${ORD_NOM[c.p!]} слева`;
        case 'between': return `${N(0)} между ${N(1)} и ${N(2)}`;
        case 'closer': return `${N(0)} ближе к ${N(1)}, чем к ${N(2)}`;
        case 'sides': return `${N(0)} и ${N(1)} по разные стороны от ${N(2)}`;
        case 'oneNext': return `Рядом с ${N(0)} ровно один из ${N(1)} и ${N(2)}`;
        case 'gap': return `Между ${N(0)} и ${N(1)} — ${people(c.p!)}`;
        case 'ifEndThenAdj': return `Если ${N(0)} с краю, то ${N(1)} рядом с ${N(2)}`;
        case 'same': return `${N(0)} и ${N(1)} в одной группе`;
        case 'diff': return `${N(0)} и ${N(1)} в разных группах`;
        case 'in': return `${N(0)} в группе ${GROUP_NAMES[c.p!]}`;
        case 'notIn': return `${N(0)} не в группе ${GROUP_NAMES[c.p!]}`;
        case 'ifInThenIn': return `Если ${N(0)} в группе ${GROUP_NAMES[c.p!]}, то ${N(1)} в группе ${GROUP_NAMES[c.p2!]}`;
        case 'countIn': return `В группе ${GROUP_NAMES[c.p!]} ровно двое из ${N(0)}, ${N(1)} и ${N(2)}`;
        case 'color': return `У ${N(0)} ${COLOR_NAMES[c.p!].adj} шапка`;
        case 'notColor': return `У ${N(0)} не ${COLOR_NAMES[c.p!].adj} шапка`;
        case 'countColor': {
            const k = c.p2!;
            const col = COLOR_NAMES[c.p!];
            const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
            if (k === 1) return `${cap(col.adj)} шапка ровно у одного участника`;
            return `${cap(col.plural)} шапок ровно ${['', 'одна', 'две', 'три', 'четыре'][k] ?? k}`;
        }
        case 'sameRow': return `${N(0)} и ${N(1)} в одном ряду`;
        case 'sameCol': return `${N(0)} и ${N(1)} в одном столбце`;
        case 'above': return `${N(0)} выше ${N(1)} (столбец любой)`;
        case 'leftRow': return `${N(0)} левее ${N(1)} в том же ряду`;
        default: throw new Error('No Russian text for ' + c.kind);
    }
}

/** «ВОЛ стоит третьим», «у ВОЛ синяя шапка», «ВОЛ в группе Бета», «ВОЛ в клетке: ряд 2, столбец 3». */
export function factText(ws: WorldSet, e: number, a: number, v: number, names: readonly string[]): string {
    const N = subj(names[e]);
    if (a === 1) return `у ${N} ${COLOR_NAMES[v].adj} шапка`;
    switch (ws.kind) {
        case 'line':
        case 'lineAttr': return `${N} — ${ORD_NOM[v]} слева`;
        case 'circle': return `${N} на месте ${v + 1}`;
        case 'groups': return `${N} в группе ${GROUP_NAMES[v]}`;
        case 'grid': return `${N} в клетке: ряд ${Math.floor(v / 3) + 1}, столбец ${(v % 3) + 1}`;
    }
}
