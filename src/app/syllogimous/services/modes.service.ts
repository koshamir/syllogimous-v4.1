import { Injectable } from "@angular/core";
import { FamilyLevel, newFamilyLevel, updateLevel } from "../engine";

export type ModeId = 'builder' | 'mapping';

export const LS_V5_MODES = 'SYL_V5_MODES';

export interface ModeResult { date: string; level: number; outcome: 'ok' | 'err' | 'same'; ms: number }

interface ModesState {
    levels: Partial<Record<ModeId, FamilyLevel>>;
    results: Partial<Record<ModeId, ModeResult[]>>;
}

/** Separate staircases for the deep modes (spec §7.6, §8.3): target 70 %. */
@Injectable({ providedIn: "root" })
export class ModesService {
    static readonly TARGET = 0.7;
    private readonly sessionSeed = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    private counter = 0;

    private get state(): ModesState {
        try {
            const raw = localStorage.getItem(LS_V5_MODES);
            const s = raw ? JSON.parse(raw) : {};
            return { levels: s.levels ?? {}, results: s.results ?? {} };
        } catch {
            return { levels: {}, results: {} };
        }
    }

    private save(s: ModesState) {
        localStorage.setItem(LS_V5_MODES, JSON.stringify(s));
    }

    level(mode: ModeId): number {
        return this.state.levels[mode]?.level ?? 1;
    }

    results(mode: ModeId): ModeResult[] {
        return this.state.results[mode] ?? [];
    }

    nextSeed(mode: ModeId): string {
        return `${mode}:${this.sessionSeed}:${this.counter++}`;
    }

    /** 'ok' raises the level, 'err' lowers it, 'same' (solved on the second check) keeps it. */
    submit(mode: ModeId, outcome: 'ok' | 'err' | 'same', ms: number): number {
        const s = this.state;
        const cur = s.levels[mode] ?? newFamilyLevel(1);
        const next = outcome === 'same' ? { ...cur, count: cur.count + 1 } : updateLevel(cur, outcome, ModesService.TARGET);
        s.levels[mode] = next;
        const res = s.results[mode] ?? [];
        res.push({ date: new Date().toISOString().slice(0, 10), level: Math.round(cur.level * 100) / 100, outcome, ms });
        s.results[mode] = res.slice(-500);
        this.save(s);
        return next.level;
    }
}
