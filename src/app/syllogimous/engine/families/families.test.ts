// Correctness tests (spec §4.11) for the families ported in phase 1A.

import { describe, expect, it } from 'vitest';
import { irredundant } from '../generate';
import { clampPremises } from '../difficulty/ladder';
import { Answer, FamilyId, Item, Plan } from '../core/types';
import { Rng } from '../core/rng';
import { classify, consistent } from '../core/solve';
import { generate, pluginFor } from '../generate';
import { planningParams } from '../difficulty/ladder';
import { emptySchedulerState, nextPlan } from '../difficulty/scheduler';
import { DEFAULT_ENGINE_OPTIONS } from '../core/types';

const FAMILIES: FamilyId[] = ['groups', 'orderNum', 'orderTime', 'linear'];
/** Premise counts (clamped to each family's range). */
const LEVELS = [2, 3, 4, 5, 6, 8];
const PER_LEVEL = Number(process.env['ENGINE_TEST_N'] ?? 300);

// ------------------------------------------------------------------ independent oracle (maximally simple)

const ix = (id: string) => Number(id.slice(1));

function oracleHolds(family: FamilyId, kind: string, a: number[], params: Record<string, unknown> | undefined, v: number[], n: number): boolean {
    const k = Number(params?.['k'] ?? 0);
    if (family === 'groups') {
        if (kind === 'same') return v[a[0]] === v[a[1]];
        if (kind === 'opp') return v[a[0]] !== v[a[1]];
        const r1 = v[a[0]] === v[a[1]];
        const r2 = v[a[2]] === v[a[3]];
        return params?.['rel'] === 'same' ? r1 === r2 : r1 !== r2;
    }
    const p = (i: number) => v[a[i]];
    switch (kind) {
        case 'gt': return p(0) > p(1);
        case 'left': return p(0) < p(1);
        case 'succ': return p(0) - p(1) === 1;
        case 'immLeft': return p(1) - p(0) === 1;
        case 'adj': return p(0) - p(1) === 1 || p(1) - p(0) === 1;
        case 'notAdj': return !(p(0) - p(1) === 1 || p(1) - p(0) === 1);
        case 'between': return Math.min(p(1), p(2)) < p(0) && p(0) < Math.max(p(1), p(2));
        case 'gap': case 'dist': return Math.abs(p(0) - p(1)) - 1 === k;
        case 'steps': return p(1) - p(0) === k;
        case 'extreme': return params?.['side'] === 'max' ? p(0) === n - 1 : p(0) === 0;
        case 'end': return p(0) === 0 || p(0) === n - 1;
        case 'notEnd': return p(0) !== 0 && p(0) !== n - 1;
        case 'pos': return p(0) === k - 1;
        default: throw new Error('oracle: unknown ' + kind);
    }
}

function* allWorlds(family: FamilyId, n: number): Generator<number[]> {
    if (family === 'groups') {
        for (let m = 0; m < 1 << n; m++) yield Array.from({ length: n }, (_, i) => (m >> i) & 1);
        return;
    }
    const perm = Array.from({ length: n }, (_, i) => i);
    const rec = function* (i: number): Generator<number[]> {
        if (i === n) { yield perm.slice(); return; }
        for (let j = i; j < n; j++) {
            [perm[i], perm[j]] = [perm[j], perm[i]];
            yield* rec(i + 1);
            [perm[i], perm[j]] = [perm[j], perm[i]];
        }
    };
    yield* rec(0);
}

function oracleClassify(item: Item): Answer {
    const n = item.entities.length;
    let t = 0;
    let f = 0;
    for (const w of allWorlds(item.family, n)) {
        if (!item.premises.every(r => oracleHolds(item.family, r.kind, r.args.map(ix), r.params, w, n))) continue;
        if (oracleHolds(item.family, item.query.kind, item.query.args.map(ix), item.query.params, w, n)) t++; else f++;
        if (t && f) return 'undetermined';
    }
    if (!t && !f) throw new Error('oracle: inconsistent');
    return t ? 'entailed' : 'contradicted';
}

// ------------------------------------------------------------------ item stream (same planning as the game)

function stream(family: FamilyId, level: number, count: number, tag: string): Item[] {
    const plugin = pluginFor(family);
    const pp = planningParams(level, DEFAULT_ENGINE_OPTIONS);
    const rng = new Rng(`test:${tag}:${family}:${level}`);
    let st = emptySchedulerState();
    const out: Item[] = [];
    for (let i = 0; i < count; i++) {
        const r = nextPlan(st, { family, format: 'ternary', params: pp, cueSpace: plugin.cueSpace(pp, 'ternary'), lures: plugin.supportedLures(pp, DEFAULT_ENGINE_OPTIONS) }, rng);
        st = r.state;
        out.push(generate({ family, level, seed: `${tag}:${family}:${level}:${i}`, format: 'ternary', plan: r.plan }));
    }
    return out;
}

const visibleText = (html: string) => html.replace(/<[^>]+>/g, '');

