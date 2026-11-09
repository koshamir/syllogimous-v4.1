import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { EnumScreens } from '../../constants/game.constants';
import { ModesService } from '../../services/modes.service';
import { ProgressAndPerformanceService } from '../../services/progress-and-performance.service';
import { EngineService } from '../../services/engine.service';
import { DailyPlanService } from '../../services/daily-plan.service';
import { BuilderPuzzle, checkBuilder, generateBuilder } from '../../engine/modes/builder/builder';

interface Slot { v: number; label: string; x?: number; y?: number }

const COLOR_CSS = ['#2a6fdb', '#d6336c', '#2b8a3e'];

/**
 * «Конструктор» (spec §7.5): a board for the world type, chips with names, "tap a chip → tap a cell", Undo / Reset /
 * Check. The first check reports only how many are placed correctly; the second gives the full explanation.
 */
@Component({
    selector: 'app-builder',
    templateUrl: './builder.component.html',
    styleUrls: ['./builder.component.css'],
})
export class BuilderComponent {
    EnumScreens = EnumScreens;
    COLOR_CSS = COLOR_CSS;

    p!: BuilderPuzzle;
    placement: number[] = [];
    history: number[][] = [];
    selected: number | null = null;
    checks = 0;
    done = false;
    message = '';
    wrong = new Set<number>();
    violated = new Set<number>();
    choice: number | null = null;
    slots: Slot[] = [];
    level = 1;
    private next?: BuilderPuzzle;
    private startedAt = Date.now();

    constructor(
        public router: Router,
        private modes: ModesService,
        private engine: EngineService,
        private progress: ProgressAndPerformanceService,
        private plan: DailyPlanService,
    ) {
        this.load(this.make());
    }

    private make(): BuilderPuzzle {
        this.level = this.modes.level('builder');
        return generateBuilder(this.level, this.modes.nextSeed('builder'), { namePool: this.engine.settings.namePool });
    }

    load(p: BuilderPuzzle) {
        this.p = p;
        this.placement = new Array(p.n * p.attrs).fill(-1);
        if (p.fixed) this.placement[p.fixed.e * p.attrs] = p.fixed.v;
        this.history = [];
        this.selected = null;
        this.checks = 0;
        this.done = false;
        this.message = '';
        this.wrong.clear();
        this.violated.clear();
        this.choice = null;
        this.startedAt = Date.now();
        this.slots = this.makeSlots();
    }

    private makeSlots(): Slot[] {
        const p = this.p;
        switch (p.kind) {
            case 'line':
            case 'lineAttr': return Array.from({ length: p.n }, (_, v) => ({ v, label: String(v + 1) }));
            case 'circle': return Array.from({ length: p.n }, (_, v) => {
                const ang = -Math.PI / 2 + (2 * Math.PI * v) / p.n;
                return { v, label: String(v + 1), x: 50 + 38 * Math.cos(ang), y: 50 + 38 * Math.sin(ang) };
            });
            case 'grid': return Array.from({ length: 9 }, (_, v) => ({ v, label: `${Math.floor(v / 3) + 1}·${(v % 3) + 1}` }));
            case 'groups': return (p.groups ?? []).map((g, v) => ({ v, label: `${g.name} (${g.size})` }));
        }
    }

    get names() {
        return this.p.entities.map(e => e.name);
    }

    pos(e: number) {
        return this.placement[e * this.p.attrs];
    }

    color(e: number) {
        return this.p.attrs > 1 ? this.placement[e * this.p.attrs + 1] : -1;
    }

    occupants(v: number): number[] {
        return this.p.entities.map((_, e) => e).filter(e => this.pos(e) === v);
    }

    isLocked(e: number) {
        return !!this.p.fixed && this.p.fixed.e === e;
    }

    get unplaced(): number[] {
        return this.p.entities.map((_, e) => e).filter(e => this.pos(e) < 0);
    }

    get hasDistractors() {
        return this.p.clues.some(c => c.distractor);
    }

    get complete() {
        return this.placement.every(v => v >= 0);
    }

    private push() {
        this.history.push(this.placement.slice());
    }

