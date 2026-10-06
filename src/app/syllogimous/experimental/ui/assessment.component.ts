import { Component, HostListener, Inject, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { AssessmentSessionService, AssessmentRun } from "../assessment/assessment-session.service";
import { assessmentBlockAt } from "../assessment/assessment-manifest";
import { UserReasoningResponse } from "../reasoning-core/models/response.models";
import { GenerationRequest, InferenceClassification, ReasoningItem } from "../reasoning-core/models/semantic.models";
import { scoreReasoningResponse } from "../reasoning-core/feedback/response-scorer";
import { renderPremiseRu } from "../reasoning-core/rendering/russian-renderer";
import {
    AssessmentPhase,
    EXPERIMENTAL_STORE_SCHEMA_VERSION,
    ExperimentalSettingsRecord,
    ExperimentalTrialRecord,
} from "../persistence/experimental-records";
import { ExperimentalRepository } from "../persistence/experimental-repository";
import { ActiveTimerService } from "../training/active-timer";
import { GENERATION_FACADE, GenerationFacade } from "./generation-facade";
import { ResponseControlsComponent } from "./response-controls.component";
import { learnerInstructionsRu, renderLearnerQueryRu } from "./learner-prompt";

type AssessmentState = "intro" | "generating" | "answering" | "error" | "complete";

@Component({
    selector: "app-experimental-assessment",
    templateUrl: "./assessment.component.html",
    styleUrls: ["./assessment.component.css"],
})
export class ExperimentalAssessmentComponent implements OnInit, OnDestroy {
    @ViewChild(ResponseControlsComponent) controls?: ResponseControlsComponent;
    state: AssessmentState = "intro";
    phase: AssessmentPhase = "baseline";
    settings?: ExperimentalSettingsRecord;
    run?: AssessmentRun;
    item?: ReasoningItem;
    response: UserReasoningResponse | null = null;
    itemIndex = 0;
    completed = 0;
    correct = 0;
    activeDurationMs = 0;
    errorMessage = "";

    private currentRequestId?: string;
    private candidateAttempt = 0;
    private readonly completedItemIds: string[] = [];
    private generationEpoch = 0;

    constructor(
        readonly assessment: AssessmentSessionService,
        private readonly repository: ExperimentalRepository,
        private readonly timer: ActiveTimerService,
        @Inject(GENERATION_FACADE) private readonly generator: GenerationFacade,
    ) {}

    async ngOnInit(): Promise<void> { this.settings = await this.repository.getSettings(); }

    ngOnDestroy(): void {
        this.generationEpoch++;
        if (this.currentRequestId) this.generator.cancel(this.currentRequestId);
        this.currentRequestId = undefined;
        this.timer.pause("itemNotReady");
    }

    phaseLabel(phase: AssessmentPhase): string {
        return phase === "baseline" ? "Исходная оценка" : phase === "postTraining" ? "Оценка после обучения" : "Отсроченная оценка";
    }

    premiseText(index: number): string { return this.item ? renderPremiseRu(this.item.premises[index], this.item.entities) : ""; }
    queryText(): string { return this.item ? renderLearnerQueryRu(this.item) : ""; }
    instructionsRu(): string[] { return this.item ? learnerInstructionsRu(this.item) : []; }
    blockTitle(): string { return this.run ? assessmentBlockAt(this.run.manifest, this.itemIndex)?.titleRu ?? "" : ""; }
    totalItems(): number { return this.run ? this.assessment.totalItems(this.run) : 0; }
    setResponse(response: UserReasoningResponse | null): void { this.response = response; }

    async begin(): Promise<void> {
        if (!this.settings) return;
        this.run = await this.assessment.begin(this.phase, this.settings);
        this.itemIndex = 0;
        this.completed = 0;
        this.correct = 0;
        this.activeDurationMs = 0;
        this.completedItemIds.length = 0;
        await this.loadItem();
    }

    async submit(): Promise<void> {
        if (!this.item || !this.response || !this.run || this.state !== "answering") return;
        this.timer.pause("feedback");
        const snapshot = this.timer.snapshot();
        const score = scoreReasoningResponse(this.item, this.response);
        const answeredAt = Date.now();
        const trial: ExperimentalTrialRecord = {
            id: `${this.run.session.id}:${this.item.id}`,
            schemaVersion: EXPERIMENTAL_STORE_SCHEMA_VERSION,
            sessionId: this.run.session.id,
            partition: "assessment",
            assessmentPhase: this.run.phase,
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
            correct: score.correct,
            activeDurationMs: snapshot.activeDurationMs,
            scaffoldsUsed: [],
            pauses: snapshot.pauses,
            answeredAt,
            certificateTrust: "locallyVerified",
        };
        await this.repository.saveTrial(trial);
        this.activeDurationMs += snapshot.activeDurationMs;
        this.completed++;
        if (score.correct) this.correct++;
        this.completedItemIds.push(this.item.id);
        this.itemIndex++;
        if (this.itemIndex >= this.totalItems()) {
            await this.assessment.finish(this.run, this.activeDurationMs, this.completedItemIds);
            this.state = "complete";
            return;
        }
        await this.loadItem();
    }

    async retry(): Promise<void> { await this.loadItem(); }

    @HostListener("document:keydown", ["$event"])
    handleKeyboard(event: KeyboardEvent): void {
        const target = event.target as HTMLElement | null;
        if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
        if (this.state !== "answering" || !this.item) return;
        if (["threeWayInference", "updateAfterPremiseChange"].includes(this.item.responseSpec.kind)) {
            const classification = ({ "1": "entailed", "2": "refuted", "3": "underdetermined" } as Record<string, InferenceClassification>)[event.key];
            if (classification) { event.preventDefault(); this.controls?.chooseClassification(classification); return; }
        }
        if (event.key === "Enter" && this.response) { event.preventDefault(); void this.submit(); }
    }

    private async loadItem(): Promise<void> {
        if (!this.run) return;
        const generationEpoch = ++this.generationEpoch;
        const baseRequest = this.assessment.requestFor(this.run, this.itemIndex);
        if (!baseRequest) {
            await this.assessment.finish(this.run, this.activeDurationMs, this.completedItemIds);
            this.state = "complete";
            return;
        }
        this.state = "generating";
        this.response = null;
        this.timer.beginGeneration();
        for (this.candidateAttempt = 0; this.candidateAttempt < 16; this.candidateAttempt++) {
            const request: GenerationRequest = {
                ...baseRequest,
                requestId: `${baseRequest.requestId}:candidate:${this.candidateAttempt}`,
                seed: `${baseRequest.seed}::candidate:${this.candidateAttempt}`,
            };
            this.currentRequestId = request.requestId;
            const result = await this.generator.generate(request);
            if (generationEpoch !== this.generationEpoch || this.currentRequestId !== request.requestId) return;
            if (!result.ok) {
                if (result.code === "cancelled") return;
                this.errorMessage = result.messageRu;
                continue;
            }
            const check = await this.assessment.checkCandidate(this.run, this.itemIndex, result.item);
            if (generationEpoch !== this.generationEpoch) return;
            if (!check.accepted) {
                this.errorMessage = check.reasonRu ?? "Задание не прошло защитную проверку.";
                continue;
            }
            this.item = result.item;
            await this.assessment.recordExposure(result.item);
            if (generationEpoch !== this.generationEpoch) return;
            this.currentRequestId = undefined;
            this.state = "answering";
            this.timer.itemVisible();
            setTimeout(() => document.querySelector<HTMLElement>(".response-controls button, .response-controls input, .response-controls select")?.focus(), 0);
            return;
        }
        this.currentRequestId = undefined;
        this.state = "error";
        if (!this.errorMessage) this.errorMessage = "Не удалось получить новую защищённую структуру в пределах шестнадцати попыток.";
    }
}
