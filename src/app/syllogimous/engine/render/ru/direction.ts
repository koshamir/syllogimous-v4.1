// Russian texts for «Направления 2D» / «Направления 3D» / «Пространство и время».
// Fix of the v4.1 bug (§4.7): when only one axis of a diagonal is inverted, the diagonal is rendered as two
// components and only the inverted one is red.

import { Rng } from '../../core/rng';
import { DraftItem, ItemRender, LevelParams, Premise, Query } from '../../core/types';
import { Rel, idx } from '../../families/plugin';
import { AXES, Axis, Code, codeOf } from '../../families/dcs';
import { NOTE_INVERSION, inv, pluralRu, subj } from './common';

export type DirMode = 'dir2d' | 'dir3dSpace' | 'dir3dTime';

const CMP: Record<Axis, [string, string]> = {
    x: ['восточнее', 'западнее'],
    y: ['севернее', 'южнее'],
    z: ['выше', 'ниже'],
};
const CMP_TIME_Z: [string, string] = ['позже', 'раньше'];
const DAT: Record<'x' | 'y', [string, string]> = { x: ['к востоку', 'к западу'], y: ['к северу', 'к югу'] };
const DIAG_CMP: Record<string, string> = { gg: 'северо-восточнее', gl: 'северо-западнее', lg: 'юго-восточнее', ll: 'юго-западнее' };
const DIAG_DAT: Record<string, string> = { gg: 'к северо-востоку', gl: 'к северо-западу', lg: 'к юго-востоку', ll: 'к юго-западу' };

const neg = (c: Code): Code => (c === 'g' ? 'l' : c === 'l' ? 'g' : c === 'a' ? 'a' : -c);
const sgn = (c: Code): 'g' | 'l' | null => (c === 'g' || (typeof c === 'number' && c > 0) ? 'g' : c === 'l' || (typeof c === 'number' && c < 0) ? 'l' : null);
const flip = (s: 'g' | 'l') => (s === 'g' ? 'l' : 'g');

export const dirAxes = (mode: DirMode): Axis[] => (mode === 'dir2d' ? ['x', 'y'] : ['x', 'y', 'z']);

/** Presentation: subject swap `w`, per-axis inversions ix/iy/iz (only on axes with a direction). */
export function decorateDir(mode: DirMode, d: DraftItem, rng: Rng, p: LevelParams): void {
    const axes = dirAxes(mode);
    const deco = <T extends Rel>(r: T, isQuery: boolean): T => {
        const params: Record<string, number | string | boolean> = { ...(r.params ?? {}), w: rng.int(2) };
        let any = false;
        if (p.negationRate > 0) {
            for (const ax of axes) {
                if (sgn(codeOf(r, ax)) && rng.chance(p.negationRate)) { params['i' + ax] = true; any = true; }
            }
        }
        if (isQuery) return { ...r, params };
        return { ...r, params, inverted: any || undefined };
    };
    d.premises = d.premises.map(r => deco(r, false) as Premise);
    d.query = deco(d.query, true) as Query;
}

function word(mode: DirMode, ax: Axis, s: 'g' | 'l', inverted: boolean): string {
    const pair = ax === 'z' && mode === 'dir3dTime' ? CMP_TIME_Z : CMP[ax];
    const shown = inverted ? flip(s) : s;
    return inv(pair[shown === 'g' ? 0 : 1], inverted);
}

function unit(mode: DirMode, ax: Axis, k: number): string {
    if (ax !== 'z') return pluralRu(k, 'шаг', 'шага', 'шагов');
    return mode === 'dir3dTime' ? pluralRu(k, 'час', 'часа', 'часов') : pluralRu(k, 'уровень', 'уровня', 'уровней');
}

