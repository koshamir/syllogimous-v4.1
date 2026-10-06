import { Injectable } from "@angular/core";
import {
    ComplexityTarget,
    ReasoningFamily,
    ResponseFormat,
} from "../reasoning-core/models/semantic.models";
import {
    EXPERIMENTAL_STORE_SCHEMA_VERSION,
    ExperimentalSettingsRecord,
    MasteryRecord,
} from "../persistence/experimental-records";
import { ExperimentalRepository } from "../persistence/experimental-repository";
import { DEFAULT_SEMANTICS_VERSION } from "../reasoning-core/models/versions";

export interface SchedulerCandidate {
    family: ReasoningFamily;
    structureFamily: string;
    level: 1 | 2 | 3 | 4 | 5;
    primaryDimension: ComplexityTarget["primaryDimension"];
    responseFormat: ResponseFormat;
    displayedPremises: { min: number; max: number };
}

export interface RecentTrainingOutcome {
    correct: boolean;
    activeDurationMs: number;
    family: ReasoningFamily;
    structureFamily: string;
}

export interface ScheduledTarget {
    candidate: SchedulerCandidate;
    target: ComplexityTarget;
    expectedAccuracy: number;
    uncertainty: number;
    explanationRu: string;
    offeredSupportRu?: string;
}

export const DEFAULT_CURRICULUM: readonly SchedulerCandidate[] = [
    { family: "categorical", structureFamily: "training-categorical-chain", level: 1, primaryDimension: "supportSize", responseFormat: "threeWayInference", displayedPremises: { min: 2, max: 4 } },
    { family: "order", structureFamily: "training-order-partial", level: 1, primaryDimension: "branching", responseFormat: "threeWayInference", displayedPremises: { min: 2, max: 5 } },
    { family: "hierarchy", structureFamily: "training-hierarchy-membership", level: 1, primaryDimension: "supportSize", responseFormat: "threeWayInference", displayedPremises: { min: 3, max: 5 } },
    { family: "analogy", structureFamily: "training-analogy-check", level: 1, primaryDimension: "bindingInterference", responseFormat: "threeWayInference", displayedPremises: { min: 3, max: 6 } },
    { family: "coupledFrames", structureFamily: "training-coupled-check", level: 1, primaryDimension: "crossFrameBridges", responseFormat: "threeWayInference", displayedPremises: { min: 3, max: 6 } },
    { family: "proportional", structureFamily: "training-proportional-exact", level: 1, primaryDimension: "supportSize", responseFormat: "threeWayInference", displayedPremises: { min: 1, max: 5 } },
    { family: "temporalIntervals", structureFamily: "training-interval-bounded", level: 1, primaryDimension: "liveFrontier", responseFormat: "threeWayInference", displayedPremises: { min: 2, max: 5 } },
    { family: "contextScope", structureFamily: "training-scope-bounded", level: 1, primaryDimension: "scopeDepth", responseFormat: "threeWayInference", displayedPremises: { min: 1, max: 5 } },
    { family: "graphStructure", structureFamily: "training-graph-check", level: 1, primaryDimension: "bindingInterference", responseFormat: "threeWayInference", displayedPremises: { min: 3, max: 8 } },
    { family: "transformations", structureFamily: "training-transform-order", level: 1, primaryDimension: "transformComposition", responseFormat: "threeWayInference", displayedPremises: { min: 2, max: 5 } },
    { family: "categorical", structureFamily: "training-categorical-model", level: 2, primaryDimension: "supportSize", responseFormat: "constructSatisfyingModel", displayedPremises: { min: 2, max: 5 } },
    { family: "order", structureFamily: "training-order-countermodel", level: 2, primaryDimension: "liveFrontier", responseFormat: "constructCounterexample", displayedPremises: { min: 2, max: 5 } },
    { family: "analogy", structureFamily: "training-analogy-role-map", level: 2, primaryDimension: "bindingInterference", responseFormat: "completeMapping", displayedPremises: { min: 3, max: 6 } },
    { family: "analogy", structureFamily: "training-analogy-missing", level: 2, primaryDimension: "bindingInterference", responseFormat: "identifyMissingRelation", displayedPremises: { min: 3, max: 6 } },
    { family: "coupledFrames", structureFamily: "training-coupled-repair", level: 2, primaryDimension: "crossFrameBridges", responseFormat: "repairProof", displayedPremises: { min: 3, max: 6 } },
    { family: "coupledFrames", structureFamily: "training-coupled-necessary", level: 2, primaryDimension: "crossFrameBridges", responseFormat: "identifyNecessaryPremise", displayedPremises: { min: 3, max: 6 } },
    { family: "coupledFrames", structureFamily: "training-coupled-update", level: 2, primaryDimension: "crossFrameBridges", responseFormat: "updateAfterPremiseChange", displayedPremises: { min: 3, max: 6 } },
    { family: "categorical", structureFamily: "training-categorical-branching", level: 3, primaryDimension: "branching", responseFormat: "threeWayInference", displayedPremises: { min: 3, max: 6 } },
    { family: "order", structureFamily: "training-order-ternary", level: 3, primaryDimension: "bindingInterference", responseFormat: "threeWayInference", displayedPremises: { min: 2, max: 6 } },
    { family: "hierarchy", structureFamily: "training-hierarchy-conditional", level: 2, primaryDimension: "supportSize", responseFormat: "threeWayInference", displayedPremises: { min: 3, max: 5 } },
    { family: "analogy", structureFamily: "training-analogy-reconvergent", level: 3, primaryDimension: "bindingInterference", responseFormat: "completeMapping", displayedPremises: { min: 4, max: 6 } },
    { family: "coupledFrames", structureFamily: "training-coupled-temporal-spatial", level: 2, primaryDimension: "crossFrameBridges", responseFormat: "threeWayInference", displayedPremises: { min: 3, max: 6 } },
    { family: "coupledFrames", structureFamily: "training-coupled-mapping-quantity", level: 3, primaryDimension: "crossFrameBridges", responseFormat: "threeWayInference", displayedPremises: { min: 3, max: 6 } },
    { family: "proportional", structureFamily: "training-proportional-transformation", level: 3, primaryDimension: "supportSize", responseFormat: "threeWayInference", displayedPremises: { min: 1, max: 5 } },
    { family: "temporalIntervals", structureFamily: "training-interval-shared-boundaries", level: 2, primaryDimension: "liveFrontier", responseFormat: "threeWayInference", displayedPremises: { min: 2, max: 5 } },
    { family: "contextScope", structureFamily: "training-scope-context-role-change", level: 3, primaryDimension: "bindingInterference", responseFormat: "threeWayInference", displayedPremises: { min: 1, max: 6 } },
    { family: "graphStructure", structureFamily: "training-graph-degree-matched", level: 3, primaryDimension: "bindingInterference", responseFormat: "threeWayInference", displayedPremises: { min: 4, max: 8 } },
    { family: "transformations", structureFamily: "training-transform-reflection-order", level: 2, primaryDimension: "transformComposition", responseFormat: "threeWayInference", displayedPremises: { min: 2, max: 5 } },
];

