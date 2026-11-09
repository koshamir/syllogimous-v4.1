// Generic exact solvers on top of a family's constraint semantics.

import { Answer } from './types';
import { Cons, Csp, SearchOptions, Vals, allModels, countModels, firstModel, satisfiable } from './combinatorics';
import { Rel, SolverPlugin, eid } from '../families/plugin';

export interface Constraint { rel: Rel; negate?: boolean }

export interface BuiltCsp { csp: Csp; ids: string[] }

/**
 * Builds a CSP. `scope` — entity ids to include (default: all mentioned, in first-mention order).
 * `full` — solve over the whole item (n positions) vs. a premise subset (family supportDomain rules).
 */
export function buildCsp(plugin: SolverPlugin, cons: readonly Constraint[], nFull: number, full: boolean, scope?: readonly string[]): BuiltCsp {
    const ids: string[] = scope ? scope.slice() : [];
    const index = new Map<string, number>();
    ids.forEach((id, i) => index.set(id, i));
    if (!scope) {
        for (const c of cons) for (const a of c.rel.args) if (!index.has(a)) { index.set(a, ids.length); ids.push(a); }
    }
    const rels = cons.map(c => c.rel);
    const dom = plugin.domain(rels, ids.length, nFull, full);
    const out: Cons[] = cons.map(c => {
        const vars = c.rel.args.map(a => {
            const v = index.get(a);
            if (v === undefined) throw new Error(`Entity ${a} outside scope`);
            return v;
        });
        const t = plugin.compile(c.rel, vars, dom.size);
        return { vars, test: c.negate ? (v: Vals) => !t(v) : t };
    });
    return { csp: { nVars: ids.length, domain: dom.size, allDiff: dom.allDiff, fixFirst: dom.fixFirst, cons: out }, ids };
}

export const allIds = (n: number): string[] => Array.from({ length: n }, (_, i) => eid(i));

const asCons = (rels: readonly Rel[]): Constraint[] => rels.map(rel => ({ rel }));

export function consistent(plugin: SolverPlugin, premises: readonly Rel[], n: number): boolean {
    if (plugin.custom) return plugin.custom.consistent(premises, n);
    return satisfiable(buildCsp(plugin, asCons(premises), n, true, allIds(n)).csp);
}

/** Exact ternary classification of `q` given all premises (full domain). */
export function classify(plugin: SolverPlugin, premises: readonly Rel[], q: Rel, n: number): Answer {
    if (plugin.custom) return plugin.custom.classify(premises, q, n, true);
    const base = asCons(premises);
    const ids = allIds(n);
    const canTrue = satisfiable(buildCsp(plugin, [...base, { rel: q }], n, true, ids).csp);
    const canFalse = satisfiable(buildCsp(plugin, [...base, { rel: q, negate: true }], n, true, ids).csp);
    if (!canTrue && !canFalse) throw new Error('Inconsistent premises');
    return canTrue && canFalse ? 'undetermined' : canTrue ? 'entailed' : 'contradicted';
}

/** Classification on a premise subset with the family's restricted-domain rule (§4.4). */
export function classifySubset(plugin: SolverPlugin, premises: readonly Rel[], q: Rel, nFull: number): Answer {
    if (plugin.custom) return plugin.custom.classify(premises, q, nFull, false);
    const full = plugin.supportDomain === 'full';
    const base = asCons(premises);
    const scope = full ? allIds(nFull) : undefined;
    const t = satisfiable(buildCsp(plugin, [...base, { rel: q }], nFull, full, scope).csp);
    const f = satisfiable(buildCsp(plugin, [...base, { rel: q, negate: true }], nFull, full, scope).csp);
    if (!t && !f) throw new Error('Inconsistent premise subset');
    return t && f ? 'undetermined' : t ? 'entailed' : 'contradicted';
}

/** Does the subset prove the answer (entailed: S ⊨ q; contradicted: S ⊨ ¬q)? */
export function subsetProves(plugin: SolverPlugin, premises: readonly Rel[], q: Rel, answer: Answer, nFull: number): boolean {
    if (plugin.custom) return plugin.custom.classify(premises, q, nFull, false) === answer;
    const full = plugin.supportDomain === 'full';
    const scope = full ? allIds(nFull) : undefined;
    const cons = [...asCons(premises), { rel: q, negate: answer === 'entailed' }];
    return !satisfiable(buildCsp(plugin, cons, nFull, full, scope).csp);
}

/** Models of all premises over all n entities (values indexed by entity index). */
export function models(plugin: SolverPlugin, premises: readonly Rel[], n: number, cap = 1 << 16): Vals[] {
    if (plugin.custom) throw new Error('models(): not available for families with a custom solver');
    return allModels(buildCsp(plugin, asCons(premises), n, true, allIds(n)).csp, cap);
}

export function modelCount(plugin: SolverPlugin, premises: readonly Rel[], n: number, cap = 1 << 16): number {
    if (plugin.custom) return Math.min(cap, 2 ** plugin.custom.log2Models(premises, n));
    return countModels(buildCsp(plugin, asCons(premises), n, true, allIds(n)).csp, cap);
}

/** log2 of the number of models, capped at 16 (spec §4.5). */
export function log2Models(plugin: SolverPlugin, premises: readonly Rel[], n: number): number {
    if (plugin.custom) return Math.min(16, plugin.custom.log2Models(premises, n));
    return Math.log2(Math.max(1, modelCount(plugin, premises, n, 1 << 16)));
}

/** One model of premises + extra constraints (values by entity index), or null. */
export function modelWith(plugin: SolverPlugin, premises: readonly Rel[], extra: readonly Constraint[], n: number, opts: SearchOptions = {}): Vals | null {
    if (plugin.custom) return plugin.custom.model(premises, extra, n, opts.rng);
    return firstModel(buildCsp(plugin, [...asCons(premises), ...extra], n, true, allIds(n)).csp, opts);
}
