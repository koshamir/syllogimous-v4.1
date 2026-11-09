import { Component, HostListener } from '@angular/core';
import { GameService } from '../../services/game.service';
import { Router } from '@angular/router';
import { EnumScreens } from '../../constants/game.constants';
import { EngineService } from '../../services/engine.service';
import { LURE_TIPS, STRATEGY_CARDS, StrategyCard } from '../../constants/v5.constants';
import { correctLabel, isCorrect, isTimeout, userLabel } from '../../utils/answer.utils';

@Component({
    selector: 'app-feedback',
    templateUrl: './feedback.component.html',
    styleUrls: ['./feedback.component.css']
})
export class FeedbackComponent {
    EnumScreens = EnumScreens;

    timeout = false;
    correct = false;
    correctText = '';
    userText = '';
    showExplanation = false;
    support = new Set<number>();
    card?: StrategyCard;
    lureTip?: string;

    constructor(
        public game: GameService,
        public router: Router,
        engine: EngineService,
    ) {
        const q = game.question;
        this.timeout = isTimeout(q);
        this.correct = isCorrect(q) === true;
        this.correctText = correctLabel(q);
        this.userText = userLabel(q);
        const mode = engine.settings.explanation;
        this.showExplanation = !!q.explanation && (mode === 'always' || (mode === 'errors' && !this.correct));
        this.support = new Set(q.explanation?.supportDisplayIdx ?? []);
        this.card = STRATEGY_CARDS.find(c => c.id === q.explanation?.tipId);
        this.lureTip = q.lure ? LURE_TIPS[q.lure] : undefined;
    }

    get undetermined() {
        return this.game.question.answerClass === 'undetermined' && this.game.question.format !== 'choice';
    }

    openStrategies() {
        this.router.navigate([EnumScreens.Strategies], { fragment: this.card ? 'card-' + this.card.id : undefined });
    }

    @HostListener('document:keydown', ['$event'])
    onKey(e: KeyboardEvent) {
        if ((e.key === 'Enter' || e.key === ' ') && !(e.target as HTMLElement)?.closest?.('button, a, input, select, textarea')) {
            e.preventDefault();
            this.game.play();
        }
    }
}
