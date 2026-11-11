import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { NgbModal } from "@ng-bootstrap/ng-bootstrap";
import { Question } from "../models/question.models";
import { EnumScreens, EnumTiers, ORDERED_QUESTION_TYPES, ORDERED_TIERS, TIER_SCORE_ADJUSTMENTS, TIER_SCORE_RANGES, TIERS_MATRIX } from "../constants/game.constants";
import { LS_DONT_SHOW, LS_HISTORY, LS_SCORE, LS_TIMER } from "../constants/local-storage.constants";
import { EnumQuestionType } from "../constants/question.constants";
import { FAMILY_TYPE, PlaygroundV5, TYPE_FAMILY } from "../constants/v5.constants";
import { ModalLevelChangeComponent } from "../components/modal-level-change/modal-level-change.component";
import { ProgressAndPerformanceService } from "./progress-and-performance.service";
import { GameTimerService } from "./game-timer.service";
import { EngineService, NextRequest } from "./engine.service";
import { DailyPlanService } from "./daily-plan.service";
import { ToastService } from "src/app/services/toast.service";
import { Logger } from "../utils/logger";
import { isCorrect } from "../utils/answer.utils";
import { questionTypeLabel } from "../utils/russian.utils";
import { BinaryOp, ENGINE_FAMILIES, FamilyId, Item, Outcome, PREMISE_RANGE } from "../engine";

@Injectable({
    providedIn: "root"
})
export class GameService {
    _score = 0;
    history: Question[] = [];
    question: Question;
    /** Free mode: fixed levels per family, no staircase, no score. */
    playgroundSettings?: PlaygroundV5;
    logger = new Logger("info", true);
    private lastNames: string[] = [];
    private answered = new WeakSet<Question>();

    get score() {
        return this._score;
    }

    set score(value: number) {
        this._score = value;
        localStorage.setItem(LS_SCORE, JSON.stringify(value));
    }

    get tier() {
        for (const tier of Object.values(EnumTiers)) {
            const range = TIER_SCORE_RANGES[tier];
            if (this.score >= range.minScore && this.score <= range.maxScore) {
                return tier as EnumTiers;
            }
        }
        return EnumTiers.Adept;
    }

    get isPlayground() {
        return !!this.playgroundSettings;
    }

    get questions() {
        let questions: Question[] = [];
        const history = localStorage.getItem(LS_HISTORY);
        if (history) {
            questions = JSON.parse(history).slice(0, 1000);
        }
        return questions;
    }

    constructor(
        private modalService: NgbModal,
        private router: Router,
        private progressAndPerformanceService: ProgressAndPerformanceService,
        private gameTimerService: GameTimerService,
        private engine: EngineService,
        private toaster: ToastService,
        private plan: DailyPlanService,
    ) {
        this.loadScore();
        (window as any).syllogimous = this;
        // placeholder until the first item («!» = no item yet)
        this.question = new Question(EnumQuestionType.Syllogism);
        this.question.conclusion = "!";
    }

    loadScore() {
        const lsScore = localStorage.getItem(LS_SCORE);
        if (lsScore) {
            this.score = JSON.parse(lsScore);
        }
    }

    pushIntoHistory(question: Question) {
        localStorage.setItem(LS_HISTORY, JSON.stringify([question, ...this.questions].slice(0, 1000)));
    }

    /** Families unlocked by the tier (regular game) or enabled in the free mode — only those ported to the engine. */
    enabledFamilies(): FamilyId[] {
        if (this.playgroundSettings) {
            return (Object.entries(this.playgroundSettings.families) as [FamilyId, { enabled: boolean }][])
                .filter(([f, s]) => s.enabled && ENGINE_FAMILIES.includes(f)).map(([f]) => f);
        }
        const tierIdx = Math.max(0, ORDERED_TIERS.findIndex(t => t === this.tier));
        const row = TIERS_MATRIX[tierIdx];
        return ORDERED_QUESTION_TYPES.filter((_, i) => row[i]).map(t => TYPE_FAMILY[t]).filter(f => ENGINE_FAMILIES.includes(f));
    }

    private request(): NextRequest {
        const enabled = this.enabledFamilies();
        if (!this.playgroundSettings) return { enabled, prevNames: this.lastNames };
        const pg = this.playgroundSettings;
        const fixedLevels: Partial<Record<FamilyId, number>> = {};
        for (const f of enabled) fixedLevels[f] = pg.families[f]?.level ?? PREMISE_RANGE[f][0];
        const ops = (Object.entries(pg.ops) as [BinaryOp, boolean][]).filter(([, v]) => v).map(([k]) => k);
        return {
            enabled,
            fixedLevels,
            format: pg.format,
            options: { negations: pg.negations, metas: pg.metas, binaryOps: ops, families: enabled },
            prevNames: this.lastNames,
        };
    }