    tapChip(e: number) {
        if (this.done || this.isLocked(e)) return;
        if (this.pos(e) >= 0 && this.selected === e) {
            // second tap on a placed chip returns it to the pool
            this.push();
            this.placement[e * this.p.attrs] = -1;
            this.selected = null;
            return;
        }
        this.selected = this.selected === e ? null : e;
    }

    tapSlot(v: number) {
        if (this.done || this.selected === null) return;
        const e = this.selected;
        const cap = this.p.kind === 'groups' ? this.p.groups![v].size : 1;
        const occ = this.occupants(v).filter(x => x !== e);
        if (occ.length >= cap) {
            if (cap === 1 && !this.isLocked(occ[0])) {
                this.push();
                this.placement[occ[0] * this.p.attrs] = this.pos(e);
                this.placement[e * this.p.attrs] = v;
                this.selected = null;
            }
            return;
        }
        this.push();
        this.placement[e * this.p.attrs] = v;
        this.selected = null;
    }

    setColor(e: number, c: number) {
        if (this.done) return;
        this.push();
        this.placement[e * this.p.attrs + 1] = c;
    }

    undo() {
        const prev = this.history.pop();
        if (prev) this.placement = prev;
    }

    reset() {
        this.push();
        this.placement = this.placement.map(() => -1);
        if (this.p.fixed) this.placement[this.p.fixed.e * this.p.attrs] = this.p.fixed.v;
        this.selected = null;
    }

    check() {
        if (this.done || !this.complete) return;
        this.checks++;
        const r = checkBuilder(this.p, this.placement);
        if (r.correct === r.total) {
            this.finish(this.checks === 1 ? 'ok' : 'same', this.checks === 1 ? 'Решено с первой проверки!' : 'Решено со второй проверки.');
            return;
        }
        if (this.checks === 1) {
            this.message = `Верно расставлено: ${r.correct} из ${r.total}. Проверьте подсказки и попробуйте ещё раз.`;
            return;
        }
        this.wrong = new Set(r.wrong);
        this.violated = new Set(r.violated);
        this.finish('err', `Не решено: верно ${r.correct} из ${r.total}. Ниже — правильная расстановка и ход рассуждения.`);
    }

    answer(i: number) {
        if (this.done) return;
        this.choice = i;
        const correct = this.p.variant === 'mustBe' ? this.p.mustBe!.correct : this.p.count!.correct;
        this.finish(i === correct ? 'ok' : 'err', i === correct ? 'Верно!' : 'Неверно.');
    }

    private finish(outcome: 'ok' | 'err' | 'same', msg: string) {
        this.done = true;
        this.message = msg;
        const ms = Date.now() - this.startedAt;
        this.level = this.modes.submit('builder', outcome, ms);
        this.progress.setDailyProgress(this.progress.getToday(), ms);
        this.plan.record('builder', ms);
        // the next puzzle is generated while the explanation is shown
        setTimeout(() => { try { this.next = this.make(); } catch { this.next = undefined; } }, 0);
    }

    nextPuzzle() {
        this.load(this.next ?? this.make());
        this.next = undefined;
    }

    solutionText(): string {
        const p = this.p;
        const names = this.names;
        const v = (e: number, a = 0) => p.solution[e * p.attrs + a];
        switch (p.kind) {
            case 'line':
            case 'lineAttr': {
                const order = p.entities.map((_, e) => e).sort((a, b) => v(a) - v(b));
                return order.map(e => `[${names[e]}${p.attrs > 1 ? ' · ' + p.colors![v(e, 1)] : ''}]`).join(' ');
            }
            case 'circle': {
                const order = p.entities.map((_, e) => e).sort((a, b) => v(a) - v(b));
                return 'По часовой: ' + order.map(e => names[e]).join(' → ') + ` → (${names[order[0]]})`;
            }
            case 'groups': return p.groups!.map((g, gi) => `${g.name}: ${p.entities.map((_, e) => e).filter(e => v(e) === gi).map(e => names[e]).join(', ')}`).join(' · ');
            case 'grid': return p.entities.map((_, e) => `${names[e]} — ряд ${Math.floor(v(e) / 3) + 1}, столбец ${(v(e) % 3) + 1}`).join('; ');
        }
    }
}
