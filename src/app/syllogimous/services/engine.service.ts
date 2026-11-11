import { Injectable } from "@angular/core";
import {
    ENGINE_FAMILIES, EngineOptions, FamilyId, FamilyLevel, Item, Outcome, PREMISE_RANGE, SchedulerState, emptySchedulerState,
    initialPremises, levelNotice, newFamilyLevel, nextItem, targetFor, updateLevel,
} from "../engine";
import { LS_TRAINING_UNIT } from "../constants/local-storage.constants";
import {
    DEFAULT_V5_SETTINGS, FAMILY_TYPE, LS_V5_LEVELS, LS_V5_PREMISES, LS_V5_PREMISE_HISTORY, LS_V5_SCHEDULER, LS_V5_SETTINGS, V5Settings,
} from "../constants/v5.constants";

export type LevelsState = Partial<Record<FamilyId, FamilyLevel>>;
export type LevelHistory = Record<string, Partial<Record<FamilyId, number>>>;

export interface NextRequest {
    enabled: FamilyId[];
    /** Playground: fixed levels, no staircase. */
    fixedLevels?: Partial<Record<FamilyId, number>>;
    options?: Partial<EngineOptions>;
    format?: 'ternary' | 'binary';
    prevNames?: string[];
}

const readJson = <T>(key: string, fallback: T): T => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
    } catch {
        return fallback;
    }
};

/**
 * The only bridge between the Angular layer and the pure engine (spec §6.1): stores settings, levels,
 * scheduler state and the daily level snapshot in localStorage, and prepares the next item in advance.
 */
@Injectable({ providedIn: "root" })
export class EngineService {
    private readonly sessionSeed = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    private counter = 0;
    private prepared?: { key: string; item: Item; sched: SchedulerState; family: FamilyId };

    get settings(): V5Settings {
        const s = readJson<V5Settings>(LS_V5_SETTINGS, { ...DEFAULT_V5_SETTINGS, v: undefined });
        if (s.v === 2) return s;
        // settings saved by v5.0: the new defaults replace what the redesign changed (names, step)
        const up: V5Settings = { ...s, v: 2, namePool: 'latin', step: 0.25, auto: true };
        localStorage.setItem(LS_V5_SETTINGS, JSON.stringify(up));
        return up;
    }

    saveSettings(s: Partial<V5Settings>) {
        localStorage.setItem(LS_V5_SETTINGS, JSON.stringify({ ...this.settings, ...s }));
        this.prepared = undefined;
    }

    /**
     * Premise count per family (the integer part of `level`). A family never played in v5.1 starts from its v5.0
     * level or its v4.1 training unit, otherwise from the family's minimum.
     */
    get levels(): LevelsState {
        const stored = readJson<LevelsState>(LS_V5_PREMISES, {});
        let changed = false;
        let old: LevelsState | null = null;
        for (const f of Object.keys(FAMILY_TYPE) as FamilyId[]) {
            if (stored[f]) continue;
            old = old ?? readJson<LevelsState>(LS_V5_LEVELS, {});
            const played = old[f]?.count ? old[f]!.level : null;
            stored[f] = newFamilyLevel(initialPremises(PREMISE_RANGE[f], played, this.oldPremises(f)));
            changed = true;
        }
        if (changed) localStorage.setItem(LS_V5_PREMISES, JSON.stringify(stored));
        return stored;
    }

    private oldPremises(f: FamilyId): number | null {
        try {
            const raw = localStorage.getItem(LS_TRAINING_UNIT + FAMILY_TYPE[f]);
            return raw ? Number(JSON.parse(raw).premises) || null : null;
        } catch {
            return null;
        }
    }

    levelOf(f: FamilyId): number {
        return this.levels[f]?.level ?? PREMISE_RANGE[f][0];
    }

    /** Premises of the next item of this family. */
    premisesOf(f: FamilyId): number {
        return Math.floor(this.levelOf(f));
    }

