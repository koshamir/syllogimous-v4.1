import { Component, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { EnumScreens } from '../../constants/game.constants';
import { ModesService } from '../../services/modes.service';
import { EngineService } from '../../services/engine.service';
import { ProgressAndPerformanceService } from '../../services/progress-and-performance.service';
import { DailyPlanService } from '../../services/daily-plan.service';
import { MappingPuzzle, generateMapping } from '../../engine/modes/mapping/mapping';

/** «Отображение структур» (spec §8.4): systems as side-by-side cards (stacked on a phone), text only. */
@Component({
    selector: 'app-mapping',
    templateUrl: './mapping.component.html',
    styleUrls: ['./mapping.component.css'],
})
export class MappingComponent {
    EnumScreens = EnumScreens;
    p!: MappingPuzzle;
    chosen: string | null = null;
    done = false;
    correct = false;
    level = 1;
    private next?: MappingPuzzle;
    private startedAt = Date.now();

    constructor(public router: Router, private modes: ModesService, private engine: EngineService, private progress: ProgressAndPerformanceService, private plan: DailyPlanService) {
        this.load(this.make());
    }

    private make(): MappingPuzzle {
        this.level = this.modes.level('mapping');
        return generateMapping(this.level, this.modes.nextSeed('mapping'), { namePool: this.engine.settings.namePool });
    }

    load(p: MappingPuzzle) {
        this.p = p;
        this.chosen = null;
        this.done = false;
        this.correct = false;
        this.startedAt = Date.now();
    }

    answer(id: string) {
        if (this.done) return;
        this.chosen = id;
        this.done = true;
        this.correct = id === this.p.correct;
        const ms = Date.now() - this.startedAt;
        this.level = this.modes.submit('mapping', this.correct ? 'ok' : 'err', ms);
        this.progress.setDailyProgress(this.progress.getToday(), ms);
        this.plan.record('mapping', ms);
        setTimeout(() => { try { this.next = this.make(); } catch { this.next = undefined; } }, 0);
    }

    nextPuzzle() {
        this.load(this.next ?? this.make());
        this.next = undefined;
    }

    get correctLabel() {
        return this.p.options.find(o => o.id === this.p.correct)?.label ?? '';
    }

    @HostListener('document:keydown', ['$event'])
    onKey(e: KeyboardEvent) {
        if (this.done && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.nextPuzzle(); return; }
        const k = Number(e.key);
        if (!this.done && k >= 1 && k <= this.p.options.length) this.answer(this.p.options[k - 1].id);
    }
}
