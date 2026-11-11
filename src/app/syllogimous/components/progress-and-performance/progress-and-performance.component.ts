import { Component, Input } from '@angular/core';
import { ProgressAndPerformanceService } from '../../services/progress-and-performance.service';
import { GameService } from '../../services/game.service';

@Component({
    selector: 'app-progress-and-performance',
    templateUrl: './progress-and-performance.component.html',
    styleUrls: ['./progress-and-performance.component.scss']
})
export class DailyProgressComponent {
    @Input("feedbackPage") feedbackPage = false;
    @Input("playgroundMode") playgroundMode = false;

    dailyProgressPercentage = 0;
    weeklyProgressPercentage = 0;

    constructor(
        public game: GameService,
        progressAndPerformanceService: ProgressAndPerformanceService
    ) {
        const today = progressAndPerformanceService.getToday();
        this.dailyProgressPercentage = progressAndPerformanceService.calcDailyProgress(today);
        this.weeklyProgressPercentage = progressAndPerformanceService.calcWeeklyProgress(today);
    }

    get familyPremises(): number | null {
        const f = this.game.question.family;
        return f ? Math.floor(this.game.familyLevel(f)) : null;
    }

    /** Correct answers in a row still needed for one more premise (null at the family's maximum). */
    get toNext(): number | null {
        const f = this.game.question.family;
        return f ? this.game.correctToNext(f) : null;
    }

    get auto(): boolean {
        return this.game.autoAdjust;
    }
}
