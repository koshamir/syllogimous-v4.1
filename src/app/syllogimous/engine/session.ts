// One step of a training session (spec §4.8, §6.1): family → format → plan → item, with the fingerprint window.
// Pure: the Angular EngineService stores the state and passes it back in.

import { Rng } from './core/rng';
import { AnswerFormat, DEFAULT_ENGINE_OPTIONS, EngineOptions, FamilyId, Item } from './core/types';
import { DIRECT, generate, pluginFor } from './generate';
import { clampPremises, planningParams } from './difficulty/ladder';
import { SchedulerState, nextPlan, pickFamily, pushHistory, seenFingerprint } from './difficulty/scheduler';

export interface SessionRequest {
    /** Enabled ported families (≥ 1). */
    enabled: FamilyId[];
    /** Current level per family: its integer part is the number of premises. */
    levels: Partial<Record<FamilyId, number>>;
    /** Answer format from the settings. */
    format: 'ternary' | 'binary';
    options?: Partial<EngineOptions>;
    sched: SchedulerState;
    /** `${sessionSeed}:${counter}` */
    seed: string;
    prevNames?: string[];
    /** Share of «Кто k-й…?» items in families that support them (default 0.2). */
    choiceShare?: number;
}

export interface SessionResult {
    item: Item;
    sched: SchedulerState;
    family: FamilyId;
    level: number;
}

/** Format for a family: «Логические связки» — binary; graphs alternate iso / map; ≤ 20 % choice items. */
export function formatFor(family: FamilyId, req: Pick<SessionRequest, 'format' | 'choiceShare'>, level: number, sched: SchedulerState, rng: Rng):
    { format: AnswerFormat; sched: SchedulerState } {
    if (family === 'binary') return { format: 'binary', sched };
    if (family === 'graph') {
        const t = sched.graphToggle ?? 0;
        return { format: t % 2 === 0 ? 'binary' : 'choice', sched: { ...sched, graphToggle: t + 1 } };
    }
    if (req.format === 'binary') return { format: 'binary', sched };
    const plugin = pluginFor(family);
    if (plugin.constructChoice && level >= 3 && rng.chance(req.choiceShare ?? 0.2)) return { format: 'choice', sched };
    return { format: 'ternary', sched };
}

export function nextItem(req: SessionRequest): SessionResult {
    if (!req.enabled.length) throw new Error('No enabled families');
    const o: EngineOptions = { ...DEFAULT_ENGINE_OPTIONS, ...req.options };
    const rng = new Rng(`${req.seed}:session`);
    const family = pickFamily(req.levels, req.enabled, req.sched.history, rng);
    const level = clampPremises(family, req.levels[family] ?? 2);
    const f = formatFor(family, req, level, req.sched, rng);
    let sched = f.sched;
    const pp = planningParams(level, o);
    const direct = DIRECT[family];
    const plugin = direct ? null : pluginFor(family);
    const r = nextPlan(sched, {
        family,
        format: f.format,
        params: pp,
        cueSpace: direct ? direct.cueSpace(level, f.format, o) : f.format === 'choice' ? {} : plugin!.cueSpace(pp, f.format, o),
        lures: direct ? ['none'] : plugin!.supportedLures(pp, o),
    }, rng);
    sched = r.state;
    let item: Item | null = null;
    // fingerprint window: up to 3 regenerations with a new seed
    for (let t = 0; t <= 3; t++) {
        const it = generate({ family, level, seed: t ? `${req.seed}:f${t}` : req.seed, format: f.format, plan: r.plan, prevNames: req.prevNames, options: o });
        item = it;
        if (!seenFingerprint(sched, it.fingerprint)) break;
    }
    sched = pushHistory(sched, family, item!.fingerprint);
    return { item: item!, sched, family, level };
}
