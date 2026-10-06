import { Injectable } from "@angular/core";
import { IArrangementPremise, IDirection3DProposition, IDirectionProposition, Question } from "../models/question.models";
import { coinFlip, getCircularWays, getLinearWays, getRandomSymbols, getSymbols, isPremiseLikeConclusion, createMetaRelationships, metarelateArrangement, pickUniqueItems, horizontalShuffleArrangement, shuffle, fixBinaryInstructions, areGraphsIsomorphic } from "../utils/question.utils";
import { generatePolysyllogism, formatSylPremise, getRandomRuleValid, getRandomRuleInvalid, getSyllogism } from "../utils/syllogism.utils";
import { EnumScreens, EnumTiers, ORDERED_QUESTION_TYPES, ORDERED_TIERS, TIER_SCORE_ADJUSTMENTS, TIER_SCORE_RANGES, TIERS_MATRIX } from "../constants/game.constants";
import { LS_DONT_SHOW, LS_HISTORY, LS_SCORE, LS_TIMER } from "../constants/local-storage.constants";
import { NgbModal } from "@ng-bootstrap/ng-bootstrap";
import { ModalLevelChangeComponent } from "../components/modal-level-change/modal-level-change.component";
import { Router } from "@angular/router";
import { canGenerateQuestion, QuestionSettings, Settings } from "../models/settings.models";
import { ProgressAndPerformanceService } from "./progress-and-performance.service";
import { guid } from "src/app/utils/uuid";
import { EnumArrangements, EnumQuestionType } from "../constants/question.constants";
import { EnumQuestionGroup, QUESTION_TYPE_SETTING_PARAMS } from "../constants/settings.constants";
import { Logger } from "../utils/logger";
import { GameTimerService } from "./game-timer.service";
import { getSyllogismGeneratorValue, SyllogismGenerator } from "../pages/settings/game-mode-choose/game-mode-choose.component";
import { BINARY_EXPRESSIONS, BinaryOperator, CARDINAL_OPPOSITES, formatAnalogyConclusion, formatArrangementInstruction, formatArrangementProposition, formatBasicProposition, formatBinaryConclusion, formatDirection3DProposition, formatDirectionProposition, formatGraphEdge, formatGraphMeta, questionTypeLabel, evaluateBinaryExpression, pluralRu } from "../utils/russian.utils";
import { LegacyQuestionGeneratorAdapter } from "./legacy-question-generator.adapter";

@Injectable({
    providedIn: "root"
})
export class GameService {
    _score = 0;
    history: Question[] = [];
    question;
    playgroundSettings?: Settings;
    logger = new Logger("info", true);

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

    get settings() {
        return this.playgroundSettings || this.getSettingsFromTier(this.tier);
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
    ) {
        this.loadScore();
        (window as any).syllogimous = this;

        // Create a first dummy question to avoid null pointer etc...
        const firstDummyQuestion = this.createSyllogism(2);
        firstDummyQuestion.conclusion = "!";
        this.question = firstDummyQuestion;
    }

    loadScore() {
        const lsScore = localStorage.getItem(LS_SCORE);
        if (lsScore) {
            this.score = JSON.parse(lsScore);
        }
    }

    pushIntoHistory(question: Question) {
        localStorage.setItem(LS_HISTORY, JSON.stringify([question, ...this.questions]));
    }

    /** Given an EnumTiers value construct a Settings instance */
    getSettingsFromTier(tier: EnumTiers) {
        const tierIdx = ORDERED_TIERS.findIndex(_tier => _tier === tier);
        const settings = new Settings();

        settings.setEnable("negation", false);
        settings.setEnable("meta", false);

        for (let i = 0; i < TIERS_MATRIX[tierIdx].length; i++) {
            const questionType = ORDERED_QUESTION_TYPES[i];
            const isActive = !!TIERS_MATRIX[tierIdx][i];
            const numOfPremises = this.progressAndPerformanceService.getTrainingUnit(questionType).premises;
            settings.setQuestionSettings(questionType, isActive, numOfPremises);
        }

        if (tierIdx > 5) {
            settings.setEnable("negation", true);
        }

        if (tierIdx > 6) {
            settings.setEnable("meta", true);
        }

        return settings;
    }

    /** Given question type and number of premises, returns a question creator function */
    getCreateFn(questionType: EnumQuestionType, numOfPremises: number) {
        const legacy = new LegacyQuestionGeneratorAdapter({
            [EnumQuestionType.Distinction]: () => this.createDistinction(numOfPremises),
            [EnumQuestionType.ComparisonNumerical]: () => this.createComparison(numOfPremises, EnumQuestionType.ComparisonNumerical),
            [EnumQuestionType.ComparisonChronological]: () => this.createComparison(numOfPremises, EnumQuestionType.ComparisonChronological),
            [EnumQuestionType.Syllogism]: () => this.createSyllogism(numOfPremises),
            [EnumQuestionType.LinearArrangement]: () => this.createArrangement(numOfPremises, EnumQuestionType.LinearArrangement),
            [EnumQuestionType.CircularArrangement]: () => this.createArrangement(numOfPremises, EnumQuestionType.CircularArrangement),
            [EnumQuestionType.Direction]: () => this.createDirection(numOfPremises),
            [EnumQuestionType.Direction3DSpatial]: () => this.createDirection3D(numOfPremises, EnumQuestionType.Direction3DSpatial),
            [EnumQuestionType.Direction3DTemporal]: () => this.createDirection3D(numOfPremises, EnumQuestionType.Direction3DTemporal),
            [EnumQuestionType.GraphMatching]: () => this.createGraphMatching(numOfPremises),
            [EnumQuestionType.Analogy]: () => this.createAnalogy(numOfPremises),
            [EnumQuestionType.Binary]: () => this.createBinary(numOfPremises),
        });
        return legacy.generatorFor(questionType);
    }

    /** Return a random question based on the current settings */
    createRandomQuestion(numOfPremises?: number, basic?: boolean) {
        const settings = this.settings;
        this.logger.info("Settings", settings);

        this.logger.info("Training units", this.progressAndPerformanceService.getAllTrainingUnits());

        const typeSettingTuples = Object.entries(settings.question) as [EnumQuestionType, QuestionSettings][];
        const getQuestionGroup = (qg?: EnumQuestionGroup) => typeSettingTuples.filter(([qt, qs]) => qs.group == qg);
        const groupsOfQuestions = [
            getQuestionGroup(undefined),
            getQuestionGroup(EnumQuestionGroup.Comparison),
            getQuestionGroup(EnumQuestionGroup.Direction),
            getQuestionGroup(EnumQuestionGroup.Arrangement),
        ];

        const choices: Array<() => Question> = [];

        // Pick one question from each group so that the distribution is uniform
        // The "isUndefinedGroup" predicate is used to push all ungrouped question into choices
        for (const grouped of groupsOfQuestions) {
            const isUndefinedGroup = grouped === groupsOfQuestions[0];
            const groupChoices: Array<() => Question> = isUndefinedGroup ? choices : [];
            for (const [qt, qs] of grouped) {
                const shouldIncludeQuestion = (basic == undefined) ? true : qs.basic === basic;
                if (qs.enabled && shouldIncludeQuestion) {
                    groupChoices.push(this.getCreateFn(qt, qs.clampNumOfPremises(numOfPremises || qs.getNumOfPremises())));
                }
            }
            if (!isUndefinedGroup && groupChoices.length) {
                choices.push(pickUniqueItems(groupChoices, 1).picked[0]);
            }
        }

        if (!choices.length) {
            this.logger.warn("NO CHOICES AVAILABLE!");
        }

        const randomQuestion = pickUniqueItems(choices, 1).picked[0]();
        const rendered = [
            ...randomQuestion.premises,
            ...(Array.isArray(randomQuestion.conclusion) ? randomQuestion.conclusion : [randomQuestion.conclusion]),
        ].join(" ");
        randomQuestion.negations = (rendered.match(/class="[^"]*\bis-negated\b[^"]*"/g) || []).length;
        this.logger.info("Random question", randomQuestion);
        return randomQuestion;
    }