    /** The user sets the premise count by hand (settings). */
    setPremises(f: FamilyId, premises: number) {
        const [lo, hi] = PREMISE_RANGE[f];
        const levels = this.levels;
        const p = Math.max(lo, Math.min(hi, Math.round(premises)));
        levels[f] = { ...(levels[f] ?? newFamilyLevel(p)), level: p, notified: p };
        localStorage.setItem(LS_V5_PREMISES, JSON.stringify(levels));
        this.prepared = undefined;
    }

    get scheduler(): SchedulerState {
        return readJson(LS_V5_SCHEDULER, emptySchedulerState());
    }

    get levelHistory(): LevelHistory {
        return readJson<LevelHistory>(LS_V5_PREMISE_HISTORY, {});
    }

    engineOptions(extra?: Partial<EngineOptions>): Partial<EngineOptions> {
        const s = this.settings;
        return { negations: s.negations, metas: s.metas, namePool: s.namePool, nameMode: s.nameMode, ...extra };
    }

    static ported(enabled: readonly FamilyId[]): FamilyId[] {
        return enabled.filter(f => ENGINE_FAMILIES.includes(f));
    }

    private keyOf(req: NextRequest): string {
        return JSON.stringify([req.enabled, req.fixedLevels ?? null, req.options ?? null, req.format ?? null, this.settings]);
    }

    private build(req: NextRequest): { item: Item; sched: SchedulerState; family: FamilyId } {
        const enabled = EngineService.ported(req.enabled);
        const levels: Partial<Record<FamilyId, number>> = {};
        const st = this.levels;
        for (const f of enabled) levels[f] = req.fixedLevels?.[f] ?? st[f]?.level ?? PREMISE_RANGE[f][0];
        const r = nextItem({
            enabled,
            levels,
            format: req.format ?? this.settings.format,
            options: this.engineOptions(req.options),
            sched: this.scheduler,
            seed: `${this.sessionSeed}:${this.counter++}`,
            prevNames: req.prevNames,
        });
        return { item: r.item, sched: r.sched, family: r.family };
    }

    /** Next item (the prepared one when the request did not change). */
    next(req: NextRequest): Item {
        const key = this.keyOf(req);
        const got = this.prepared && this.prepared.key === key ? this.prepared : { key, ...this.build(req) };
        this.prepared = undefined;
        localStorage.setItem(LS_V5_SCHEDULER, JSON.stringify(got.sched));
        return got.item;
    }

    /** Generates the following item in the background (after the answer, while the result is shown). */
    prepare(req: NextRequest) {
        setTimeout(() => {
            try {
                this.prepared = { key: this.keyOf(req), ...this.build(req) };
            } catch (e) {
                console.warn("EngineService.prepare", e);
                this.prepared = undefined;
            }
        }, 0);
    }

    /** p for an item: three options — target; two — +0.05; choice among ≥ 4 — −0.05. */
    targetP(item: { format: Item['format']; options?: unknown[] }): number {
        const n = item.format === 'ternary' ? 3 : item.format === 'binary' ? 2 : (item.options?.length ?? 4);
        return targetFor(item.format, n, this.settings.targetAccuracy);
    }

    /**
     * Staircase update (regular game only, automatic adjustment on). Returns a notice when the premise count of
     * the family changed.
     */
    submit(family: FamilyId, outcome: Outcome, p: number): { from: number; to: number } | null {
        const levels = this.levels;
        const before = levels[family] ?? newFamilyLevel(PREMISE_RANGE[family][0]);
        const s = this.settings;
        let after = s.auto
            ? updateLevel(before, outcome, p, s.step, PREMISE_RANGE[family])
            : { ...before, count: before.count + 1, last20: [...before.last20, outcome].slice(-20) };
        const notice = levelNotice(after);
        if (notice.notify) after = { ...after, notified: notice.to };
        levels[family] = after;
        localStorage.setItem(LS_V5_PREMISES, JSON.stringify(levels));
        const today = new Date().toISOString().slice(0, 10);
        const hist = this.levelHistory;
        hist[today] = Object.fromEntries(Object.entries(levels).map(([f, st]) => [f, Math.round(st!.level * 100) / 100]));
        localStorage.setItem(LS_V5_PREMISE_HISTORY, JSON.stringify(hist));
        this.prepared = undefined;
        return notice.notify ? { from: notice.from, to: notice.to } : null;
    }
}
