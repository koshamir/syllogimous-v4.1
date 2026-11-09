import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { EnumScreens } from "../constants/game.constants";

export type PlanSegment = 'game' | 'builder' | 'mapping' | 'fluency';
export const PLAN_SEGMENTS: PlanSegment[] = ['game', 'builder', 'mapping', 'fluency'];
export const PLAN_LABELS: Record<PlanSegment, string> = {
    game: 'Обычная игра',
    builder: 'Конструктор',
    mapping: 'Отображение структур',
    fluency: 'Беглость',
};

export const LS_V5_DAILY_PLAN = 'SYL_V5_DAILY_PLAN';

export interface DailyPlanSettings { minutes: number; shares: Record<PlanSegment, number> }
export const DEFAULT_PLAN: DailyPlanSettings = { minutes: 30, shares: { game: 50, builder: 25, mapping: 15, fluency: 10 } };

interface PlanState { settings: DailyPlanSettings; today?: { date: string; spent: Record<PlanSegment, number>; active: boolean } }

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * «Тренировка дня» (spec §12): one button runs a planned session — regular game 50 % → «Конструктор» 25 % →
 * «Отображение структур» 15 % → «Беглость» 10 % of the planned minutes (all editable in the settings).
 */
@Injectable({ providedIn: "root" })
export class DailyPlanService {
    constructor(private router: Router) { }

    private get state(): PlanState {
        try {
            const raw = localStorage.getItem(LS_V5_DAILY_PLAN);
            const s = raw ? JSON.parse(raw) : {};
            return { settings: { ...DEFAULT_PLAN, ...s.settings, shares: { ...DEFAULT_PLAN.shares, ...s.settings?.shares } }, today: s.today };
        } catch {
            return { settings: DEFAULT_PLAN };
        }
    }

    private save(s: PlanState) {
        localStorage.setItem(LS_V5_DAILY_PLAN, JSON.stringify(s));
    }

    get settings(): DailyPlanSettings {
        return this.state.settings;
    }

    saveSettings(settings: DailyPlanSettings) {
        const s = this.state;
        s.settings = settings;
        this.save(s);
    }

    private todayState(s: PlanState) {
        if (!s.today || s.today.date !== todayIso()) s.today = { date: todayIso(), spent: { game: 0, builder: 0, mapping: 0, fluency: 0 }, active: false };
        return s.today;
    }

    /** Target milliseconds of a segment. */
    target(seg: PlanSegment): number {
        const st = this.settings;
        const total = PLAN_SEGMENTS.reduce((t, k) => t + st.shares[k], 0) || 1;
        return (st.minutes * 60000 * st.shares[seg]) / total;
    }

    get active(): boolean {
        const t = this.state.today;
        return !!t && t.date === todayIso() && t.active;
    }

    /** The first unfinished segment today (null when the plan is done). */
    current(): { seg: PlanSegment; index: number; leftMs: number } | null {
        const s = this.state;
        const t = this.todayState(s);
        for (const [index, seg] of PLAN_SEGMENTS.entries()) {
            if (this.target(seg) <= 0) continue;
            const left = this.target(seg) - t.spent[seg];
            if (left > 0) return { seg, index, leftMs: left };
        }
        return null;
    }

    record(seg: PlanSegment, ms: number) {
        const s = this.state;
        const t = this.todayState(s);
        if (!t.active) return;
        t.spent[seg] += ms;
        this.save(s);
    }

    stop() {
        const s = this.state;
        this.todayState(s).active = false;
        this.save(s);
    }

    /** Starts (or continues) today's plan and opens its current segment. Returns false when it is already done. */
    go(playGame: () => void): boolean {
        const s = this.state;
        this.todayState(s).active = true;
        this.save(s);
        const cur = this.current();
        if (!cur) { this.stop(); return false; }
        switch (cur.seg) {
            case 'game': playGame(); break;
            case 'builder': this.router.navigate([EnumScreens.Builder]); break;
            case 'mapping': this.router.navigate([EnumScreens.Mapping]); break;
            case 'fluency': this.router.navigate([EnumScreens.Fluency]); break;
        }
        return true;
    }
}
