import { Component } from '@angular/core';
import { EnumScreens, EnumTiers, NO_DATA, TIER_SCORE_RANGES } from '../../constants/game.constants';
import { Question } from '../../models/question.models';
import { GameService } from '../../services/game.service';
import { Router } from '@angular/router';
import { formatTime } from 'src/app/utils/date';
import { ProgressAndPerformanceService } from '../../services/progress-and-performance.service';
import { isCorrect, isTimeout } from '../../utils/answer.utils';
import { loadProbes } from '../probes/probes.component';
import { DailyPlanService } from '../../services/daily-plan.service';
import { ToastService } from 'src/app/services/toast.service';

@Component({
    selector: 'app-start',
    templateUrl: './start.component.html',
    styleUrls: ['./start.component.css']
})
export class StartComponent {
    EnumScreens = EnumScreens;
    formatTime = formatTime;

    TIER_SCORE_RANGES = TIER_SCORE_RANGES;
    tiers = Object.values(EnumTiers);
    nextTier: EnumTiers | string = EnumTiers.Savant;
    pointsRemaining = 0;

    questions: Question[] = [];
    correctQs: Question[] = [];
    incorrectQs: Question[] = [];
    unansweredQs: Question[] = [];
    currentStreak: Question[] = [];
    longestStreak: Question[] = [];
    timePlayedToday = 0;
    timePlayedThisWeek = 0;
    probeDue = false;

    constructor(
        public game: GameService,
        public router: Router,
        private progressAndPerformanceService: ProgressAndPerformanceService,
        private plan: DailyPlanService,
        private toaster: ToastService,
    ) {
        this.timePlayedToday = progressAndPerformanceService.getTimePlayed(progressAndPerformanceService.getToday());
        this.timePlayedThisWeek = progressAndPerformanceService.getTimePlayedThisWeek(progressAndPerformanceService.getToday());
    }

    startPlan() {
        if (!this.plan.go(() => this.game.playArcadeMode())) {
            this.toaster.show('Тренировка дня уже выполнена', { classname: 'bg-success text-light' });
        }
    }

    ngOnInit() {
        const sessions = loadProbes().sessions;
        const last = sessions[sessions.length - 1];
        this.probeDue = (!last || (Date.now() - Date.parse(last.date)) / 86400000 >= 14) && this.game.questions.length >= 30;
        const currTierIdx = this.tiers.findIndex(tier => tier === this.game.tier);
        this.nextTier = this.tiers[currTierIdx + 1] || NO_DATA;
        this.pointsRemaining = (this.nextTier !== NO_DATA) ? (TIER_SCORE_RANGES[this.nextTier as EnumTiers].minScore - this.game.score) : 0;

        this.questions = this.game.questions;

        this.correctQs = this.questions.filter(q => isCorrect(q) === true);
        this.incorrectQs = this.questions.filter(q => isCorrect(q) === false);
        this.unansweredQs = this.questions.filter(q => isTimeout(q));

        for (const q of this.questions) {
            if (isCorrect(q) !== true) {
                break;
            }
            this.currentStreak.push(q);
        }

        let streak = [];
        for (const q of this.questions) {
            if (isCorrect(q) !== true) {
                if (streak.length > this.longestStreak.length) {
                    this.longestStreak = streak;
                    streak = [];
                }
                continue;
            }
            streak.push(q);
        }
    }
}