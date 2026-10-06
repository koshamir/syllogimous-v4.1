import {
    ComplexityCertificate,
    ComplexityTarget,
    GenerationProvenance,
    InferenceClassification,
    ReasoningFamily,
} from "../reasoning-core/models/semantic.models";
import { DEFAULT_SEMANTICS_VERSION } from "../reasoning-core/models/versions";
import { UserReasoningResponse } from "../reasoning-core/models/response.models";

export const EXPERIMENTAL_STORE_SCHEMA_VERSION = 1;
export const EXPERIMENTAL_EXPORT_SCHEMA_VERSION = 1;

export type ExperimentalPartition = "training" | "assessment";
export type AssessmentPhase = "baseline" | "postTraining" | "delayed";
export type ConfidenceRating = "low" | "medium" | "high";
export type CertificateTrust = "locallyVerified" | "externalUnverified";

export type PauseReason =
    | "manual"
    | "documentHidden"
    | "generation"
    | "feedback"
    | "tutorial"
    | "itemNotReady"
    | "reload";

export interface PauseSpan {
    reason: PauseReason;
    startedAtMonotonicMs: number;
    endedAtMonotonicMs: number;
    durationMs: number;
}

export interface ExperimentalSettingsRecord {
    id: "settings";
    schemaVersion: number;
    semanticsVersion: string;
    sessionMinutes: 10 | 20 | 30 | 35;
    targetAccuracyMin: number;
    targetAccuracyMax: number;
    memoryVisibility: "visible" | "sequential" | "memoryLoaded";
    distractorCount: number;
    timePressure: "none" | "measured" | "limited";
    /** Active seconds; visibility and manual pauses do not consume the limit. */
    timeLimitSeconds?: number;
    scaffoldsEnabled: boolean;
    assessmentSchedule: {
        baselineEnabled: boolean;
        postTrainingDelayDays: number;
        delayedDelayDays: number;
    };
    updatedAt: number;
}

export interface ExperimentalSessionRecord {
    id: string;
    schemaVersion: number;
    partition: ExperimentalPartition;
    assessmentPhase?: AssessmentPhase;
    protocolVersion: string;
    startedAt: number;
    endedAt?: number;
    activeDurationMs: number;
    completedItemIds: string[];
    timedOutItemIds?: string[];
    interruptedByReload: boolean;
    settingsSnapshot: ExperimentalSettingsRecord;
}

export interface ExperimentalTrialRecord {
    id: string;
    schemaVersion: number;
    sessionId: string;
    partition: ExperimentalPartition;
    assessmentPhase?: AssessmentPhase;
    itemId: string;
    seed: string;
    family: ReasoningFamily;
    componentFamilies: ReasoningFamily[];
    structureFamily: string;
    structuralFingerprint: string;
    generatorVersion: string;
    semanticsVersion: string;
    solverVersion: string;
    provenance: GenerationProvenance;
    targetComplexity: ComplexityTarget;
    measuredComplexity: ComplexityCertificate;
    response: UserReasoningResponse;
    /** Kept locally for feedback/scoring; omitted from ordinary exports for assessment trials. */
    expectedClassification?: InferenceClassification;
    correct?: boolean;
    activeDurationMs: number;
    confidence?: ConfidenceRating;
    scaffoldsUsed: string[];
    pauses: PauseSpan[];
    answeredAt: number;
    certificateTrust: CertificateTrust;
}

export interface MasteryRecord {
    id: string;
    schemaVersion: number;
    family: ReasoningFamily;
    structureFamily: string;
    primaryDimension: ComplexityTarget["primaryDimension"];
    /** Older unversioned experimental records remain historical, not scheduler evidence. */
    semanticsVersion?: string;
    alpha: number;
    beta: number;
    observations: number;
    comprehensionPassed: boolean;
    lastPractisedAt: number;
    reviewDueAt: number;
    sourceTrust: "local" | "externalUnverified";
}

export interface ExposureRecord {
    id: string;
    schemaVersion: number;
    structuralFingerprint: string;
    partition: ExperimentalPartition;
    family: ReasoningFamily;
    firstSeenAt: number;
    lastSeenAt: number;
    count: number;
}

export interface LegacyBackupRecord {
    id: "legacy-local-storage-backup";
    schemaVersion: number;
    createdAt: number;
    source: "legacyLocalStorage";
    /** Exact legacy strings. They are backed up, never reclassified. */
    values: Readonly<Record<string, string>>;
}

export interface ExperimentalExportBundle {
    kind: "syllogimousExperimentalExport";
    schemaVersion: number;
    exportedAt: number;
    locale: "ru";
    application: "Syllogimous V4";
    privacy: "localUserInitiatedExport";
    sessions: ExperimentalSessionRecord[];
    trials: ExperimentalTrialRecord[];
    mastery: MasteryRecord[];
    exposures: ExposureRecord[];
    settings: ExperimentalSettingsRecord;
}

export interface ImportPreview {
    bundle: ExperimentalExportBundle;
    byteLength: number;
    sessionCount: number;
    trialCount: number;
    masteryCount: number;
    exposureCount: number;
    assessmentAnswersRemoved: number;
    summaryRu: string;
}

export type ImportMode = "merge" | "replace";

export const DEFAULT_EXPERIMENTAL_SETTINGS: ExperimentalSettingsRecord = {
    id: "settings",
    schemaVersion: EXPERIMENTAL_STORE_SCHEMA_VERSION,
    semanticsVersion: DEFAULT_SEMANTICS_VERSION,
    sessionMinutes: 30,
    targetAccuracyMin: 0.70,
    targetAccuracyMax: 0.85,
    memoryVisibility: "visible",
    distractorCount: 0,
    timePressure: "none",
    timeLimitSeconds: 90,
    scaffoldsEnabled: true,
    assessmentSchedule: {
        baselineEnabled: true,
        postTrainingDelayDays: 0,
        delayedDelayDays: 28,
    },
    updatedAt: 0,
};
