import { Component, HostListener, Inject, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { ResponseScore, UserReasoningResponse } from "../reasoning-core/models/response.models";
import {
    GenerationRequest,
    GenerationResult,
    InferenceClassification,
    ReasoningFamily,
    ReasoningItem,
    ResponseFormat,
    SemanticWorld,
} from "../reasoning-core/models/semantic.models";
import { scoreReasoningResponse } from "../reasoning-core/feedback/response-scorer";
import { renderPremiseRu } from "../reasoning-core/rendering/russian-renderer";
import { FAMILY_LABEL_RU, RESPONSE_FORMAT_LABEL_RU } from "../reasoning-core/rendering/ru-catalog";
import {
    ConfidenceRating,
    EXPERIMENTAL_STORE_SCHEMA_VERSION,
    ExperimentalSessionRecord,
    ExperimentalSettingsRecord,
    ExperimentalTrialRecord,
    ExposureRecord,
} from "../persistence/experimental-records";
import { ExperimentalRepository } from "../persistence/experimental-repository";
import { ActiveTimerService } from "../training/active-timer";
import {
    RecentTrainingOutcome,
    ScheduledTarget,
    TransparentSchedulerService,
    DEFAULT_CURRICULUM,
} from "../training/transparent-scheduler";
import { RESPONSE_COMPATIBILITY } from "../training/response-compatibility";
import { GENERATION_FACADE, GenerationFacade } from "./generation-facade";
import { ResponseControlsComponent } from "./response-controls.component";
import { learnerInstructionsRu, renderLearnerQueryRu } from "./learner-prompt";
import { BoundedPrefetchQueue } from "../workers/prefetch-queue";

type TrainingState = "starting" | "generating" | "answering" | "feedback" | "timedOut" | "error" | "finished";

@Component({
    selector: "app-experimental-training",
    templateUrl: "./training.component.html",
    styleUrls: ["./training.component.css"],
})
export class ExperimentalTrainingComponent implements OnInit, OnDestroy {
    @ViewChild(ResponseControlsComponent) controls?: ResponseControlsComponent;

    state: TrainingState = "starting";
    settings?: ExperimentalSettingsRecord;
    session?: ExperimentalSessionRecord;
    item?: ReasoningItem;
    scheduled?: ScheduledTarget;
    response: UserReasoningResponse | null = null;
    score?: ResponseScore;
    confidence?: ConfidenceRating;
    errorMessage = "";
    reloadNotice = "";
    paused = false;
    detailsOpen = false;
    completedCount = 0;
    activeSessionMs = 0;
    premiseStep = 0;
    memoryHidden = false;
    readonly families = Object.keys(FAMILY_LABEL_RU) as ReasoningFamily[];
    selectedFamily: ReasoningFamily | "automatic" = "automatic";
    selectedFormat: ResponseFormat = "threeWayInference";
    selectedLevel: 1 | 2 | 3 | 4 | 5 = 1;
    operatorComprehensionConfirmed = false;
    workspace = "";
    savingResponse = false;

    private readonly recentOutcomes: RecentTrainingOutcome[] = [];
    private completedItemIds: string[] = [];
    private activeBeforeItemMs = 0;
    private currentRequestId?: string;
    private ticker?: ReturnType<typeof setInterval>;
    private generationEpoch = 0;
    private issuedItemCount = 0;
    private readonly timedOutItemIds: string[] = [];
    private answerFocus?: HTMLElement;
    private readonly prefetchQueue: BoundedPrefetchQueue;
    private prefetchPromise?: Promise<void>;
    private queuedScheduled?: ScheduledTarget;
    private queuedTargetKey?: string;
    private currentWasPrefetched = false;

    constructor(
        private readonly repository: ExperimentalRepository,
        private readonly scheduler: TransparentSchedulerService,
        private readonly timer: ActiveTimerService,
        @Inject(GENERATION_FACADE) private readonly generator: GenerationFacade,
    ) { this.prefetchQueue = new BoundedPrefetchQueue(generator, 1); }

    async ngOnInit(): Promise<void> {
        await this.repository.initialize();
        this.settings = await this.repository.getSettings();
        await this.closeReloadedSession();
        const now = Date.now();
        this.session = {
            id: `training-v1:${now}`,
            schemaVersion: EXPERIMENTAL_STORE_SCHEMA_VERSION,
            partition: "training",
            protocolVersion: "experimental-training-session/1.0.0",
            startedAt: now,
            activeDurationMs: 0,
            completedItemIds: [],
            interruptedByReload: false,
            settingsSnapshot: { ...this.settings, assessmentSchedule: { ...this.settings.assessmentSchedule } },
        };
        await this.repository.saveSession(this.session);
        this.prefetchQueue.startSession(this.session.id);
        this.ticker = setInterval(() => this.refreshElapsed(), 500);
        await this.nextItem();
    }

    ngOnDestroy(): void {
        this.generationEpoch++;
        this.prefetchQueue.retireSession();
        if (this.currentRequestId) this.generator.cancel(this.currentRequestId);
        if (this.ticker) clearInterval(this.ticker);
        this.timer.pause("itemNotReady");
    }

    premiseText(index: number): string {
        return this.item ? renderPremiseRu(this.item.premises[index], this.item.entities) : "";
    }

    queryText(): string { return this.item ? renderLearnerQueryRu(this.item) : ""; }
    instructionsRu(): string[] { return this.item ? learnerInstructionsRu(this.item) : []; }
    familyText(): string { return this.item ? FAMILY_LABEL_RU[this.item.family] : ""; }
    responseFormatText(): string { return this.item ? RESPONSE_FORMAT_LABEL_RU[this.item.responseSpec.kind] : ""; }
    activeTimeText(): string { return this.durationText(this.activeSessionMs); }
    targetTimeText(): string { return `${this.settings?.sessionMinutes ?? 30} мин`; }
    askConfidence(): boolean { return this.completedCount % 4 === 3; }
    familyLabel(family: ReasoningFamily): string { return FAMILY_LABEL_RU[family]; }
    formatLabel(format: ResponseFormat): string { return RESPONSE_FORMAT_LABEL_RU[format]; }
    availableFormats(): readonly ResponseFormat[] { return this.selectedFamily === "automatic" ? ["threeWayInference"] : RESPONSE_COMPATIBILITY[this.selectedFamily]; }
    changePracticeFamily(): void {
        this.changePracticeTarget();
        this.selectedFormat = "threeWayInference";
        this.selectedLevel = 1;
        this.operatorComprehensionConfirmed = false;
    }
    changePracticeTarget(): void {
        this.prefetchQueue.invalidateForSettingsChange();
        this.queuedScheduled = undefined;
        this.queuedTargetKey = undefined;
        this.prefetchPromise = undefined;
    }

    get premisesReady(): boolean {
        if (!this.item || !this.settings) return false;
        if (this.settings.memoryVisibility === "visible") return true;
        if (this.settings.memoryVisibility === "sequential") return this.premiseStep >= this.item.premises.length - 1;
        return this.memoryHidden;
    }

    visiblePremiseIndexes(): number[] {
        if (!this.item || !this.settings) return [];
        const ordered = this.item.presentation.premiseOrder.map(id => this.item!.premises.findIndex(premise => premise.id === id)).filter(index => index >= 0);
        if (this.settings.memoryVisibility === "sequential") return [ordered[Math.min(this.premiseStep, ordered.length - 1)]];
        if (this.settings.memoryVisibility === "memoryLoaded" && this.memoryHidden) return [];
        return ordered;
    }

    advancePremise(): void {
        if (!this.item) return;
        this.premiseStep = Math.min(this.item.premises.length - 1, this.premiseStep + 1);
    }

    hidePremises(): void { this.memoryHidden = true; }

    setResponse(response: UserReasoningResponse | null): void { this.response = response; }

    async submit(): Promise<void> {
        if (!this.item || !this.response || this.state !== "answering" || this.savingResponse || this.paused || !this.premisesReady || (this.askConfidence() && !this.confidence)) return;
        this.savingResponse = true;
        this.timer.pause("feedback");
        this.score = scoreReasoningResponse(this.item, this.response);
        const timerSnapshot = this.timer.snapshot();
        const answeredAt = Date.now();
        const trial: ExperimentalTrialRecord = {
            id: `${this.session!.id}:${this.item.id}`,
            schemaVersion: EXPERIMENTAL_STORE_SCHEMA_VERSION,
            sessionId: this.session!.id,
            partition: "training",
            itemId: this.item.id,
            seed: this.item.seed,
            family: this.item.family,
            componentFamilies: [...this.item.componentFamilies],
            structureFamily: this.item.structureFamily,
            structuralFingerprint: this.item.structuralFingerprint,
            generatorVersion: this.item.generatorVersion,
            semanticsVersion: this.item.semanticsVersion,
            solverVersion: this.item.solverVersion,
            provenance: this.item.provenance,
            targetComplexity: this.item.targetComplexity,
            measuredComplexity: this.item.measuredComplexity,
            response: this.response,
            expectedClassification: this.item.semanticCertificate.classification,
            correct: this.score.correct,
            activeDurationMs: timerSnapshot.activeDurationMs,
            confidence: this.askConfidence() ? this.confidence : undefined,
            scaffoldsUsed: this.settings?.scaffoldsEnabled ? [...this.item.presentation.scaffolds, ...(this.workspace.trim() ? ["externalWorkspace"] : [])] : [],
            pauses: timerSnapshot.pauses,
            answeredAt,
            certificateTrust: "locallyVerified",
        };
        await this.repository.saveTrial(trial);
        if (this.scheduled) {
            await this.scheduler.recordTrainingOutcome(this.scheduled.candidate, this.score.correct, answeredAt, this.score.correct);
        }
        this.recentOutcomes.push({
            correct: this.score.correct,
            activeDurationMs: timerSnapshot.activeDurationMs,
            family: this.item.family,
            structureFamily: this.item.structureFamily,
        });
        this.activeBeforeItemMs += timerSnapshot.activeDurationMs;
        this.activeSessionMs = this.activeBeforeItemMs;
        this.completedCount++;
        this.completedItemIds.push(this.item.id);
        await this.saveSession(false);
        this.detailsOpen = false;
        this.state = "feedback";
        this.savingResponse = false;
        this.refreshElapsed();
        this.prefetchFocusedItem();
    }

    async nextItem(): Promise<void> {
        if (!this.settings || !this.session) return;
        const generationEpoch = ++this.generationEpoch;
        if (this.activeBeforeItemMs >= this.settings.sessionMinutes * 60_000) {
            await this.finish();
            return;
        }
        this.state = "generating";
        this.paused = false;
        this.errorMessage = "";
        this.workspace = "";
        this.response = null;
        this.score = undefined;
        this.confidence = undefined;
        this.premiseStep = 0;
        this.memoryHidden = false;
        this.timer.beginGeneration();
        if (this.prefetchPromise) await this.prefetchPromise;
        if (generationEpoch !== this.generationEpoch) return;
        const prefetched = this.queuedTargetKey === this.practiceTargetKey() ? this.prefetchQueue.take() : undefined;
        const queuedScheduled = this.queuedScheduled;
        this.prefetchPromise = undefined;
        this.queuedScheduled = undefined;
        this.queuedTargetKey = undefined;
        this.currentWasPrefetched = !!prefetched;
        this.scheduled = prefetched && queuedScheduled ? queuedScheduled : await this.scheduler.select(this.recentOutcomes, Date.now(), this.generator.supportedFamilies());
        if (generationEpoch !== this.generationEpoch) return;
        if (this.selectedFamily !== "automatic") {
            if ((this.selectedLevel > 1 || this.selectedFormat !== "threeWayInference") && !this.operatorComprehensionConfirmed) {
                this.state = "error";
                this.errorMessage = "Перед новым оператором или форматом прочитайте правило и подтвердите его понимание. Можно начать с первого уровня и выбора логического статуса.";
                return;
            }
            const base = DEFAULT_CURRICULUM.find(candidate => candidate.family === this.selectedFamily)!;
            const primaryDimension = this.selectedFamily === "contextScope" && this.selectedLevel >= 3 ? "bindingInterference" : base.primaryDimension;
            this.scheduled = {
                ...this.scheduled,
                candidate: { ...base, primaryDimension, structureFamily: `manual-${this.selectedFamily}-${this.selectedFormat}-${this.selectedLevel}`, level: this.selectedLevel, responseFormat: this.selectedFormat, displayedPremises: { min: 1, max: this.selectedFamily === "graphStructure" ? 8 : 6 } },
                target: { ...this.scheduled.target, primaryDimension, level: this.selectedLevel, responseFormat: this.selectedFormat, displayedPremises: { min: 1, max: this.selectedFamily === "graphStructure" ? 8 : 6 } },
                explanationRu: "Направление, формат и уровень выбраны вами. Память и время не изменяются автоматически.",
            };
        }
        const protectedFingerprints = new Set((await this.repository.listExposures())
            .filter(exposure => exposure.partition === "assessment")
            .map(exposure => exposure.structuralFingerprint));
        if (generationEpoch !== this.generationEpoch) return;
        for (let candidateAttempt = 0; candidateAttempt < 8; candidateAttempt++) {
            const request: GenerationRequest = {
                requestId: `${this.session.id}:request:${this.issuedItemCount}:candidate:${candidateAttempt}`,
                seed: `${this.session.id}::${this.issuedItemCount}::candidate:${candidateAttempt}`,
                family: this.scheduled.candidate.family,
                partition: "training",
                target: this.scheduled.target,
                semanticsVersion: this.settings.semanticsVersion,
                maxAttempts: 32,
                wallTimeBudgetMs: 900,
            };
            this.currentRequestId = request.requestId;
            const result: GenerationResult = candidateAttempt === 0 && prefetched ? { ok: true, item: prefetched } : await this.generator.generate(request);
            if (generationEpoch !== this.generationEpoch || this.currentRequestId !== request.requestId) return;
            if (!result.ok) {
                this.errorMessage = result.messageRu;
                if (!result.recoverable || result.code === "cancelled") break;
                continue;
            }
            if (!result.item.semanticCertificate.premisesSatisfiable || result.item.grammarPartition !== "training") {
                this.errorMessage = "Неподходящее задание отклонено до показа.";
                continue;
            }
            if (protectedFingerprints.has(result.item.structuralFingerprint)) {
                this.errorMessage = "Структура зарезервирована для независимой оценки; подбирается другая.";
                continue;
            }
            this.item = result.item;
            this.issuedItemCount++;
            await this.recordExposure(result.item, Date.now());
            if (generationEpoch !== this.generationEpoch) return;
            this.currentRequestId = undefined;
            this.state = "answering";
            this.timer.itemVisible();
            setTimeout(() => document.querySelector<HTMLElement>(".response-controls button, .response-controls input, .response-controls select")?.focus(), 0);
            return;
        }
        this.currentRequestId = undefined;
        this.state = "error";
        if (!this.errorMessage) this.errorMessage = "Не удалось подготовить новое задание в пределах восьми попыток.";
    }

    togglePause(): void {
        if (this.state !== "answering") return;
        this.paused = !this.paused;
        if (this.paused) {
            this.answerFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
            this.timer.pause("manual");
        } else {
            this.timer.resume("manual");
            setTimeout(() => (this.answerFocus?.isConnected ? this.answerFocus : document.querySelector<HTMLElement>(".response-controls button, .response-controls input, .response-controls select"))?.focus(), 0);
        }
        this.refreshElapsed();
    }

    async finish(): Promise<void> {
        if (!this.session) return;
        this.generationEpoch++;
        this.prefetchQueue.retireSession();
        if (this.currentRequestId) {
            const requestId = this.currentRequestId;
            this.currentRequestId = undefined;
            this.generator.cancel(requestId);
        }
        this.timer.pause("itemNotReady");
        if (this.state === "answering") {
            const current = this.timer.snapshot().activeDurationMs;
            this.activeSessionMs = this.activeBeforeItemMs + current;
        }
        await this.saveSession(true);
        this.state = "finished";
        if (this.ticker) clearInterval(this.ticker);
    }

    showWorld(world: SemanticWorld | undefined): string[] {
        if (!world || !this.item) return ["Модель недоступна."];
        const label = (id: string) => this.item!.entities.find(entity => entity.id === id)?.label ?? id;
        switch (world.kind) {
            case "categoricalWorld": return world.witnesses.map((witness, index) => `Объект ${index + 1}: ${witness.classes.map(label).join(", ") || "без отмеченных классов"}.`);
            case "positionWorld": return world.positions.map(entry => `${label(entry.entityId)}: позиция ${entry.value}.`);
            case "intervalWorld": return world.intervals.map(entry => `${label(entry.entityId)}: от ${entry.start} до ${entry.end}.`);
            case "propositionWorld": return world.values.map(entry => `${entry.propositionId}: ${entry.value ? "истинно" : "ложно"}.`);
            case "mappingWorld": return world.pairs.map(pair => `${label(pair.source)} → ${label(pair.target)}.`);
            case "transformWorld": return [`Начало: (${world.initialPoint.join("; ")}); результат: (${world.finalPoint.join("; ")}).`];
            case "scopeWorld": return world.relationPairs.map(pair => `${label(pair[0])} связан(а) с ${label(pair[1])}.`);
            case "contextScopeWorld": return world.frames.flatMap(frame => [
                `Контекст «${label(frame.contextId)}»: ${frame.relation === "reads" ? "чтение" : frame.relation === "signalsTo" ? "передача сигнала" : frame.relation === "sees" ? "видимость" : "предшествование"}; первая роль — «${label(frame.subjectClass)}», вторая — «${label(frame.objectClass)}».`,
                ...frame.relationPairs.map(pair => `Направленная пара: от «${label(pair[0])}» к «${label(pair[1])}».`),
                ...(frame.relationPairs.length ? [] : ["Выполняющихся пар нет."]),
            ]);
            case "membershipWorld": return world.memberships.map(entry => `${label(entry.objectId)} принадлежит классу «${label(entry.classId)}».`);
            case "membershipOrderWorld": return [
                `Члены отмеченного класса: ${world.memberObjectIds.map(label).join(", ") || "нет"}.`,
                `Выбранная роль: ${label(world.focusObjectId)}.`,
                ...world.positions.map(entry => `${label(entry.entityId)}: позиция ${entry.value}.`),
            ];
            case "temporalSpatialWorld": return [
                ...world.intervals.map(entry => `${label(entry.entityId)}: от ${entry.start} до ${entry.end}.`),
                `Выбранное преобразование: ${world.recipeOperator === "rotate90" ? "поворот на 90°" : world.recipeOperator === "reflectHorizontal" ? "отражение относительно горизонтальной оси" : world.recipeOperator === "reflectVertical" ? "отражение относительно вертикальной оси" : "преобразование по объявленному правилу"}.`,
                `Результат: (${world.outputPoint.join("; ")}).`,
            ];
            case "mappingQuantityWorld": return [
                ...world.mapping.map(pair => `${label(pair.source)} → ${label(pair.target)}.`),
                ...world.quantities.map(entry => `${label(entry.targetId)}: ${entry.value.numerator}/${entry.value.denominator}.`),
                `Выбранная роль: ${label(world.selectedTargetId)}.`,
            ];
            default: return ["Подробное представление этой модели пока недоступно; проверка условий выполнена решателем."];
        }
    }

    @HostListener("document:keydown", ["$event"])
    handleKeyboard(event: KeyboardEvent): void {
        const target = event.target as HTMLElement | null;
        if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
        if (event.key.toLowerCase() === "p" || event.key.toLowerCase() === "з") {
            event.preventDefault(); this.togglePause(); return;
        }
        if (this.state === "answering" && !this.paused && this.item && ["threeWayInference", "updateAfterPremiseChange"].includes(this.item.responseSpec.kind)) {
            const classification = ({ "1": "entailed", "2": "refuted", "3": "underdetermined" } as Record<string, InferenceClassification>)[event.key];
            if (classification) { event.preventDefault(); this.controls?.chooseClassification(classification); return; }
        }
        if (event.key === "Enter" && this.state === "answering" && this.response) { event.preventDefault(); void this.submit(); }
        else if (event.key === "Enter" && this.state === "feedback") { event.preventDefault(); void this.nextItem(); }
    }

    private refreshElapsed(): void {
        if (this.state === "answering" && this.settings?.timePressure === "limited" && this.timer.snapshot().activeDurationMs >= (this.settings.timeLimitSeconds ?? 90) * 1_000) {
            this.timer.pause("manual");
            this.activeBeforeItemMs += this.timer.snapshot().activeDurationMs;
            if (this.item) this.timedOutItemIds.push(this.item.id);
            this.response = null;
            this.state = "timedOut";
            this.activeSessionMs = this.activeBeforeItemMs;
            void this.saveSession(false);
        }
        this.activeSessionMs = this.activeBeforeItemMs + (this.state === "answering" ? this.timer.snapshot().activeDurationMs : 0);
    }
    /** One focused follow-up, then a fresh scheduler selection; never an indefinite stale target. */
    private prefetchFocusedItem(): void {
        if (!this.settings || !this.session || !this.scheduled || this.currentWasPrefetched || this.state !== "feedback") return;
        const targetKey = this.practiceTargetKey();
        this.queuedTargetKey = targetKey;
        this.queuedScheduled = { ...this.scheduled, explanationRu: "Подготовлено одно повторное задание того же направления и структурного уровня. Затем планировщик заново учтёт результаты." };
        this.prefetchPromise = this.prefetchQueue.prefetch({
            requestId: `${this.session.id}:prefetch:${this.issuedItemCount}`,
            seed: `${this.session.id}::${this.issuedItemCount}::focused-prefetch`,
            family: this.scheduled.candidate.family, partition: "training", target: this.scheduled.target,
            semanticsVersion: this.settings.semanticsVersion, maxAttempts: 32, wallTimeBudgetMs: 900,
        }).then(() => {});
    }
    private practiceTargetKey(): string { return JSON.stringify([this.selectedFamily, this.selectedFormat, this.selectedLevel, this.settings]); }

    private async closeReloadedSession(): Promise<void> {
        const previous = (await this.repository.listSessions())
            .filter(session => session.partition === "training" && session.endedAt === undefined)
            .sort((a, b) => b.startedAt - a.startedAt)[0];
        if (!previous) return;
        await this.repository.saveSession({ ...previous, endedAt: Date.now(), interruptedByReload: true });
        this.reloadNotice = "Предыдущая незавершённая сессия отмечена как прерванная. Время после перезагрузки к решению не добавлено.";
    }

    private async saveSession(finished: boolean): Promise<void> {
        if (!this.session) return;
        this.session = {
            ...this.session,
            endedAt: finished ? Date.now() : undefined,
            activeDurationMs: this.activeSessionMs,
            completedItemIds: [...this.completedItemIds],
            timedOutItemIds: [...this.timedOutItemIds],
        };
        await this.repository.saveSession(this.session);
    }

    private async recordExposure(item: ReasoningItem, now: number): Promise<void> {
        const existing = (await this.repository.listExposures()).find(record => record.structuralFingerprint === item.structuralFingerprint && record.partition === "training");
        const exposure: ExposureRecord = existing
            ? { ...existing, lastSeenAt: now, count: existing.count + 1 }
            : {
                id: `training::${item.structuralFingerprint}`,
                schemaVersion: EXPERIMENTAL_STORE_SCHEMA_VERSION,
                structuralFingerprint: item.structuralFingerprint,
                partition: "training",
                family: item.family,
                firstSeenAt: now,
                lastSeenAt: now,
                count: 1,
            };
        await this.repository.saveExposure(exposure);
    }

    private durationText(milliseconds: number): string {
        const minutes = Math.floor(milliseconds / 60_000);
        const seconds = Math.floor((milliseconds % 60_000) / 1_000);
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }
}
