// Correctness tests (spec §4.11) for the phase 5 families, with independent brute-force oracles written from the
// task semantics (not from the enumerated-world kits): 3ⁿ group labelings, 2ⁿ lamp states, parent arrays,
// n!·2ⁿ rows with facings.

import { describe, expect, it } from 'vitest';
import { irredundant } from '../generate';
import { clampPremises } from '../difficulty/ladder';
import { Answer, DEFAULT_ENGINE_OPTIONS, FamilyId, Item, Plan } from '../core/types';
import { Rng } from '../core/rng';
import { classify, consistent } from '../core/solve';
import { generate, pluginFor } from '../generate';
import { planningParams } from '../difficulty/ladder';
import { emptySchedulerState, nextPlan } from '../difficulty/scheduler';

const FAMILIES: FamilyId[] = ['groups3', 'conditional', 'hierarchy', 'perspective'];
/** Premise counts (clamped to each family's range). */
const LEVELS = [2, 3, 4, 5, 6, 8];
const PER_LEVEL = Number(process.env['ENGINE_TEST_N'] ?? 300);
const ix = (id: string) => Number(id.slice(1));

type R = { kind: string; args: string[]; params?: Record<string, number | string | boolean> };

function holds(family: FamilyId, r: R, v: number[], f: number[]): boolean {
    const [a, b] = r.args.map(ix);
    const P = r.params ?? {};
    switch (family) {
        case 'groups3': return r.kind === 'same' ? v[a] === v[b] : v[a] !== v[b];
        case 'conditional': {
            const lit = (x: number, s: unknown) => v[x] === Number(s ?? 1);
            switch (r.kind) {
                case 'fact': case 'lit': return lit(a, P['s']);
                case 'imp': return !lit(a, P['pa']) || lit(b, P['pb']);
                case 'or': return v[a] === 1 || v[b] === 1;
                case 'nand': return !(v[a] === 1 && v[b] === 1);
                case 'xor': return v[a] !== v[b];
                case 'iff': return v[a] === v[b];
            }
            throw new Error(r.kind);
        }
        case 'hierarchy': {
            const n = v.length;
            const anc = (x: number, y: number) => { let z = v[x]; for (let s = 0; s < n && z >= 0; s++) { if (z === y) return true; z = v[z]; } return false; };
            switch (r.kind) {
                case 'part': return anc(a, b);
                case 'notPart': return !anc(a, b);
                case 'direct': return v[a] === b;
                case 'sibling': return v[a] === v[b] && v[a] >= 0;
                case 'root': return v[a] < 0;
            }
            throw new Error(r.kind);
        }
        case 'perspective': {
            // v = positions (left → right for you), f = 1 facing you
            const rightOfA = (x: number) => (f[a] ? v[x] < v[a] : v[x] > v[a]);
            switch (r.kind) {
                case 'right': return rightOfA(b);
                case 'left': return !rightOfA(b) && b !== a;
                case 'youLeft': return v[a] < v[b];
                case 'sameDir': return f[a] === f[b];
                case 'diffDir': return f[a] !== f[b];
                case 'facing': return f[a] === 1;
                case 'back': return f[a] === 0;
            }
            throw new Error(r.kind);
        }
        default: throw new Error(family);
    }
}

function* assignments(family: FamilyId, n: number): Generator<[number[], number[]]> {
    const none: number[] = [];
    if (family === 'groups3' || family === 'conditional') {
        const base = family === 'groups3' ? 3 : 2;
        const v = new Array(n).fill(0);
        for (let code = 0; code < base ** n; code++) {
            let x = code;
            for (let e = 0; e < n; e++) { v[e] = x % base; x = Math.floor(x / base); }
            yield [v.slice(), none];
        }
    } else if (family === 'hierarchy') {
        const v = new Array(n).fill(-1);
        const rec = function* (e: number): Generator<[number[], number[]]> {
            if (e === n) {
                for (let s = 0; s < n; s++) { let z = v[s]; for (let t = 0; t <= n && z >= 0; t++) { if (z === s) return; z = v[z]; } }
                yield [v.slice(), none];
                return;
            }
            for (let p = -1; p < n; p++) { if (p === e) continue; v[e] = p; yield* rec(e + 1); }
        };
        yield* rec(0);
    } else {
        const v = Array.from({ length: n }, (_, i) => i);
        const perm = function* (k: number): Generator<number[]> {
            if (k === n) { yield v.slice(); return; }
            for (let i = k; i < n; i++) { [v[k], v[i]] = [v[i], v[k]]; yield* perm(k + 1); [v[k], v[i]] = [v[i], v[k]]; }
        };
        for (const p of perm(0)) for (let m = 0; m < 1 << n; m++) yield [p, Array.from({ length: n }, (_, e) => (m >> e) & 1)];
    }
}