    /** Item → the history record (old display fields + v5 fields). */
    toQuestion(item: Item): Question {
        const q = new Question(FAMILY_TYPE[item.family]);
        q.engineVersion = item.engineVersion;
        q.family = item.family;
        q.format = item.format;
        q.answerClass = item.answer;
        q.correct = item.format === "ternary" ? item.answer : item.correctOptionId;
        q.level = item.premises.length;
        q.seed = item.seed;
        q.metrics = item.metrics;
        q.lure = item.lure;
        q.explanation = item.explanation;
        q.options = item.options;
        q.subtype = item.subtype;
        q.instructions = item.render.instructions;
        q.notes = item.render.notes;
        q.premises = item.render.premises;
        q.conclusion = item.render.conclusion;
        q.negations = item.metrics.negations;
        q.metaRelations = item.metrics.metas;
        q.isValid = item.answer === "entailed";
        q.targetP = this.engine.targetP(item);
        return q;
    }

    skipIntro(dontShowAnymore: boolean) {
        if (dontShowAnymore) {
            localStorage.setItem(LS_DONT_SHOW + EnumScreens.Intro, "1")
        }
        this.router.navigate([EnumScreens.Start]);
    }

    play() {
        const req = this.request();
        if (!req.enabled.length) {
            this.toaster.show("Нет доступных типов заданий", { classname: "bg-danger text-light" });
            return;
        }
        let item: Item;
        try {
            item = this.engine.next(req);
        } catch (e) {
            this.logger.error("Engine error", e);
            this.toaster.show("Не удалось создать задание", { classname: "bg-danger text-light" });
            return;
        }
        this.lastNames = item.entities.map(e => e.name);
        this.question = this.toQuestion(item);
        this.logger.info("Item", item);
        if (this.playgroundSettings || localStorage.getItem(LS_DONT_SHOW + this.question.type)) {
            this.router.navigate([EnumScreens.Game]);
        } else {
            this.router.navigate([EnumScreens.Tutorial, this.question.type]);
        }
    }

    playArcadeMode() {
        this.playgroundSettings = undefined;
        this.play();
    }

    skipTutorial(dontShowAnymore: boolean) {
        if (dontShowAnymore) {
            localStorage.setItem(LS_DONT_SHOW + this.question.type, "1")
        }
        this.router.navigate([EnumScreens.Game]);
    }

    /** `choice` — the response in the item's coding; undefined = timeout. */
    async checkQuestion(choice?: string) {
        const q = this.question;
        // no item yet, or already answered (double click / timer race)
        if (q.conclusion === "!" || this.answered.has(q)) return;
        this.answered.add(q);
        this.gameTimerService.stop();
        q.userChoice = choice;
        if (q.format === "binary") q.userAnswer = choice === undefined ? undefined : choice === "true";
        q.answeredAt = Date.now();
        q.timerTypeOnAnswer = localStorage.getItem(LS_TIMER) || "0";
        q.playgroundMode = this.isPlayground;

        const correct = isCorrect(q) === true;
        const outcome: Outcome = choice === undefined ? "timeout" : correct ? "ok" : "err";

        if (!q.playgroundMode && q.family) {
            const notice = this.engine.submit(q.family, outcome, q.targetP ?? 0.75);
            if (notice) {
                const up = notice.to > notice.from;
                this.toaster.show(
                    `${questionTypeLabel(q.type)}: посылок ${up ? "больше" : "меньше"} — теперь ${notice.to}`,
                    { classname: up ? "bg-success text-light" : "bg-secondary text-light" },
                );
            }

            // tiers and score are kept (±10)
            const currTier = this.tier;
            let ds = 0;
            if (correct) {
                this.score += TIER_SCORE_ADJUSTMENTS[this.tier].increment;
                ds += 1;
            } else {
                this.score = Math.max(0, this.score - TIER_SCORE_ADJUSTMENTS[this.tier].decrement);
                if (this.score > 0) ds -= 1;
            }
            q.userScore = this.score;
            if (currTier !== this.tier) {
                const modalRef = this.modalService.open(ModalLevelChangeComponent, { centered: true });
                if (ds > 0) {
                    modalRef.componentInstance.title = "Новый уровень";
                    modalRef.componentInstance.content = "Отличная работа!<br>Продолжай, чтобы открыть новые типы заданий.";
                } else {
                    modalRef.componentInstance.title = "Уровень понижен";
                    modalRef.componentInstance.content = "Ошибки — часть обучения.<br>Сосредоточься, и скоро вернёшься выше.";
                }
            }
        }

        this.pushIntoHistory(q);
        this.progressAndPerformanceService.setDailyProgress(this.progressAndPerformanceService.getToday(), q.answeredAt - q.createdAt);
        if (!q.playgroundMode) this.plan.record('game', q.answeredAt - q.createdAt);
        this.engine.prepare(this.request());
        this.router.navigate([EnumScreens.Feedback]);
    }

    get autoAdjust(): boolean {
        return this.engine.settings.auto;
    }

    /** Level of a family (regular game) or its fixed level (free mode); the integer part is the premise count. */
    familyLevel(f: FamilyId): number {
        return this.playgroundSettings?.families[f]?.level ?? this.engine.levelOf(f);
    }

    /** Correct answers in a row needed for one more premise; null when the family is at its maximum. */
    correctToNext(f: FamilyId): number | null {
        const l = this.engine.levelOf(f);
        if (Math.floor(l) >= PREMISE_RANGE[f][1]) return null;
        return Math.max(1, Math.ceil((Math.floor(l) + 1 - l) / this.engine.settings.step - 1e-9));
    }

    typeOf(f: FamilyId): EnumQuestionType {
        return FAMILY_TYPE[f];
    }
}