const listAnd = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} и ${xs[xs.length - 1]}`);

/** Sentence for dir(a, b) = "a relative to b". */
export function dirSentence(mode: DirMode, r: Rel, names: readonly string[]): string {
    const axes = dirAxes(mode);
    const swap = Number(r.params?.['w'] ?? 0) === 1;
    const A = subj(names[idx(r.args[swap ? 1 : 0])]);
    const B = subj(names[idx(r.args[swap ? 0 : 1])]);
    const code = (ax: Axis): Code => (swap ? neg(codeOf(r, ax)) : codeOf(r, ax));
    const isInv = (ax: Axis) => !!r.params?.['i' + ax];
    const t = String(r.params?.['t'] ?? 'qual');
    const has3 = axes.length === 3;

    if (t === 'adj') {
        const sy = sgn(code('y'));
        const sx = sgn(code('x'));
        const mixed = sy && sx && isInv('x') !== isInv('y');
        if (!mixed) {
            const I = (sy ? isInv('y') : false) || (sx ? isInv('x') : false);
            const ds = (s: 'g' | 'l') => (I ? flip(s) : s);
            const dir = sy && sx ? DIAG_DAT[ds(sy) + ds(sx)] : sy ? DAT.y[ds(sy) === 'g' ? 0 : 1] : DAT.x[ds(sx!) === 'g' ? 0 : 1];
            return `${A} вплотную ${inv(dir, I)} от ${B}`;
        }
        // mixed inversion on a diagonal: two components
    }
    if (t === 'adj' || t === 'exact') {
        const parts: string[] = [];
        const dy = Number(code('y'));
        const dx = Number(code('x'));
        const strict = (dx === 0) !== (dy === 0);
        for (const ax of ['y', 'x'] as const) {
            const v = ax === 'y' ? dy : dx;
            if (v === 0) continue;
            const s = v > 0 ? 'g' : 'l';
            parts.push(`на ${Math.abs(v)} ${strict ? 'строго ' : ''}${word(mode, ax, s, isInv(ax))}`);
        }
        let dz = 0;
        if (has3) {
            dz = Number(code('z'));
            if (dz !== 0) parts.push(`на ${Math.abs(dz)} ${unit(mode, 'z', Math.abs(dz))} ${word(mode, 'z', dz > 0 ? 'g' : 'l', isInv('z'))}`);
        }
        if (!parts.length) {
            return mode === 'dir3dTime' ? `${A} в том же месте и в то же время, что и ${B}`
                : mode === 'dir3dSpace' ? `${A} в той же точке, что и ${B}` : `${A} в той же клетке, что и ${B}`;
        }
        let s = `${A} ${listAnd(parts)} ${B}`;
        if (has3 && dx === 0 && dy === 0) s += ', в той же клетке на карте';
        if (has3 && dz === 0) s += mode === 'dir3dTime' ? ', в то же время' : ', на том же уровне';
        return s;
    }
    // qualitative
    const cy = code('y');
    const cx = code('x');
    const cz = has3 ? code('z') : 'a';
    const sy = sgn(cy);
    const sx = sgn(cx);
    const comps: string[] = [];
    if (sy && sx) {
        if (isInv('x') === isInv('y')) {
            const I = isInv('x');
            comps.push(inv(DIAG_CMP[(I ? flip(sy) : sy) + (I ? flip(sx) : sx)], I));
        } else {
            comps.push(word(mode, 'y', sy, isInv('y')), word(mode, 'x', sx, isInv('x')));
        }
    } else if (sy) {
        comps.push((cx === 0 ? 'строго ' : '') + word(mode, 'y', sy, isInv('y')));
    } else if (sx) {
        comps.push((cy === 0 ? 'строго ' : '') + word(mode, 'x', sx, isInv('x')));
    }
    const sz = sgn(cz);
    if (sz) comps.push(word(mode, 'z', sz, isInv('z')));
    if (comps.length) return `${A} ${comps.join(' и ')} ${B}`;
    // equalities only («на одной вертикали / горизонтали / на одном уровне / одновременно»)
    if (cx === 0) return `${A} и ${B} на одной вертикали`;
    if (cy === 0) return `${A} и ${B} на одной горизонтали`;
    if (cz === 0) return mode === 'dir3dTime' ? `${A} и ${B} в одно и то же время` : `${A} и ${B} на одном уровне`;
    throw new Error('Empty direction relation');
}

export function renderDir(mode: DirMode, d: DraftItem): ItemRender {
    const names = d.entities.map(e => e.name);
    const notes = ['«Строго севернее» — точно над (та же вертикаль); просто «севернее» — выше по карте, левее или правее — неважно. Числа — шаги по клеткам.'];
    if (d.premises.some(r => r.inverted) || AXES.some(ax => d.query.params?.['i' + ax])) notes.push(NOTE_INVERSION);
    return {
        instructions: [],
        notes,
        premises: d.displayOrder.map(i => dirSentence(mode, d.premises[i], names)),
        conclusion: dirSentence(mode, d.query, names),
    };
}

/** Mini-map: an HTML table per level (north at the top). */
export function describeDir(mode: DirMode, vals: ArrayLike<number>, names: readonly string[]): string {
    const n = names.length;
    const X = (e: number) => vals[e * 3];
    const Y = (e: number) => vals[e * 3 + 1];
    const Z = (e: number) => vals[e * 3 + 2];
    const xs = names.map((_, e) => X(e));
    const ys = names.map((_, e) => Y(e));
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const levels = mode === 'dir2d' ? [0] : [...new Set(names.map((_, e) => Z(e)))].sort((a, b) => b - a);
    const out: string[] = [];
    for (const z of levels) {
        const rows: string[] = [];
        for (let y = y1; y >= y0; y--) {
            const cells: string[] = [];
            for (let x = x0; x <= x1; x++) {
                const here = Array.from({ length: n }, (_, e) => e).filter(e => X(e) === x && Y(e) === y && (mode === 'dir2d' || Z(e) === z));
                cells.push(`<td>${here.map(e => names[e]).join('/') || '·'}</td>`);
            }
            rows.push(`<tr>${cells.join('')}</tr>`);
        }
        const label = mode === 'dir2d' ? '' : mode === 'dir3dTime' ? `<div>Время ${z >= 0 ? '+' : ''}${z} ч</div>` : `<div>Уровень ${z >= 0 ? '+' : ''}${z}</div>`;
        out.push(`${label}<table class="v5-map">${rows.join('')}</table>`);
    }
    return out.join('');
}
