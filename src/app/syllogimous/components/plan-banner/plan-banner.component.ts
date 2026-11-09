import { Component, Input } from '@angular/core';
import { DailyPlanService, PLAN_LABELS, PlanSegment } from '../../services/daily-plan.service';
import { GameService } from '../../services/game.service';

/** A thin banner of «Тренировка дня» on the mode pages: the current stage and a button to the next one. */
@Component({
    selector: 'app-plan-banner',
    template: `
<div *ngIf="plan.active" class="plan-banner small">
    <ng-container *ngIf="plan.current() as cur; else doneTpl">
        <span *ngIf="cur.seg === segment">Тренировка дня · этап {{ cur.index + 1 }} из 4 · осталось ≈ {{ minutes(cur.leftMs) }} мин</span>
        <span *ngIf="cur.seg !== segment">Этап «{{ label(segment) }}» выполнен.</span>
        <button *ngIf="cur.seg !== segment" class="btn btn-sm btn-primary ms-2" (click)="next()">{{ label(cur.seg) }} →</button>
    </ng-container>
    <ng-template #doneTpl>
        <span>Тренировка дня выполнена. Можно продолжать в любом режиме.</span>
        <button class="btn btn-sm btn-link" (click)="plan.stop()">Скрыть</button>
    </ng-template>
</div>`,
    styles: [`.plan-banner { background: #e7f5ff; border-radius: 0.5rem; padding: 0.3rem 0.6rem; margin-bottom: 0.5rem; display: flex; align-items: center; flex-wrap: wrap; gap: 0.2rem; }`],
})
export class PlanBannerComponent {
    @Input() segment!: PlanSegment;

    constructor(public plan: DailyPlanService, private game: GameService) { }

    label(s: PlanSegment) {
        return PLAN_LABELS[s];
    }

    minutes(ms: number) {
        return Math.max(1, Math.round(ms / 60000));
    }

    next() {
        this.plan.go(() => this.game.playArcadeMode());
    }
}
