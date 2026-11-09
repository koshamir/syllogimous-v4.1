import { Component, HostListener, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { EnumScreens } from '../../constants/game.constants';
import { ProgressAndPerformanceService } from '../../services/progress-and-performance.service';
import { DailyPlanService } from '../../services/daily-plan.service';
import {
    FAMILY_TITLES, FLUENCY, FLUENCY_FAMILIES, FluencyBlock, FluencyFamily, generateFluencyBlock, isContextual, itemScore, nextDeadline,
} from '../../engine/modes/fluency/fluency';

export const LS_V5_FLUENCY = 'SYL_V5_FLUENCY';

interface FluencyState {
    deadlines: Partial<Record<FluencyFamily, number>>;
    blocks: number;
    history: { date: string; contextual: boolean; accuracy: number; points: number; meanTime: number }[];
}

type Phase = 'intro' | 'legend' | 'item' | 'summary';

/** «Беглость» (spec §10): speed and flexibility of basic inferences; feedback is only a short colour flash. */
@Component({
    selector: 'app-fluency',
    templateUrl: './fluency.component.html',
    styleUrls: ['./fluency.component.css'],
})
export class FluencyComponent implements OnDestroy {
    EnumScreens = EnumScreens;
    FAMILY_TITLES = FAMILY_TITLES;
    FLUENCY_FAMILIES = FLUENCY_FAMILIES;

    state: FluencyState;
    phase: Phase = 'intro';
    block?: FluencyBlock;
    i = 0;
    remaining = 0;
    legendLeft = 0;
    showLegend = false;
    flash: 'ok' | 'err' | null = null;
    results: { correct: boolean; t: number; score: number }[] = [];
    private shownAt = 0;
    private timer?: ReturnType<typeof setInterval>;
    private seed = Date.now().toString(36);

    constructor(public router: Router, private progress: ProgressAndPerformanceService, private plan: DailyPlanService) {
        this.state = this.load();
    }

    private load(): FluencyState {
        try {
            const raw = localStorage.getItem(LS_V5_FLUENCY);
            const s = raw ? JSON.parse(raw) : {};
            return { deadlines: s.deadlines ?? {}, blocks: s.blocks ?? 0, history: s.history ?? [] };
        } catch {
            return { deadlines: {}, blocks: 0, history: [] };
        }
    }

    private save() {
        localStorage.setItem(LS_V5_FLUENCY, JSON.stringify(this.state));
    }

    deadline(f: FluencyFamily): number {
        return this.state.deadlines[f] ?? FLUENCY.startDeadline;
    }

    get nextIsContextual() {
        return isContextual(this.state.blocks);
    }

    get item() {
        return this.block!.items[this.i];
    }

    start() {
        this.block = generateFluencyBlock(this.state.blocks, this.seed);
        this.i = 0;
        this.results = [];
        if (this.block.contextual) {
            this.phase = 'legend';
            this.legendLeft = FLUENCY.legendSeconds;
            this.tick(() => {
                this.legendLeft = Math.max(0, this.legendLeft - 0.1);
                if (this.legendLeft <= 0) this.showItem();
            });
        } else {
            this.showItem();
        }
    }

    private tick(fn: () => void) {
        this.stop();
        this.timer = setInterval(fn, 100);
    }

    private stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
    }

    private showItem() {
        this.phase = 'item';
        this.flash = null;
        this.shownAt = performance.now();
        const D = this.deadline(this.item.family);
        this.remaining = D;
        this.tick(() => {
            this.remaining = Math.max(0, D - (performance.now() - this.shownAt) / 1000);
            if (this.remaining <= 0) this.answer(null);
        });
    }

    answer(value: boolean | null) {
        if (this.phase !== 'item' || this.flash) return;
        this.stop();
        const it = this.item;
        const D = this.deadline(it.family);
        const t = Math.min(D, (performance.now() - this.shownAt) / 1000);
        const correct = value !== null && value === it.answer && t < D;
        this.results.push({ correct, t, score: value === null ? 0 : itemScore(correct, t, D) });
        this.state.deadlines[it.family] = nextDeadline(D, correct);
        this.flash = correct ? 'ok' : 'err';
        setTimeout(() => {
            this.i++;
            if (this.i >= this.block!.items.length) this.finish();
            else this.showItem();
        }, 280);
    }

    private finish() {
        this.phase = 'summary';
        this.flash = null;
        const n = this.results.length;
        const acc = this.results.filter(r => r.correct).length / n;
        const points = this.results.reduce((s, r) => s + r.score, 0);
        const meanTime = this.results.reduce((s, r) => s + r.t, 0) / n;
        this.state.blocks++;
        this.state.history.push({ date: new Date().toISOString().slice(0, 10), contextual: !!this.block?.contextual, accuracy: Math.round(acc * 1000) / 10, points: Math.round(points * 10) / 10, meanTime: Math.round(meanTime * 100) / 100 });
        this.state.history = this.state.history.slice(-200);
        this.save();
        const spent = Math.round(this.results.reduce((s, r) => s + r.t, 0) * 1000);
        this.progress.setDailyProgress(this.progress.getToday(), spent);
        this.plan.record('fluency', spent);
    }

    get summary() {
        const n = this.results.length || 1;
        return {
            accuracy: Math.round((1000 * this.results.filter(r => r.correct).length) / n) / 10,
            points: Math.round(this.results.reduce((s, r) => s + r.score, 0) * 10) / 10,
            meanTime: Math.round((100 * this.results.reduce((s, r) => s + r.t, 0)) / n) / 100,
        };
    }

    get recent() {
        return this.state.history.slice(-5).reverse();
    }

    @HostListener('document:keydown', ['$event'])
    onKey(e: KeyboardEvent) {
        if (e.key === 'l' || e.key === 'L' || e.key === 'д' || e.key === 'Д') { if (this.block?.contextual) this.showLegend = true; return; }
        if (this.phase !== 'item') return;
        if (e.key === 'ArrowLeft' || e.key === '1') { e.preventDefault(); this.answer(true); }
        if (e.key === 'ArrowRight' || e.key === '2') { e.preventDefault(); this.answer(false); }
    }

    @HostListener('document:keyup', ['$event'])
    onKeyUp(e: KeyboardEvent) {
        if (e.key === 'l' || e.key === 'L' || e.key === 'д' || e.key === 'Д') this.showLegend = false;
    }

    ngOnDestroy() {
        this.stop();
    }
}