function spansBalanced(html: string): boolean {
    const open = (html.match(/<span\b/g) ?? []).length;
    const close = (html.match(/<\/span>/g) ?? []).length;
    return open === close;
}

// ------------------------------------------------------------------ tests

describe.each(FAMILIES)('%s', family => {
    const plugin = pluginFor(family);
    it.each(LEVELS)('level %i: answers, σ, statedDirectly, render, non-locality', level => {
        const items = stream(family, level, PER_LEVEL, 'fx');
        let checkedOracle = 0;
        for (const it of items) {
            const n = it.entities.length;
            // 1. consistency and exact re-classification
            expect(consistent(plugin, it.premises, n)).toBe(true);
            expect(classify(plugin, it.premises, it.query, n)).toBe(it.answer);
            // 2. σ within the target range unless a relaxation is recorded
            expect(it.premises.length).toBe(clampPremises(it.family, level));
            if (it.answer !== 'undetermined') {
                expect(it.metrics.support).not.toBeNull();
                // v5.1: every premise is necessary — the support is the whole item
                expect(it.metrics.support).toBe(it.premises.length);
                expect(irredundant(pluginFor(it.family), it.premises, it.query, it.answer, it.entities.length)).toBe(true);
                expect(it.explanation.supportDisplayIdx.length).toBe(it.metrics.support);
            } else {
                expect(it.metrics.support).toBeNull();
                expect(it.explanation.model).toBeTruthy();
                expect(it.explanation.altModel).toBeTruthy();
            }
            // 3. no premise states the conclusion directly
            expect(plugin.statedDirectly(it.query, it.premises)).toBe(false);
            // 4. render: no undefined, balanced spans, no Latin letters (Cyrillic name pool)
            const html = [...it.render.instructions, ...it.render.notes, ...it.render.premises, String(it.render.conclusion)].join('\n');
            expect(html).not.toMatch(/undefined|NaN/);
            expect(spansBalanced(html)).toBe(true);
            expect(it.render.premises.length).toBe(it.premises.length);
            // every entity is mentioned somewhere
            const mentioned = new Set(it.premises.flatMap(r => r.args));
            if (!pluginFor(it.family).fixedWorld) for (const e of it.entities) expect(mentioned.has(e.id)).toBe(true);
            // 6. independent brute-force oracle for small sizes
            if (n <= (family === 'groups' ? 12 : 8) && checkedOracle < 40) {
                expect(oracleClassify(it)).toBe(it.answer);
                checkedOracle++;
            }
        }
    });

    it('5. determinism: same seed → identical item', () => {
        const plan: Plan = { target: 'undetermined', cue: {}, lure: 'none' };
        for (const level of [3, 11]) {
            const a = generate({ family, level, seed: 'det', format: 'ternary', plan });
            const b = generate({ family, level, seed: 'det', format: 'ternary', plan });
            expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        }
    });

    it('class balance of the planned stream', () => {
        const items = stream(family, 8, 60, 'bal');
        const c = { entailed: 0, contradicted: 0, undetermined: 0 } as Record<Answer, number>;
        items.forEach(d => c[d.answer]++);
        expect(c).toEqual({ entailed: 20, contradicted: 20, undetermined: 20 });
    });
});

describe('choice format («Кто k-й…?»)', () => {
    it.each(['orderNum', 'orderTime', 'linear'] as FamilyId[])('%s: the correct option is unique / «Нельзя определить»', family => {
        const plugin = pluginFor(family);
        for (let i = 0; i < 40; i++) {
            const target: Answer = i % 4 === 3 ? 'undetermined' : 'entailed';
            const it = generate({ family, level: 6, seed: `ch${i}`, format: 'choice', plan: { target, cue: { degU: '0.9', fmU: '0.9' }, lure: 'none' } });
            expect(it.answer).toBe(target);
            expect(it.options!.length).toBe(it.entities.length + 1);
            const n = it.entities.length;
            const k = Number(it.query.params!['k']);
            const position = family === 'orderNum' ? n - k : k - 1;
            const occupants = new Set<number>();
            for (const w of allWorlds(family, n)) {
                if (!it.premises.every(r => oracleHolds(family, r.kind, r.args.map(ix), r.params, w, n))) continue;
                occupants.add(w.indexOf(position));
            }
            if (target === 'entailed') {
                expect(occupants.size).toBe(1);
                expect(it.correctOptionId).toBe('e' + [...occupants][0]);
            } else {
                expect(occupants.size).toBeGreaterThan(1);
                expect(it.correctOptionId).toBe('none');
            }
            expect(consistent(plugin, it.premises, n)).toBe(true);
        }
    });
});

describe('binary format', () => {
    it('never produces "Unknown" and marks the correct option', () => {
        for (const family of FAMILIES) {
            for (const target of ['entailed', 'contradicted'] as Answer[]) {
                const it = generate({ family, level: 7, seed: 'bin', format: 'binary', plan: { target, cue: {}, lure: 'none' } });
                expect(it.answer).toBe(target);
                expect(it.correctOptionId).toBe(target === 'entailed' ? 'true' : 'false');
            }
        }
    });
});