const PRIOR_ALPHA = 3;
const PRIOR_BETA = 1;
const FAST_ERROR_MS = 2_500;

export function masteryId(candidate: Pick<SchedulerCandidate, "family" | "structureFamily" | "primaryDimension">, semanticsVersion = DEFAULT_SEMANTICS_VERSION): string {
    return `${semanticsVersion}::${candidate.family}::${candidate.structureFamily}::${candidate.primaryDimension}`;
}

export function initialMastery(candidate: SchedulerCandidate, semanticsVersion = DEFAULT_SEMANTICS_VERSION): MasteryRecord {
    return {
        id: masteryId(candidate, semanticsVersion),
        semanticsVersion,
        schemaVersion: EXPERIMENTAL_STORE_SCHEMA_VERSION,
        family: candidate.family,
        structureFamily: candidate.structureFamily,
        primaryDimension: candidate.primaryDimension,
        alpha: PRIOR_ALPHA,
        beta: PRIOR_BETA,
        observations: 0,
        comprehensionPassed: candidate.level === 1,
        lastPractisedAt: 0,
        reviewDueAt: 0,
        sourceTrust: "local",
    };
}

export function masteryMean(record: MasteryRecord): number {
    return record.alpha / (record.alpha + record.beta);
}

export function masteryUncertainty(record: MasteryRecord): number {
    const total = record.alpha + record.beta;
    return Math.sqrt((record.alpha * record.beta) / (total * total * (total + 1)));
}

export function updateMastery(
    previous: MasteryRecord,
    correct: boolean,
    now: number,
    comprehensionPassed = false,
): MasteryRecord {
    const observations = previous.observations + 1;
    const reviewDelay = correct ? Math.min(14, 1 + Math.floor(observations / 3)) * 86_400_000 : 10 * 60_000;
    return {
        ...previous,
        alpha: previous.alpha + (correct ? 1 : 0),
        beta: previous.beta + (correct ? 0 : 1),
        observations,
        comprehensionPassed: previous.comprehensionPassed || comprehensionPassed,
        lastPractisedAt: now,
        reviewDueAt: now + reviewDelay,
    };
}

function predictedAccuracy(record: MasteryRecord, level: number): number {
    return Math.max(0.05, Math.min(0.98, masteryMean(record) - Math.max(0, level - 1) * 0.055));
}

