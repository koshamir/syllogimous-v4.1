import { Injectable } from "@angular/core";
import { GenerationRequest, ReasoningItem } from "../reasoning-core/models/semantic.models";
import {
    AssessmentPhase,
    EXPERIMENTAL_STORE_SCHEMA_VERSION,
    ExperimentalSessionRecord,
    ExperimentalSettingsRecord,
    ExposureRecord,
} from "../persistence/experimental-records";
import { ExperimentalRepository } from "../persistence/experimental-repository";
import {
    ASSESSMENT_BATTERY_V1,
    AssessmentBatteryManifest,
    assessmentBlockAt,
    assessmentItemCount,
} from "./assessment-manifest";

export interface AssessmentRun {
    session: ExperimentalSessionRecord;
    manifest: AssessmentBatteryManifest;
    phase: AssessmentPhase;
    nextItemIndex: number;
}

export interface AssessmentCandidateCheck {
    accepted: boolean;
    reasonRu?: string;
}

@Injectable()
export class AssessmentSessionService {
    readonly manifest = ASSESSMENT_BATTERY_V1;
    /** Deliberately fixed: assessment results never feed the training scheduler. */
    readonly updatesTrainingScheduler = false;

    constructor(private readonly repository: ExperimentalRepository) {}

    async begin(phase: AssessmentPhase, settings: ExperimentalSettingsRecord, now = Date.now()): Promise<AssessmentRun> {
        if (!this.manifest.phases.includes(phase)) throw new Error("Этот этап не входит в выбранный протокол.");
        const session: ExperimentalSessionRecord = {
            id: `${this.manifest.id}:${this.manifest.version}:${phase}:${now}`,
            schemaVersion: EXPERIMENTAL_STORE_SCHEMA_VERSION,
            partition: "assessment",
            assessmentPhase: phase,
            protocolVersion: this.manifest.version,
            startedAt: now,
            activeDurationMs: 0,
            completedItemIds: [],
            interruptedByReload: false,
            settingsSnapshot: { ...settings, assessmentSchedule: { ...settings.assessmentSchedule } },
        };
        await this.repository.saveSession(session);
        return { session, manifest: this.manifest, phase, nextItemIndex: 0 };
    }

    requestFor(run: AssessmentRun, itemIndex: number): GenerationRequest | null {
        const block = assessmentBlockAt(run.manifest, itemIndex);
        if (!block) return null;
        return {
            requestId: `${run.session.id}:item:${itemIndex}`,
            seed: `${run.manifest.version}::${run.phase}::${block.originalGrammarId}::${itemIndex}`,
            family: block.family,
            partition: "assessment",
            target: block.target,
            semanticsVersion: run.session.settingsSnapshot.semanticsVersion,
            maxAttempts: 32,
            wallTimeBudgetMs: 1_200,
        };
    }

    async checkCandidate(run: AssessmentRun, itemIndex: number, item: ReasoningItem): Promise<AssessmentCandidateCheck> {
        const block = assessmentBlockAt(run.manifest, itemIndex);
        if (!block || item.grammarPartition !== "assessment" || item.family !== block.family) {
            return { accepted: false, reasonRu: "Генератор вернул задание не из защищённого раздела оценки." };
        }
        const heldOutShape = block.id === "reserved-categorical-branch"
            ? item.structureFamily === "assessment-categorical-reserved-mixed-witness-v1"
            : block.id === "reserved-order-diamond"
                ? item.structureFamily.includes("-order-reserved-double-fork-v1-")
                : false;
        if (!heldOutShape) {
            return { accepted: false, reasonRu: "Структура не относится к зарезервированной грамматике этого блока." };
        }
        const exposures = await this.repository.listExposures();
        if (exposures.some(exposure => exposure.structuralFingerprint === item.structuralFingerprint)) {
            return { accepted: false, reasonRu: "Эта структура уже предъявлялась; требуется новое задание." };
        }
        return { accepted: true };
    }

    async recordExposure(item: ReasoningItem, now = Date.now()): Promise<void> {
        const record: ExposureRecord = {
            id: `assessment::${item.structuralFingerprint}`,
            schemaVersion: EXPERIMENTAL_STORE_SCHEMA_VERSION,
            structuralFingerprint: item.structuralFingerprint,
            partition: "assessment",
            family: item.family,
            firstSeenAt: now,
            lastSeenAt: now,
            count: 1,
        };
        await this.repository.saveExposure(record);
    }

    async finish(run: AssessmentRun, activeDurationMs: number, completedItemIds: string[], now = Date.now()): Promise<ExperimentalSessionRecord> {
        const session = {
            ...run.session,
            endedAt: now,
            activeDurationMs,
            completedItemIds: [...completedItemIds],
        };
        await this.repository.saveSession(session);
        return session;
    }

    totalItems(run: AssessmentRun): number {
        return assessmentItemCount(run.manifest);
    }
}
