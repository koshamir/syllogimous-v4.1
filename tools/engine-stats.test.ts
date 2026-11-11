// Developer probe (not part of the test suites): generation statistics per family and premise count.
// Run: npx vitest run --config vitest.stats.config.ts   (STATS_FAMILIES=a,b  STATS_N=60)

import { describe, it } from 'vitest';
import { Rng } from '../src/app/syllogimous/engine/core/rng';
import { Answer, AnswerFormat, DEFAULT_ENGINE_OPTIONS, FamilyId, Item } from '../src/app/syllogimous/engine/core/types';
import { PREMISE_RANGE, planningParams } from '../src/app/syllogimous/engine/difficulty/ladder';
import { DIRECT, ENGINE_FAMILIES, generate, pluginFor } from '../src/app/syllogimous/engine/generate';
import { emptySchedulerState, nextPlan } from '../src/app/syllogimous/engine/difficulty/scheduler';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const N = Number(env['STATS_N'] ?? 60);
const fams = (env['STATS_FAMILIES'] ? env['STATS_FAMILIES'].split(',') : ENGINE_FAMILIES) as FamilyId[];
const SHOW = Number(env['STATS_SHOW'] ?? 0);

const strip = (h: string) => h.replace(/<span class="is-negated">([^<]*)<\/span>/g, '[НЕ:$1]').replace(/<[^>]+>/g, '');

describe('stats', () => {
    for (const family of fams) {
        it(family, () => {
            const o = DEFAULT_ENGINE_OPTIONS;
            const [lo, hi] = PREMISE_RANGE[family];
            const lines: string[] = [];
            for (let P = lo; P <= hi; P++) {
                let sched = emptySchedulerState();
                const rng = new Rng(`stats:${family}:${P}`);
                const direct = DIRECT[family];
                const format: AnswerFormat = direct ? direct.formats[0] : 'ternary';
                const pp = planningParams(P, o);
                const cnt: Record<string, number> = {};
                const fails: Record<string, number> = {};
                let fail = 0, relax = 0, wrongP = 0, ms = 0, maxMs = 0;
                const shown: Item[] = [];
                for (let i = 0; i < N; i++) {
                    const r = nextPlan(sched, {
                        family, format, params: pp,
                        cueSpace: direct ? direct.cueSpace(P, format, o) : pluginFor(family).cueSpace(pp, format, o),
                        lures: direct ? ['none'] : pluginFor(family).supportedLures(pp, o),
                    }, rng);
                    sched = r.state;
                    const t0 = Date.now();
                    try {
                        const it = generate({ family, level: P, seed: `st:${family}:${P}:${i}`, format, plan: r.plan });
                        const dt = Date.now() - t0;
                        ms += dt; maxMs = Math.max(maxMs, dt);
                        cnt[it.answer] = (cnt[it.answer] ?? 0) + 1;
                        if (it.metrics.relaxations.length) relax++;
                        if (it.premises.length !== P) wrongP++;
                        if (shown.length < SHOW) shown.push(it);
                    } catch (e) {
                        fail++;
                        const key = `${r.plan.target}|${Object.values(r.plan.cue).join(',')}`;
                        fails[key] = (fails[key] ?? 0) + 1;
                        ms += Date.now() - t0;
                    }
                }
                const c = (a: Answer) => cnt[a] ?? 0;
                lines.push(`${family} P=${P}: E/C/U=${c('entailed')}/${c('contradicted')}/${c('undetermined')} fail=${fail} relax=${relax} wrongP=${wrongP} avg=${(ms / N).toFixed(1)}ms max=${maxMs}ms${fail ? ' FAILS ' + JSON.stringify(fails) : ''}`);
                for (const it of shown) {
                    lines.push(`   [${it.answer}] n=${it.entities.length} ${it.render.instructions.map(strip).join(' ')}`);
                    for (const s of it.render.premises) lines.push('      - ' + strip(s));
                    const cc = Array.isArray(it.render.conclusion) ? it.render.conclusion.join(' / ') : it.render.conclusion;
                    lines.push('      ? ' + strip(cc));
                }
            }
            console.log('\n' + lines.join('\n'));
        }, 600000);
    }
});
