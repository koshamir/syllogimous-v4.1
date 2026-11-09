import { Component } from '@angular/core';
import { Question } from 'src/app/syllogimous/models/question.models';
import { GameService } from 'src/app/syllogimous/services/game.service';
import { isCorrect, isTimeout } from 'src/app/syllogimous/utils/answer.utils';

@Component({
    selector: 'app-accuracy-stats',
    templateUrl: './accuracy-stats.component.html',
    styleUrls: ['./accuracy-stats.component.css']
})
export class AccuracyStatsComponent {
    questions: Question[] = [];
    correctQs: Question[] = [];
    incorrectQs: Question[] = [];
    unansweredQs: Question[] = [];
    currentStreak: Question[] = [];
    longestStreak: Question[] = [];

    constructor(
        public game: GameService
    ) {}

    ngOnInit() {
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
