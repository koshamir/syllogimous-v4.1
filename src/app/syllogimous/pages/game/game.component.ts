import { Component } from '@angular/core';
import { GameService } from '../../services/game.service';
import { LS_GAME_MODE, LS_TIMER } from '../../constants/local-storage.constants';
import { LS_CUSTOM_TIMERS_KEY } from '../settings/modal-timer-settings/modal-timer-settings.component';
import { Router } from '@angular/router';
import { EnumScreens } from '../../constants/game.constants';
import { GameTimerService } from '../../services/game-timer.service';
import { adaptiveSeconds } from '../../engine';
import { isTimeout, responseTime } from '../../utils/answer.utils';

@Component({
    selector: 'app-game',
    templateUrl: './game.component.html',
    styleUrls: ['./game.component.css']
})
export class GameComponent {
    Array = Array;

    timerType;
    gameMode;
    timerTimeSeconds = 0;

    constructor(
        public game: GameService,
        public gameTimerService: GameTimerService,
        private router: Router,
    ) {
        this.timerType = localStorage.getItem(LS_TIMER) || '0';
        this.gameMode = localStorage.getItem(LS_GAME_MODE) || '0';

        if (this.game.question.conclusion === "!") {
            this.router.navigate([EnumScreens.Start]);
        }
    }

    ngOnInit() {
        // response time is measured from showing the item (tutorials and the result screen are not included)
        this.game.question.createdAt = Date.now();
        this.game.question.answeredAt = this.game.question.createdAt;
        switch (this.timerType) {
            case '1': {
                const customTimers = JSON.parse(localStorage.getItem(LS_CUSTOM_TIMERS_KEY) || "{}");
                this.timerTimeSeconds = customTimers[this.game.question.type] || 90;
                this.kickTimer();
                break;
            }
            case '2': {
                this.timerTimeSeconds = this.adaptiveTime();
                this.kickTimer();
                break;
            }
        }
    }

    /** T = clamp(median RT of the last 10 items of the family at level ±2 × (1 + 0.15·(σ − σ̄)) + 2·negations, 15, 180). */
    adaptiveTime(): number {
        const q = this.game.question;
        const ref = this.game.questions
            .filter(h => h.family === q.family && h.level !== undefined && Math.abs(h.level - (q.level ?? 1)) <= 2 && !isTimeout(h))
            .slice(0, 10);
        return adaptiveSeconds(
            ref.map(h => responseTime(h) / 1000),
            ref.map(h => h.metrics?.support ?? null),
            q.metrics?.support ?? null,
            q.negations,
        );
    }

    ngOnDestroy() {
        this.gameTimerService.stop();
    }

    kickTimer = async () => {
        try {
            await this.gameTimerService.start(this.timerTimeSeconds);
            this.game.checkQuestion();
        } catch (e) {
            console.warn(e);
        }
    }
}