    skipIntro(dontShowAnymore: boolean) {
        if (dontShowAnymore) {
            localStorage.setItem(LS_DONT_SHOW + EnumScreens.Intro, "1")
        }
        this.router.navigate([EnumScreens.Start]);
    }

    play() {
        this.question = this.createRandomQuestion();
        if (this.playgroundSettings) {
            this.router.navigate([EnumScreens.Game]);
        } else {
            if (!localStorage.getItem(LS_DONT_SHOW + this.question.type)) {
                this.router.navigate([EnumScreens.Tutorial, this.question.type]);
            } else {
                this.router.navigate([EnumScreens.Game]);
            }
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

    async checkQuestion(value?: boolean) {
        this.question.userAnswer = value;
        this.question.answeredAt = Date.now();
        this.question.timerTypeOnAnswer = localStorage.getItem(LS_TIMER) || "0";
        this.question.playgroundMode = this.settings === this.playgroundSettings;

        const type = this.question.type;
        const isQuestionValid = this.question.userAnswer === this.question.isValid;

        // Playground doesn't progress tiers
        if (!this.question.playgroundMode) {
            if (value == null) {
                this.progressAndPerformanceService.updateTrainingUnit(type, { timeout: 1 });
            } else if (isQuestionValid) {
                this.progressAndPerformanceService.updateTrainingUnit(type, { right: 1 });
            } else {
                this.progressAndPerformanceService.updateTrainingUnit(type, { wrong: 1 });
            }

            const { right, timeout, wrong } = this.progressAndPerformanceService.calcTrainingUnitPercentages(type);
            const { trainingUnitLength, premisesUpThreshold, premisesDownThreshold } = this.progressAndPerformanceService.getTrainingUnitSettings();
            if (right + timeout + wrong >= trainingUnitLength) {
                this.progressAndPerformanceService.restartTrainingUnit(this.question.type);
                const { premises } = this.progressAndPerformanceService.getTrainingUnit(type);
                const { minNumOfPremises, maxNumOfPremises } = QUESTION_TYPE_SETTING_PARAMS[type];

                if ((timeout + wrong) / trainingUnitLength >= premisesDownThreshold) {
                    if (premises > minNumOfPremises) {
                        this.gameTimerService.stop();
                        const modalRef = this.modalService.open(ModalLevelChangeComponent, { centered: true });
                        modalRef.componentInstance.title = "Посылок стало меньше";
                        modalRef.componentInstance.content = `Последние <b>${trainingUnitLength}</b> ${pluralRu(trainingUnitLength, "попытка", "попытки", "попыток")} в заданиях<br><b class="modal-level-type">${questionTypeLabel(type)}</b><br>дали такой результат:<div class="d-flex flex-row justify-content-center my-3"><span class="p-2"><b>${right}</b> верно</span><span class="p-2 border-start border-end"><b>${timeout}</b> без ответа</span><span class="p-2"><b>${wrong}</b> неверно</span></div>Теперь в заданиях<br><b class="modal-level-type">${questionTypeLabel(type)}</b><br><b>${premises - 1}</b> ${pluralRu(premises - 1, "посылка", "посылки", "посылок")}.`;
                        await modalRef.result;
                    }
                    this.progressAndPerformanceService.updateTrainingUnit(type, { premises: -1 });
                } else if (right / trainingUnitLength >= premisesUpThreshold) {
                    if (premises < maxNumOfPremises) {
                        this.gameTimerService.stop();
                        const modalRef = this.modalService.open(ModalLevelChangeComponent, { centered: true });
                        modalRef.componentInstance.title = "Посылок стало больше";
                        modalRef.componentInstance.content = `Последние <b>${trainingUnitLength}</b> ${pluralRu(trainingUnitLength, "попытка", "попытки", "попыток")} в заданиях<br><b class="modal-level-type">${questionTypeLabel(type)}</b><br>дали такой результат:<div class="d-flex flex-row justify-content-center my-3"><span class="p-2"><b>${right}</b> верно</span><span class="p-2 border-start border-end"><b>${timeout}</b> без ответа</span><span class="p-2"><b>${wrong}</b> неверно</span></div>Теперь в заданиях<br><b class="modal-level-type">${questionTypeLabel(type)}</b><br><b>${premises + 1}</b> ${pluralRu(premises + 1, "посылка", "посылки", "посылок")}.`;
                        await modalRef.result;
                    }
                    this.progressAndPerformanceService.updateTrainingUnit(type, { premises: 1 });
                }
            }

            // Adjust tier based on score
            const currTier = this.tier;

            let ds = 0;
            if (isQuestionValid) {
                this.score += TIER_SCORE_ADJUSTMENTS[this.tier].increment;
                ds += 1;
            } else {
                this.score = Math.max(0, this.score - TIER_SCORE_ADJUSTMENTS[this.tier].decrement);
                if (this.score > 0) {
                    ds -= 1;
                }
            }

            this.question.userScore = this.score;

            const nextTier = this.tier;

            // Level up/down
            if (currTier !== nextTier) {
                this.gameTimerService.stop();
                const modalRef = this.modalService.open(ModalLevelChangeComponent, { centered: true });

                if (ds > 0) {
                    modalRef.componentInstance.title = "Новый уровень";
                    modalRef.componentInstance.content = "Отличная работа!<br>Продолжай, чтобы открыть новые типы заданий.";
                } else if (ds < 0) {
                    modalRef.componentInstance.title = "Уровень понижен";
                    modalRef.componentInstance.content = "Ошибки — часть обучения.<br>Сосредоточься, и скоро вернёшься выше.";
                }
            }
        }

        this.pushIntoHistory(this.question);

        this.progressAndPerformanceService.setDailyProgress(
            this.progressAndPerformanceService.getToday(),
            this.question.answeredAt - this.question.createdAt
        );

        this.router.navigate([EnumScreens.Feedback]);
    }

    createDistinction(numOfPremises: number): Question {
        this.logger.info("createDistinction");

        const type = EnumQuestionType.Distinction;
        const settings = this.settings;

        if (!canGenerateQuestion(type, numOfPremises, settings)) {
            throw new Error("Cannot generate.");
        }

        const length = numOfPremises + 1;
        const symbols = getRandomSymbols(settings, length);
        const question = new Question(type);

        do {
            const rnd = Math.floor(Math.random() * symbols.length);
            const first = symbols.splice(rnd, 1)
            let prev = first;
            let curr: string[] = [];

            question.buckets = [[prev], []];
            let prevBucket = 0;

            question.premises = [];

            for (let i = 0; i < length - 1; i++) {
                const rnd = Math.floor(Math.random() * symbols.length);
                curr = symbols.splice(rnd, 1);

                const isSameAs = coinFlip();
                const isInverted = settings.enabled.negation && coinFlip();
                question.negations += Number(isInverted);

                question.premises.push(formatBasicProposition(String(prev), String(curr), type, isSameAs, isInverted));

                if (!isSameAs) {
                    prevBucket = (prevBucket + 1) % 2;
                }

                question.buckets[prevBucket].push(curr);

                prev = curr;
            }

            // All same is useless, in that case repeat
            if (!question.buckets[0].length || !question.buckets[1].length) {
                return this.createDistinction(numOfPremises);
            }

            createMetaRelationships(settings, question, length);

            const isSameAs = coinFlip();
            const isInverted = settings.enabled.negation && coinFlip();
            question.negations += Number(isInverted);

            question.conclusion = formatBasicProposition(String(first), String(curr), type, isSameAs, isInverted);
            question.isValid = isSameAs
                ? question.buckets[0].includes(curr)
                : question.buckets[1].includes(curr);
        } while (isPremiseLikeConclusion(question.premises, question.conclusion));

        shuffle(question.premises);

        return question;
    }

    createComparison(numOfPremises: number, type: EnumQuestionType.ComparisonNumerical | EnumQuestionType.ComparisonChronological) {
        this.logger.info("createComparison:", type);

        const settings = this.settings;

        if (!canGenerateQuestion(type, numOfPremises, settings)) {
            throw new Error("Cannot generate.");
        }

        const length = numOfPremises + 1;
        const question = new Question(type);

        do {
            question.bucket = getRandomSymbols(settings, length);
            question.premises = [];
            const sign = [-1, 1][Math.floor(Math.random() * 2)];

            let next = "";

            for (let i = 0; i < length - 1; i++) {
                const curr = question.bucket[i];
                next = question.bucket[i + 1];

                const isMoreOrAfter = coinFlip();
                const [first, last] = ((sign === 1) === isMoreOrAfter) ? [next, curr] : [curr, next];
                const isInverted = settings.enabled.negation && coinFlip();
                question.negations += Number(isInverted);

                question.premises.push(formatBasicProposition(first, last, type, isMoreOrAfter, isInverted));
            }

            createMetaRelationships(settings, question, length);

            const a = Math.floor(Math.random() * question.bucket.length);
            let b = Math.floor(Math.random() * question.bucket.length);
            while (a === b) {
                b = Math.floor(Math.random() * question.bucket.length);
            }

            const isMoreOrAfter = coinFlip();
            const isInverted = settings.enabled.negation && coinFlip();
            question.negations += Number(isInverted);

            question.conclusion = formatBasicProposition(question.bucket[a], question.bucket[b], type, isMoreOrAfter, isInverted);
            question.isValid = isMoreOrAfter
                ? sign === 1 && a > b || sign === -1 && a < b
                : sign === 1 && a < b || sign === -1 && a > b;
        } while (isPremiseLikeConclusion(question.premises, question.conclusion));

        shuffle(question.premises);

        return question;
    }

    createArrangement(numOfPremises: number, type: EnumQuestionType.LinearArrangement | EnumQuestionType.CircularArrangement): Question {
        this.logger.info("createArrangement:", type);

        const settings = this.settings;

        if (!canGenerateQuestion(type, numOfPremises, settings)) {
            throw new Error("Cannot generate.");
        }

        const numOfEls = numOfPremises + 1;
        const isLinear = type === EnumQuestionType.LinearArrangement;
        const getWays = isLinear ? getLinearWays : getCircularWays;
        const symbols = getSymbols(settings);
        const words = pickUniqueItems(symbols, numOfEls).picked;
        const question = new Question(type);
        question.instructions = [formatArrangementInstruction(words, isLinear)];

        const relationshipAlreadyExistent = (a: string, b: string) =>
            premises.find(({ a: pA, b: pB }) => (pA === a && pB === b) || (pA === b && pB === a));

        let premises: IArrangementPremise[] = [];
        let subjects = [...words];
        let a: string | undefined = undefined;
        let safe = 1e2;
        while (safe-- && premises.length < numOfEls - 1) {
            let premise: IArrangementPremise | undefined = undefined;
            let safe = 1e2;
            while (safe-- && premise == undefined) {
                // Pick A
                a = a || pickUniqueItems(subjects, 1).picked[0];
                this.logger.info("a", a);
                const aid = words.indexOf(a);

                // Pick B
                const b = pickUniqueItems(subjects.filter(sub => sub !== a), 1).picked[0];
                this.logger.info("b", b);
                const bid = words.indexOf(b);

                // Pick a way between A and B and check there are no connections already established between A and B
                const [wayDescription, wayData] = pickUniqueItems(Object.entries(getWays(aid, bid, numOfEls)), 1).picked[0];
                if (wayData.possible && !relationshipAlreadyExistent(a, b)) {
                    premise = {
                        a,
                        b,
                        relationship: {
                            description: wayDescription as EnumArrangements,
                            steps: wayData.steps
                        },
                        metaRelationships: [],
                        uid: guid()
                    };
                    subjects = subjects.filter(s => s !== a && s !== b)
                    a = b;
                }
            }
            if (safe <= 0) {
                throw new Error("MAXIMUM ITERATION COUNT REACHED!");
            }
            premises.push(premise!);
        }
        if (safe <= 0) {
            throw new Error("MAXIMUM ITERATION COUNT REACHED!");
        }

        horizontalShuffleArrangement(premises);
        shuffle(premises);
        metarelateArrangement(premises);

        let b: string | undefined = undefined;
        safe = 1e2;
        while (safe-- && b == undefined) {
            const subject = pickUniqueItems(words, 1).picked[0];
            if (subject !== a && !relationshipAlreadyExistent(a!, subject)) {
                b = subject;
            }
        }
        if (safe <= 0) {
            throw new Error("MAXIMUM ITERATION COUNT REACHED!");
        }

        const [aid, bid] = [words.indexOf(a!), words.indexOf(b!)];
        const ways = getWays(aid, bid, numOfEls, true);
        this.logger.info("a", a);
        this.logger.info("a", b);
        this.logger.info("ways", ways);

        question.isValid = coinFlip();
        const conclusions = Object.entries(ways).filter(([description, data]) => data.possible === question.isValid);
        const picked = pickUniqueItems(conclusions, 1).picked[0];
        const description = picked[0] as EnumArrangements;
        const steps = picked[1].steps;
        const conclusionRelationship = { description, steps };
        const conclusionIsInverted = settings.enabled.negation && coinFlip();
        question.negations += Number(conclusionIsInverted);
        question.conclusion = formatArrangementProposition(a!, b!, conclusionRelationship, conclusionIsInverted);

        // Next to relationship with 3 elements are useless, in that case regenerate
        if (!isLinear && numOfEls === 3 && description === EnumArrangements.Next) {
            return this.createArrangement(numOfPremises, type);
        }

        question.rule = words.join(", ");
        const metaRelationshipLookupMap: Record<string, boolean> = {};
        question.premises = premises.map(({ a, b, relationship, metaRelationships, uid }) => {
            if (settings.enabled.meta && coinFlip() && metaRelationships.length && !metaRelationshipLookupMap[uid]) {
                const premise = pickUniqueItems(metaRelationships, 1).picked[0];
                metaRelationshipLookupMap[premise.uid] = true;
                question.metaRelations++;
                return formatGraphMeta(a, b, premise.a, premise.b);
            }

            const isInverted = settings.enabled.negation && coinFlip();
            question.negations += Number(isInverted);
            return formatArrangementProposition(a, b, relationship, isInverted);
        });

        return question;
    }

    createDirection(numOfPremises: number): Question {
        this.logger.info("createDirection");

        const type = EnumQuestionType.Direction;
        const settings = this.settings;

        if (!canGenerateQuestion(type, numOfPremises, settings)) {
            throw new Error("Cannot generate.");
        }

        const numOfEls = numOfPremises + 1;
        const symbols = getSymbols(settings);
        const words = pickUniqueItems(symbols, numOfEls).picked;
        const question = new Question(type);

        const sideSize = 1 + Math.round(Math.sqrt(numOfEls));

        // Give random coords to each subject
        const coords: [string, number, number][] = [];
        let pool = [...words];
        while (pool.length) {
            let ri: number | undefined;
            let rj: number | undefined;
            while (ri == null || rj == null || coords.find(([_, x, y]) => ri === x && rj === y)) {
                ri = Math.floor(Math.random() * sideSize);
                rj = Math.floor(Math.random() * sideSize);
            }
            const { picked, remaining } = pickUniqueItems(pool, 1);
            coords.push([picked[0], ri, rj]);
            pool = remaining;
        }
        question.coords = coords;
        this.logger.info("Coords", coords);

        // Create pairs of subjects
        let copyOfCoords = [...coords];
        const pairs: [typeof coords[0], typeof coords[0]][] = [];
        const pairAlreadyEstablished = (a: string, b: string) =>
            pairs.find(([x, y]) => (x[0] === a && y[0] === b) || (x[0] === b && y[0] === a));
        for (let i = 0; i < numOfEls - 1; i++) {
            const { picked, remaining } = pickUniqueItems(copyOfCoords, 1);
            const subject = i === 0
                ? pickUniqueItems(remaining, 1).picked[0]
                : pickUniqueItems(pairs, 1).picked[0][Math.floor(Math.random() * 2)];
            const a = picked[0][0];
            const b = subject[0];
            if (a === b || pairAlreadyEstablished(a, b)) {
                i--;
                continue;
            }
            pairs.push([picked[0], subject]);
            copyOfCoords = remaining;
        }

        const usedCoords = Object.values(
            pairs.reduce((a, c) => {
                a[c[0][0]] = c[0];
                a[c[1][0]] = c[1];
                return a;
            }, {} as Record<string, typeof coords[0]>)
        );

        // Add one more pair that will represent the conclusion
        let coorda!: typeof coords[0];
        let coordb!: typeof coords[0];
        let safe = 1e2;
        while (safe-- && (!coorda || !coordb || pairAlreadyEstablished(coorda[0], coordb[0]))) {
            [coorda, coordb] = pickUniqueItems(usedCoords, 2).picked;
        }

        if (safe < 1) {
            this.logger.error("MAXIMUM ITERATION COUNT REACHED!");
            return this.createDirection(numOfPremises);
        }

        pairs.push([coorda, coordb]);
        this.logger.info("Pairs", pairs);

        // Calculate cardinals and relationship of each pair
        const premises: IDirectionProposition[] = [];

        for (const pair of pairs) {
            const [subja, subjb] = pair;
            const [a, ax, ay] = subja;
            const [b, bx, by] = subjb;

            const cardinals: [string, number][] = [];
            const diffy = ay - by;
            const absdiffy = Math.abs(diffy);
            const diffx = ax - bx;
            const absdiffx = Math.abs(diffx);

            if (diffy > 0) {
                cardinals.push(["North", absdiffy]);
            } else if (diffy < 0) {
                cardinals.push(["South", absdiffy]);
            }

            if (diffx > 0) {
                cardinals.push(["East", absdiffx]);
            } else if (diffx < 0) {
                cardinals.push(["West", absdiffx]);
            }

            premises.push({
                pair,
                cardinals,
                adjacent: cardinals.every(cardinal => cardinal[1] === 1),
                uid: guid()
            })
        }
        this.logger.info("Premises", premises);

        // Sanity check, this fixes a bug with analogy questions
        if (new Set(premises.map(x => x.pair[0][0])).size !== coords.length) {
            this.logger.error("Missing subject in premises");
            return this.createDirection(numOfPremises);
        }

        // Extract the last premise and say it's the conclusion
        // Flip a coin and either keep or tweak the conclusion
        let conclusion = premises.pop()!;
        const isValid = coinFlip();
        if (isValid) {
            this.logger.info("Keep conclusion");
        } else {
            this.logger.info("Tweak conclusion");
            const rndIdx = Math.floor(Math.random() * conclusion.cardinals.length);
            if (coinFlip()) {
                this.logger.info("Add one to one cardinal");
                conclusion.cardinals[rndIdx][1]++;
            } else {
                this.logger.info("One cardinal flipped");
                conclusion.cardinals[rndIdx][0] = CARDINAL_OPPOSITES[conclusion.cardinals[rndIdx][0] as keyof typeof CARDINAL_OPPOSITES];
            }
            conclusion.adjacent = false;
        }
        this.logger.info("Conclusion", conclusion);

        const stringifyProposition = (p: IDirectionProposition) => {
            const inversions = p.cardinals.map(() => settings.enabled.negation && coinFlip());
            question.negations += inversions.filter(Boolean).length;
            return formatDirectionProposition(
                p.pair[0][0],
                p.pair[1][0],
                p.cardinals,
                p.adjacent,
                inversions,
            );
        };

        shuffle(premises);
        question.isValid = isValid;
        question.premises = premises.map(stringifyProposition);
        question.conclusion = stringifyProposition(conclusion);
        question.notes = [
            "Направления точные: севернее значит строго на север, не по диагонали."
        ];

        // TODO: Create meta relationship

        return question;
    }

    createDirection3D(numOfPremises: number, type: EnumQuestionType.Direction3DSpatial | EnumQuestionType.Direction3DTemporal): Question {
        this.logger.info("createDirection3D");

        const settings = this.settings;

        if (!canGenerateQuestion(type, numOfPremises, settings)) {
            throw new Error("Cannot generate.");
        }

        const numOfEls = numOfPremises + 1;
        const symbols = getSymbols(settings);
        const words = pickUniqueItems(symbols, numOfEls).picked;
        const question = new Question(type);
        const isSpatial = type === EnumQuestionType.Direction3DSpatial;

        const sideSize = 1 + Math.round(Math.cbrt(numOfEls));

        // Give random coords to each subject
        const coords: [string, number, number, number][] = [];
        const alreadyHasCoords = (ri: number, rj: number, rk: number) => {
            return coords.find(([_, x, y, k]) =>
                ri === x && rj === y && rk === k
            );
        };
        let pool = [...words];
        while (pool.length) {
            let ri: number | undefined;
            let rj: number | undefined;
            let rt: number | undefined;
            while (ri == null || rj == null || rt == null || alreadyHasCoords(ri, rj, rt)) {
                ri = Math.floor(Math.random() * sideSize);
                rj = Math.floor(Math.random() * sideSize);
                rt = Math.floor(Math.random() * sideSize);
            }
            const { picked, remaining } = pickUniqueItems(pool, 1);
            coords.push([picked[0], ri, rj, rt]);
            pool = remaining;
        }
        this.logger.info("All coords", coords);

        // Create pairs of subjects
        let copyOfCoords = [...coords];
        const pairs: [typeof coords[0], typeof coords[0]][] = [];
        const subjectsAlreadyIncluded = (a: string, b: string) =>
            pairs.find(([x, y]) => (x[0] === a && y[0] === b) || (x[0] === b && y[0] === a));
        for (let i = 0; i < numOfEls - 1; i++) {
            const { picked, remaining } = pickUniqueItems(copyOfCoords, 1);
            const subject = i === 0
                ? pickUniqueItems(remaining, 1).picked[0]
                : pickUniqueItems(pairs, 1).picked[0][Math.floor(Math.random() * 2)];
            const a = picked[0][0];
            const b = subject[0];
            if (a === b || subjectsAlreadyIncluded(a, b)) {
                i--;
                continue;
            }
            pairs.push([picked[0], subject]);
            copyOfCoords = remaining;
        }

        const usedCoords = Object.values(
            pairs.reduce((a, c) => {
                a[c[0][0]] = c[0];
                a[c[1][0]] = c[1];
                return a;
            }, {} as Record<string, typeof coords[0]>)
        );
        question.coords3D = usedCoords;
        this.logger.info("Used coords", usedCoords);

        // Add one more pair that will represent the conclusion
        let coorda!: typeof coords[0];
        let coordb!: typeof coords[0];
        let safe = 1e2;
        while (safe-- && (!coorda || !coordb || subjectsAlreadyIncluded(coorda[0], coordb[0]))) {
            [coorda, coordb] = pickUniqueItems(usedCoords, 2).picked;
        }

        if (safe < 1) {
            this.logger.error("MAXIMUM ITERATION COUNT REACHED!");
            return this.createDirection3D(numOfPremises, type);
        }

        pairs.push([coorda, coordb]);
        this.logger.info("Pairs", pairs);

        // Calculate relationship of each pair
        const premises: IDirection3DProposition[] = [];

        for (const pair of pairs) {
            const [subja, subjb] = pair;
            const [a, ax, ay, at] = subja;
            const [b, bx, by, bt] = subjb;

            const trasversalDifference = at - bt;

            const cardinals: [string, number][] = [];
            const diffy = ay - by;
            const absdiffy = Math.abs(diffy);
            const diffx = ax - bx;
            const absdiffx = Math.abs(diffx);

            if (diffy > 0) {
                cardinals.push(["North", absdiffy]);
            } else if (diffy < 0) {
                cardinals.push(["South", absdiffy]);
            } else {
                cardinals.push(["!", 0]);
            }

            if (diffx > 0) {
                cardinals.push(["East", absdiffx]);
            } else if (diffx < 0) {
                cardinals.push(["West", absdiffx]);
            } else {
                cardinals.push(["!", 0]);
            }

            premises.push({
                pair,
                trasversalDifference,
                cardinals,
                uid: guid()
            })
        }
        this.logger.info("Premises", premises);

        // Extract the last premise and say it's the conclusion
        // Flip a coin and either keep or tweak the conclusion
        let conclusion = premises.pop()!;
        const isValid = coinFlip();
        if (isValid) {
            this.logger.info("Keep conclusion");

            // Filter out collinear cardinals
            conclusion.cardinals = conclusion.cardinals.filter(c => c[0] !== "!");
        } else {
            this.logger.info("Tweak conclusion");

            if (coinFlip()) {
                this.logger.info("Invert trasversal difference");
                conclusion.trasversalDifference = conclusion.trasversalDifference * -1;
            }

            // Filter out collinear cardinals and zero cardinals
            conclusion.cardinals = conclusion.cardinals.filter(c => c[0] !== "!" && c[1] !== 0);

            if (!conclusion.cardinals.length) {
                return this.createDirection3D(numOfPremises, type);
            }

            const rndIdx = Math.floor(Math.random() * conclusion.cardinals.length);

            if (coinFlip()) {
                this.logger.info("One cardinal flipped");
                conclusion.cardinals[rndIdx][0] = CARDINAL_OPPOSITES[conclusion.cardinals[rndIdx][0] as keyof typeof CARDINAL_OPPOSITES];
            } else {
                this.logger.info("Add one to one cardinal");
                conclusion.cardinals[rndIdx][1]++;
            }
        }

        // Keep the original transversal coordinate calculation intact.
        conclusion.trasversalDifference = conclusion.pair[0][3] - conclusion.pair[1][3];
        this.logger.info("Conclusion", conclusion);

        const stringifyProposition = (p: IDirection3DProposition) => {
            const cleanCardinals = p.cardinals.filter(([direction, steps]) => direction !== "!" && steps !== 0);
            const transversalInverted = p.trasversalDifference !== 0 && settings.enabled.negation && coinFlip();
            const cardinalInversions = cleanCardinals.map(() => settings.enabled.negation && coinFlip());
            question.negations += Number(transversalInverted) + cardinalInversions.filter(Boolean).length;
            return formatDirection3DProposition(
                p.pair[0][0],
                p.pair[1][0],
                isSpatial,
                p.trasversalDifference,
                cleanCardinals,
                { transversal: transversalInverted, cardinals: cardinalInversions },
            );
        };

        shuffle(premises);
        question.isValid = isValid;
        question.premises = premises.map(stringifyProposition);
        question.conclusion = stringifyProposition(conclusion);
        question.notes = [
            "Направления точные: севернее значит строго на север, не по диагонали."
        ];

        // TODO: Create meta relationship

        return question;
    }

    createGraphMatching(numOfPremises: number): Question {
        this.logger.info("createGraphMatching");

        const type = EnumQuestionType.GraphMatching;
        const settings = this.settings;

        if (!canGenerateQuestion(type, numOfPremises, settings)) {
            throw new Error("Cannot generate.");
        }

        const numOfEls = numOfPremises + 1;
        const symbols = getSymbols(settings);
        const words = pickUniqueItems(symbols, numOfEls).picked;
        const question = new Question(type);

        let edgeList: [string, "↔" | "→" | "←", string][] = [];
        const inverseMap = { "→": "←", "←": "→" } as Record<"→" | "←", | "→" | "←">;
        const _words = [...words];
        const isWordUsed = (w: string) => edgeList.reduce((a, c) => (a.add(c[0]), a.add(c[2]), a), new Set() as Set<string>).has(w);
        const notAllUsed = () => _words.some(w => !isWordUsed(w));
        const edgeAlreadyExists = (a: string, b: string) => edgeList.some(([_a, _, _b]) => (_a === a && _b === b) || (_a === b && _b === a));
        let safe = 1e3;
        while (safe-- && notAllUsed()) {
            const [a, b] = pickUniqueItems(_words, 2).picked;
            if (edgeAlreadyExists(a, b)) {
                continue;
            }
            const newEdge = (Math.random() < 0.25)
                ? [a, "↔", b]
                : coinFlip()
                    ? [a, "→", b]
                    : [a, "←", b];
            edgeList.push(newEdge as [string, "↔" | "→" | "←", string]);
            if (_words.length > 2 && coinFlip()) {
                const subject = coinFlip() ? a : b;
                const foundIdx = _words.indexOf(subject);
                _words.splice(foundIdx, 1);
            }
        }
        if (safe <= 0) {
            throw new Error("MAXIMUM NUMBER OF ITERATIONS REACHED!");
        }

        const edgeDiscrepancyCount = edgeList.length !== numOfPremises;
        const all3ElementsAre2Way = numOfEls === 3 && edgeList.every(([a, rel, b]) => rel === "↔");
        if (edgeDiscrepancyCount || all3ElementsAre2Way) {
            return this.createGraphMatching(numOfPremises);
        }

        const newWords = pickUniqueItems(symbols, numOfEls).picked;
        let edgeList2: typeof edgeList = edgeList.map(([a, rel, b]) => ([
            newWords[words.indexOf(a)],
            rel,
            newWords[words.indexOf(b)]
        ]));

        question.isValid = coinFlip();
        if (!question.isValid) {
            this.logger.info("Modifying graph in an invalid way");

            while (areGraphsIsomorphic(edgeList, edgeList2)) {
                const { picked } = pickUniqueItems(edgeList2, 1);
                const [a, rel, b] = picked[0];

                if (rel === "→" || rel === "←") {
                    if (Math.random() < 0.15) {
                        this.logger.info("Swap 1-way for 2-way");
                        picked[0][1] = "↔";
                    } else if (coinFlip()) {
                        this.logger.info("Rotate 1-way direction");
                        picked[0][1] = inverseMap[picked[0][1] as "→" | "←"] as "→" | "←";
                    }
                } else if (Math.random() < 0.15) {
                    this.logger.info("Swap 2-way for 1-way");
                    picked[0][1] = { "true": "→", "false": "←" }[String(coinFlip())] as "→" | "←";
                }

                if (coinFlip() && numOfEls > 3) {
                    const rndBool = coinFlip();
                    const bool2subject: Record<string, number> = { "true": 0, "false": 2 };
                    const subjectPosIdx = bool2subject[String(rndBool)];
                    const subjectNegIdx = bool2subject[String(!rndBool)];
                    const { picked: picked2 } = pickUniqueItems(edgeList2, 1);
                    let picked;
                    while (!picked || picked === picked2[0][subjectPosIdx] || picked === picked2[0][subjectNegIdx]) {
                        picked = pickUniqueItems(newWords, 1).picked[0];
                    }
                    this.logger.info("Change an edge by connecting a/b to a different subject", [picked2[0][subjectPosIdx], picked]);
                    picked2[0][subjectPosIdx] = picked;
                }
            }
        }

        const horizontalShuffle = (_edgeList: typeof edgeList) =>
            _edgeList.map(([a, rel, b]) => {
                this.logger.info("Before", [a, rel, b]);
                let result;
                if (coinFlip() && (rel === "→" || rel === "←")) {
                    result = [b, inverseMap[rel], a];
                } else {
                    result = [a, rel, b];
                }
                this.logger.info("After", result);
                return result;
            }) as typeof edgeList;

        shuffle(edgeList);
        edgeList = horizontalShuffle(edgeList);
        question.graphPremises = edgeList;
        this.logger.info("EdgeList", edgeList);

        shuffle(edgeList2);
        edgeList2 = horizontalShuffle(edgeList2);
        question.graphConclusion = edgeList2;
        this.logger.info("EdgeList2", edgeList2);

        const usedEdges = new Set<string>();
        const readable = (edges: typeof edgeList, edge: typeof edgeList[0], negated = false, meta = false) => {
            if (meta) {
                const getEdgeKey = (edge: typeof edgeList[0]) => [...edge].join(";");
                const edgeKey = getEdgeKey(edge);
                const pickedEdge = pickUniqueItems(edges, 1).picked[0];
                const pickedEdgeKey = getEdgeKey(pickedEdge);
                const relationsMatch = edge[1] === pickedEdge[1];
                const relationsAreOpposite = edge[1] !== "↔" && pickedEdge[1] !== "↔"
                    && inverseMap[edge[1]] === pickedEdge[1];
                if (
                    !usedEdges.has(pickedEdgeKey) &&
                    edgeKey !== pickedEdgeKey &&
                    (relationsMatch || relationsAreOpposite)
                ) {
                    usedEdges.add(edgeKey);
                    usedEdges.add(pickedEdgeKey);
                    let firstPair = [edge[0], edge[2]];
                    let secondPair = relationsAreOpposite
                        ? [pickedEdge[2], pickedEdge[0]]
                        : [pickedEdge[0], pickedEdge[2]];
                    const reverseView = coinFlip() && edge[1] !== "↔";
                    if (reverseView) {
                        firstPair = [firstPair[1], firstPair[0]];
                        secondPair = [secondPair[1], secondPair[0]];
                    }
                    this.logger.info("Metarelated");
                    question.metaRelations++;
                    return formatGraphMeta(
                        firstPair[0],
                        firstPair[1],
                        secondPair[0],
                        secondPair[1],
                    );
                }
            } else if (negated && (edge[1] === "→" || edge[1] === "←")) {
                this.logger.info("Negated");
                question.negations++;
                return formatGraphEdge(edge[0], edge[1], edge[2], true);
            }
            return formatGraphEdge(edge[0], edge[1], edge[2]);
        };

        question.premises = edgeList.map((edge, _, edges) =>
            readable(
                edges,
                edge,
                settings.enabled.negation && coinFlip(),
                settings.enabled.meta && coinFlip()
            )
        );
        question.conclusion = edgeList2.map((edge, _, edges) =>
            readable(
                edges,
                edge,
                settings.enabled.negation && coinFlip(),
                settings.enabled.meta && coinFlip()
            ));

        question.instructions = [
            "Проверь, одинаково ли устроены два графа."
        ];

        return question;
    }

    createAnalogy(length: number) {
        this.logger.info("createAnalogy");

        const topType = EnumQuestionType.Analogy;
        const settings = this.settings;

        if (!canGenerateQuestion(topType, length, settings)) {
            throw new Error("Cannot generate.");
        }

        const choiceIndices = [];
        if (settings.question[EnumQuestionType.Distinction].enabled) {
            choiceIndices.push(0);
        }

        // Randomly pick one comparison question from the comparison questions enabled
        const comparisonChoices = [];
        if (settings.question[EnumQuestionType.ComparisonNumerical].enabled) {
            comparisonChoices.push(1);
        }
        if (settings.question[EnumQuestionType.ComparisonChronological].enabled) {
            comparisonChoices.push(2);
        }
        if (comparisonChoices.length) {
            choiceIndices.push(pickUniqueItems(comparisonChoices, 1).picked[0]);
        }

        // Randomly pick one direction question from the direction questions enabled
        const directionsChoices = [];
        if (settings.question[EnumQuestionType.Direction].enabled) {
            directionsChoices.push(3);
        }
        if (settings.question[EnumQuestionType.Direction3DSpatial].enabled) {
            directionsChoices.push(4);
        }
        if (settings.question[EnumQuestionType.Direction3DTemporal].enabled) {
            directionsChoices.push(5);
        }
        if (directionsChoices.length) {
            choiceIndices.push(pickUniqueItems(directionsChoices, 1).picked[0]);
        }

        // Randomly pick one arrangement from enabled arrangements
        const arrangementChoices = [];
        if (settings.question[EnumQuestionType.LinearArrangement].enabled) {
            arrangementChoices.push(6);
        }
        if (settings.question[EnumQuestionType.CircularArrangement].enabled) {
            arrangementChoices.push(7);
        }
        if (arrangementChoices.length) {
            choiceIndices.push(pickUniqueItems(arrangementChoices, 1).picked[0]);
        }

        const choiceIndex = pickUniqueItems(choiceIndices, 1).picked[0];

        let question = new Question(topType);
        let isValidSame;
        let a: string | undefined;
        let b: string | undefined;
        let c: string | undefined;
        let d: string | undefined;
        let indexOfA, indexOfB, indexOfC, indexOfD;

        const flip = coinFlip();

        switch (choiceIndex) {
            case 0:
                question = this.createDistinction(length);
                question.type = topType;
                question.conclusion = "";

                const [pickedA, pickedB, pickedC, pickedD] = pickUniqueItems(
                    [...question.buckets[0], ...question.buckets[1]],
                    4,
                ).picked;
                [a, b, c, d] = [pickedA[0], pickedB[0], pickedC[0], pickedD[0]];

                [
                    indexOfA,
                    indexOfB,
                    indexOfC,
                    indexOfD
                ] = [
                        Number(question.buckets[0].indexOf(pickedA) !== -1),
                        Number(question.buckets[0].indexOf(pickedB) !== -1),
                        Number(question.buckets[0].indexOf(pickedC) !== -1),
                        Number(question.buckets[0].indexOf(pickedD) !== -1)
                    ];
                isValidSame = (indexOfA === indexOfB && indexOfC === indexOfD) || (indexOfA !== indexOfB && indexOfC !== indexOfD);
                break;
            case 1:
            case 2:
                const type = (choiceIndex === 1)
                    ? EnumQuestionType.ComparisonNumerical
                    : EnumQuestionType.ComparisonChronological;
                question = this.createComparison(length, type);
                question.type = topType;
                question.conclusion = "";

                [a, b, c, d] = pickUniqueItems(question.bucket, 4).picked;

                [indexOfA, indexOfB] = [question.bucket.indexOf(a), question.bucket.indexOf(b)];
                [indexOfC, indexOfD] = [question.bucket.indexOf(c), question.bucket.indexOf(d)];
                isValidSame = (indexOfA > indexOfB && indexOfC > indexOfD) || (indexOfA < indexOfB && indexOfC < indexOfD);
                break;
            case 3:
                while (flip !== isValidSame) {
                    question = this.createDirection(length);
                    question.type = topType;
                    question.conclusion = "";

                    const [coordsa, coordsb, coordsc, coordsd] = pickUniqueItems(question.coords, 4).picked;
                    [a, b, c, d] = [coordsa[0], coordsb[0], coordsc[0], coordsd[0]];

                    const dxatob = coordsa[1] - coordsb[1];
                    const dyatob = coordsa[2] - coordsb[2];

                    const dxctod = coordsc[1] - coordsd[1];
                    const dyctod = coordsc[2] - coordsd[2];

                    isValidSame = (dxatob === dxctod) && (dyatob === dyctod);
                }
                break;
            case 4:
            case 5: {
                const type = (choiceIndex === 4)
                    ? EnumQuestionType.Direction3DSpatial
                    : EnumQuestionType.Direction3DTemporal;
                while (flip !== isValidSame) {
                    question = this.createDirection3D(length, type);
                    question.type = topType;
                    question.conclusion = "";

                    const [coordsa, coordsb, coordsc, coordsd] = pickUniqueItems(question.coords3D, 4).picked;
                    [a, b, c, d] = [coordsa[0], coordsb[0], coordsc[0], coordsd[0]];

                    const dxatob = coordsa[1] - coordsb[1];
                    const dyatob = coordsa[2] - coordsb[2];
                    const dtatob = coordsa[3] - coordsb[3];

                    const dxctod = coordsc[1] - coordsd[1];
                    const dyctod = coordsc[2] - coordsd[2];
                    const dtctod = coordsc[3] - coordsd[3];

                    isValidSame = (dxatob === dxctod) && (dyatob === dyctod) && (dtatob === dtctod);
                }
                break;
            }
            case 6:
            case 7: {
                const type = (choiceIndex === 6)
                    ? EnumQuestionType.LinearArrangement
                    : EnumQuestionType.CircularArrangement;
                const isLinear = type === EnumQuestionType.LinearArrangement;
                question = this.createArrangement(length, type);
                question.type = topType;
                question.conclusion = "";
                question.notes = [];
                if (isLinear) {
                    question.notes.push("Связи считаются одинаковыми при равном расстоянии и направлении.");
                } else {
                    question.notes.push("Учитывай расстояние, направление и положение напротив.");
                }

                const subjects = question.rule.split(", ");
                [a, b, c, d] = pickUniqueItems(subjects, 4).picked;

                const [idxA, idxB, idxC, idxD] = [
                    subjects.indexOf(a),
                    subjects.indexOf(b),
                    subjects.indexOf(c),
                    subjects.indexOf(d)
                ];

                const getWays = isLinear ? getLinearWays : getCircularWays;

                const waysA2B = getWays(idxA, idxB, length + 1, true, true);
                const waysC2D = getWays(idxC, idxD, length + 1, true, true);

                this.logger.info("Ways A2B", waysA2B);
                this.logger.info("Ways C2D", waysC2D);

                isValidSame = false;
                for (const key in waysA2B) {
                    if (waysA2B[key].possible && waysC2D[key].possible && waysA2B[key].steps === waysC2D[key].steps) {
                        isValidSame = true;
                    }
                }
                this.logger.info('Is a valid "same" relationship?', isValidSame);

                break;
            }
        }

        if (isValidSame === undefined) {
            throw new Error("Shouldn't be here...");
        }

        const isSameRelationship = coinFlip();
        question.isValid = isSameRelationship ? isValidSame : !isValidSame;

        const analogyIsInverted = settings.enabled.negation && coinFlip();
        if (analogyIsInverted) {
            question.negations++;
        }
        question.conclusion = formatAnalogyConclusion(a!, b!, c!, d!, isSameRelationship, analogyIsInverted);

        return question;
    }

    createBinary(numOfPremises: number) {
        this.logger.info("createBinary");

        const topType = EnumQuestionType.Binary;
        const settings = this.settings;

        if (!canGenerateQuestion(topType, numOfPremises, settings)) {
            throw new Error("Cannot generate.");
        }

        const operators: BinaryOperator[] = [];

        if (settings.enabled.binary.and) {
            operators.push("and");
        }
        if (settings.enabled.binary.nand) {
            operators.push("nand");
        }
        if (settings.enabled.binary.or) {
            operators.push("or");
        }
        if (settings.enabled.binary.nor) {
            operators.push("nor");
        }
        if (settings.enabled.binary.xor) {
            operators.push("xor");
        }
        if (settings.enabled.binary.xnor) {
            operators.push("xnor");
        }

        const question = new Question(topType);
        const flip = coinFlip();
        const operator = operators[Math.floor(Math.random() * operators.length)];
        const expression = BINARY_EXPRESSIONS[operator];

        let safe = 1e2;
        do {
            const a = this.createRandomQuestion(Math.floor(numOfPremises / 2), true);
            const b = this.createRandomQuestion(Math.ceil(numOfPremises / 2), true);
            const choices = [a, b];

            question.instructions = [fixBinaryInstructions(a), fixBinaryInstructions(b)].filter(instr => !!instr);
            question.metaRelations = a.metaRelations + b.metaRelations;

            question.premises = [...choices[0].premises, ...choices[1].premises];
            shuffle(question.premises);

            question.conclusion = formatBinaryConclusion(
                operator,
                Array.isArray(choices[0].conclusion) ? choices[0].conclusion[0] : choices[0].conclusion,
                Array.isArray(choices[1].conclusion) ? choices[1].conclusion[0] : choices[1].conclusion,
            );

            question.isValid = evaluateBinaryExpression(expression, choices[0].isValid, choices[1].isValid);
        } while (safe-- && flip !== question.isValid);

        if (safe <= 0) {
            throw new Error("MAXIMUM NUMBER OF ITERATIONS REACHED!");
        }

        return question;
    }

    private createSyllogismAll(numOfPremises: number) {
        this.logger.info("createSyllogismAll");
        if (coinFlip()) {
            return this.createSyllogismFredo(numOfPremises);
        } else {
            return this.createSyllogismCanyon(numOfPremises);
        }
    }

    private createSyllogismFredo(numOfPremises: number) {
        this.logger.info("createSyllogismFredo");

        const type = EnumQuestionType.Syllogism;
        const settings = this.settings;

        if (!canGenerateQuestion(type, numOfPremises, settings)) {
            throw new Error("Cannot generate.");
        }

        const length = numOfPremises + 1;
        const question = new Question(type);
        question.isValid = coinFlip();

        do {
            question.rule = question.isValid ? getRandomRuleValid() : getRandomRuleInvalid();
            question.bucket = getRandomSymbols(settings, length);
            question.premises = [];

            [
                question.premises[0],
                question.premises[1],
                question.conclusion
            ] = getSyllogism(
                settings,
                question.bucket[0],
                question.bucket[1],
                question.bucket[2],
                question.isValid ? getRandomRuleValid() : getRandomRuleInvalid()
            );
        } while (isPremiseLikeConclusion(question.premises, question.conclusion));

        for (let i = 3; i < length; i++) {
            const rnd = Math.floor(Math.random() * (i - 1));
            const flip = coinFlip();
            const [p, m] = flip ? [question.bucket[i], question.bucket[rnd]] : [question.bucket[rnd], question.bucket[i]];
            question.premises.push(getSyllogism(settings, "#####", p, m, getRandomRuleInvalid())[0]);
        }

        shuffle(question.premises);

        return question;
    }

    private createSyllogismCanyon(numOfPremises: number) {
        this.logger.info("createSyllogismCanyon");

        const type = EnumQuestionType.Syllogism;
        const settings = this.settings;

        if (!canGenerateQuestion(type, numOfPremises, settings)) {
            throw new Error("Cannot generate.");
        }

        const question = new Question(type);
        const minDepth = Math.min(2, numOfPremises);
        const maxDepth = numOfPremises;
        const chainDepth = Math.floor(Math.random() * (maxDepth - minDepth + 1)) + minDepth;
        const chainTermsNeeded = chainDepth + 1;
        const numDistractors = numOfPremises - chainDepth;
        const minExtra = Math.ceil(numDistractors / chainTermsNeeded);
        const maxExtra = numDistractors;
        const extra = Math.floor(Math.random() * (maxExtra - minExtra + 1)) + minExtra;
        const poolSize = chainTermsNeeded + extra;
        const termPool = getRandomSymbols(settings, poolSize);
        const wantTrue = coinFlip();
        const { premises, conclusion, conclusionIsTrue } = generatePolysyllogism({
            nPremises: numOfPremises,
            chainDepth,
            termPool,
            trueConclusion: wantTrue,
        });

        const negated = settings.enabled.negation && coinFlip();

        question.bucket = termPool;
        question.isValid = conclusionIsTrue;
        question.premises = premises.map(p => formatSylPremise(p, negated));
        question.conclusion = formatSylPremise(conclusion, negated);

        return question;
    }

    createSyllogism(numOfPremises: number) {
        switch (getSyllogismGeneratorValue()) {
            case SyllogismGenerator.All:
                return this.createSyllogismAll(numOfPremises);
            case SyllogismGenerator.Fredo:
                return this.createSyllogismFredo(numOfPremises);
            case SyllogismGenerator.Canyon:
                return this.createSyllogismCanyon(numOfPremises);
            default:
                return this.createSyllogismAll(numOfPremises);
        }
    }
}