function oracle(it: Item): Answer {
    const n = it.entities.length;
    let yes = 0;
    let no = 0;
    for (const [v, f] of assignments(it.family, n)) {
        if (!it.premises.every(r => holds(it.family, r, v, f))) continue;
        if (holds(it.family, it.query, v, f)) yes++; else no++;
        if (yes && no) return 'undetermined';
    }
    if (!yes && !no) throw new Error('oracle: inconsistent');
    return yes ? 'entailed' : 'contradicted';
}

function stream(family: FamilyId, level: number, count: number): Item[] {
    const plugin = pluginFor(family);
    const pp = planningParams(level, DEFAULT_ENGINE_OPTIONS);
    const rng = new Rng(`t5:${family}:${level}`);
    let st = emptySchedulerState();
    const out: Item[] = [];
    for (let i = 0; i < count; i++) {
        const r = nextPlan(st, { family, format: 'ternary', params: pp, cueSpace: plugin.cueSpace(pp, 'ternary'), lures: plugin.supportedLures(pp, DEFAULT_ENGINE_OPTIONS) }, rng);
        st = r.state;
        out.push(generate({ family, level, seed: `t5:${family}:${level}:${i}`, format: 'ternary', plan: r.plan }));
    }
    return out;
}

const visibleText = (html: string) => html.replace(/<[^>]+>/g, '');
const spansBalanced = (html: string) => (html.match(/<span\b/g) ?? []).length === (html.match(/<\/span>/g) ?? []).length;

describe.each(FAMILIES)('%s', family => {
    const plugin = pluginFor(family);
    it.each(LEVELS)('level %i: answers (oracle), σ, statedDirectly, render, non-locality', level => {
        let checked = 0;
        for (const it of stream(family, level, PER_LEVEL)) {
            const n = it.entities.length;
            expect(consistent(plugin, it.premises, n)).toBe(true);
            expect(classify(plugin, it.premises, it.query, n)).toBe(it.answer);
            if (checked < (family === 'perspective' ? 15 : 60)) { expect(oracle(it)).toBe(it.answer); checked++; }
            expect(it.premises.length).toBe(clampPremises(it.family, level));
            if (it.answer !== 'undetermined') {
                // v5.1: every premise is necessary — the support is the whole item
                expect(it.metrics.support).toBe(it.premises.length);
                expect(irredundant(pluginFor(it.family), it.premises, it.query, it.answer, it.entities.length)).toBe(true);
            }
            expect(plugin.statedDirectly(it.query, it.premises)).toBe(false);
            const html = [...it.render.instructions, ...it.render.notes, ...it.render.premises, String(it.render.conclusion)].join('\n');
            expect(html).not.toMatch(/undefined|NaN/);
            expect(spansBalanced(html)).toBe(true);
            const mentioned = new Set([...it.premises.flatMap(r => r.args), ...it.query.args]);
            if (!pluginFor(it.family).fixedWorld) for (const e of it.entities) expect(mentioned.has(e.id)).toBe(true);
        }
    });

    it('determinism: same seed → identical item', () => {
        const plan: Plan = { target: 'entailed', cue: {}, lure: 'none' };
        for (const level of [3, 11]) {
            expect(JSON.stringify(generate({ family, level, seed: 'det', format: 'ternary', plan })))
                .toBe(JSON.stringify(generate({ family, level, seed: 'det', format: 'ternary', plan })));
        }
    });
});
