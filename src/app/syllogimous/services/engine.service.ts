import { Injectable } from "@angular/core";
import {
    ENGINE_FAMILIES, EngineOptions, FamilyId, FamilyLevel, Item, Outcome, SchedulerState, emptySchedulerState, levelNotice,
    migratedLevel, newFamilyLevel, nextItem, targetFor, updateLevel,
} from "../engine";
import { LS_TRAINING_UNIT } from "../constants/local-storage.constants";
import {
    DEFAULT_V5_SETTINGS, FAMILY_TYPE, LS_V5_LEVELS, LS_V5_LEVEL_HISTORY, LS_V5_SCHEDULER, LS_V5_SETTINGS, V5Settings,
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
        return readJson(LS_V5_SETTINGS, { ...DEFAULT_V5_SETTINGS });
    }

    saveSettings(s: Partial<V5Settings>) {
        localStorage.setItem(LS_V5_SETTINGS, JSON.stringify({ ...this.settings, ...s }));
        this.prepared = undefined;
    }

    /** Levels per family; families never played start from the migrated v4.1 training unit (§6.3). */
    get levels(): LevelsState {
        const stored = readJson<LevelsState>(LS_V5_LEVELS, {});
        let changed = false;
        for (const f of Object.keys(FAMILY_TYPE) as FamilyId[]) {
            if (stored[f]) continue;
            stored[f] = newFamilyLevel(migratedLevel(this.oldPremises(f)));
            changed = true;
        }
        if (changed) localStorage.setItem(LS_V5_LEVELS, JSON.stringify(stored));
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
        return this.levels[f]?.level ?? 1;
    }

    get scheduler(): SchedulerState {
        return readJson(LS_V5_SCHEDULER, emptySchedulerState());
    }

    get levelHistory(): LevelHistory {
        return readJson<LevelHistory>(LS_V5_LEVEL_HISTORY, {});
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
        for (const f of enabled) levels[f] = req.fixedLevels?.[f] ?? st[f]?.level ?? 1;
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
     * Staircase update (regular game only). Returns a notice when the integer level moved by ≥ 2 since the last
     * notification.
     */
    submit(family: FamilyId, outcome: Outcome, p: number): { from: number; to: number } | null {
        const levels = this.levels;
        const before = levels[family] ?? newFamilyLevel(1);
        let after = updateLevel(before, outcome, p, this.settings.step);
        const notice = levelNotice(after);
        if (notice.notify) after = { ...after, notified: notice.to };
        levels[family] = after;
        localStorage.setItem(LS_V5_LEVELS, JSON.stringify(levels));
        const today = new Date().toISOString().slice(0, 10);
        const hist = this.levelHistory;
        hist[today] = Object.fromEntries(Object.entries(levels).map(([f, s]) => [f, Math.round(s!.level * 100) / 100]));
        localStorage.setItem(LS_V5_LEVEL_HISTORY, JSON.stringify(hist));
        this.prepared = undefined;
        return notice.notify ? { from: notice.from, to: notice.to } : null;
    }
}