function hasRepeatedFastErrors(history: readonly RecentTrainingOutcome[]): boolean {
    const recent = history.slice(-3);
    return recent.length === 3 && recent.every(result => !result.correct && result.activeDurationMs < FAST_ERROR_MS);
}

export function selectScheduledTarget(
    candidates: readonly SchedulerCandidate[],
    mastery: readonly MasteryRecord[],
    history: readonly RecentTrainingOutcome[],
    settings: ExperimentalSettingsRecord,
    now: number,
): ScheduledTarget {
    if (candidates.length === 0) throw new Error("Не задано ни одного направления тренировки.");
    const versionedMastery = mastery.filter(record => record.semanticsVersion === settings.semanticsVersion && record.sourceTrust === "local");
    const byId = new Map(versionedMastery.map(record => [record.id, record]));
    const fastErrors = hasRepeatedFastErrors(history);
    const midpoint = (settings.targetAccuracyMin + settings.targetAccuracyMax) / 2;
    const lastFamilies = history.slice(-3).map(result => result.family);

    const ranked = candidates
        .filter(candidate => candidate.level === 1 || versionedMastery.some(record =>
            record.family === candidate.family && record.observations > 0 && record.comprehensionPassed))
        .map(candidate => {
            const record = byId.get(masteryId(candidate, settings.semanticsVersion)) ?? initialMastery(candidate, settings.semanticsVersion);
            const expected = predictedAccuracy(record, fastErrors ? Math.max(1, candidate.level - 1) : candidate.level);
            const bandDistance = expected < settings.targetAccuracyMin
                ? settings.targetAccuracyMin - expected
                : expected > settings.targetAccuracyMax ? expected - settings.targetAccuracyMax : 0;
            const dueBonus = record.reviewDueAt <= now ? 0.32 : 0;
            const diversityBonus = lastFamilies.includes(candidate.family) ? 0 : 0.22;
            const weakSkillBonus = (1 - masteryMean(record)) * 0.24;
            const uncertaintyBonus = masteryUncertainty(record) * 0.12;
            return { candidate, record, expected, score: dueBonus + diversityBonus + weakSkillBonus + uncertaintyBonus - bandDistance };
        })
        .sort((left, right) => right.score - left.score || left.candidate.structureFamily.localeCompare(right.candidate.structureFamily));

    const easiest = [...candidates].sort((left, right) => left.level - right.level || left.structureFamily.localeCompare(right.structureFamily))[0];
    const selected = ranked[0] ?? { candidate: easiest, record: initialMastery(easiest, settings.semanticsVersion), expected: 0.75, score: 0 };
    const level = (fastErrors ? Math.max(1, selected.candidate.level - 1) : selected.candidate.level) as 1 | 2 | 3 | 4 | 5;
    return {
        candidate: { ...selected.candidate, level },
        expectedAccuracy: selected.expected,
        uncertainty: masteryUncertainty(selected.record),
        explanationRu: "Выбор учитывает давность повторения, текущую точность, неопределённость оценки и чередование структур.",
        offeredSupportRu: fastErrors
            ? "Замечены три быстрые ошибки подряд: предложено более простое задание и доступен разбор."
            : undefined,
        target: {
            level,
            primaryDimension: selected.candidate.primaryDimension,
            displayedPremises: selected.candidate.displayedPremises,
            responseFormat: selected.candidate.responseFormat,
            memoryVisibility: settings.memoryVisibility,
            distractorCount: settings.distractorCount,
            timePressure: settings.timePressure,
        },
    };
}

@Injectable()
export class TransparentSchedulerService {
    constructor(private readonly repository: ExperimentalRepository) {}

    async select(history: readonly RecentTrainingOutcome[], now = Date.now(), supportedFamilies?: readonly ReasoningFamily[]): Promise<ScheduledTarget> {
        const [storedMastery, settings] = await Promise.all([this.repository.listMastery(), this.repository.getSettings()]);
        const mastery = storedMastery.filter(record => record.sourceTrust === "local");
        const candidates = supportedFamilies?.length
            ? DEFAULT_CURRICULUM.filter(candidate => supportedFamilies.includes(candidate.family))
            : DEFAULT_CURRICULUM;
        return selectScheduledTarget(candidates, mastery, history, settings, now);
    }

    /** Assessment outcomes are intentionally not accepted by this API. */
    async recordTrainingOutcome(candidate: SchedulerCandidate, correct: boolean, now = Date.now(), comprehensionPassed = false): Promise<MasteryRecord> {
        const [records, settings] = await Promise.all([this.repository.listMastery(), this.repository.getSettings()]);
        const previous = records.find(record => record.id === masteryId(candidate, settings.semanticsVersion) && record.sourceTrust === "local") ?? initialMastery(candidate, settings.semanticsVersion);
        const updated = updateMastery(previous, correct, now, comprehensionPassed);
        await this.repository.saveMastery(updated);
        return updated;
    }
}
