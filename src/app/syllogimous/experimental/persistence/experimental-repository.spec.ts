import { ComplexityCertificate, ComplexityTarget, GenerationProvenance } from "../reasoning-core/models/semantic.models";
import {
    DEFAULT_EXPERIMENTAL_SETTINGS,
    ExperimentalExportBundle,
    ExperimentalSessionRecord,
    ExperimentalTrialRecord,
} from "./experimental-records";
import { ExperimentalRepository } from "./experimental-repository";

class FakeStorage implements Pick<Storage, "length" | "key" | "getItem" | "setItem"> {
    constructor(private readonly values: Record<string, string>) {}
    get length(): number { return Object.keys(this.values).length; }
    key(index: number): string | null { return Object.keys(this.values)[index] ?? null; }
    getItem(key: string): string | null { return this.values[key] ?? null; }
    setItem(key: string, value: string): void { this.values[key] = value; }
}

const target: ComplexityTarget = {
    level: 1,
    primaryDimension: "supportSize",
    displayedPremises: { min: 2, max: 4 },
    responseFormat: "threeWayInference",
    memoryVisibility: "visible",
    distractorCount: 0,
    timePressure: "none",
};

const measured: ComplexityCertificate = {
    displayedPremises: 2, atomicConstraints: 2, embeddedClauses: 0, entityCount: 3,
    maxRelationArity: 2, relationalOrder: 1, minimalSupportSize: 2, distinctMinimalSupports: 1,
    supportStatus: "exact", shortestProofDepth: 2, proofDepthStatus: "exact", branchingCount: 0,
    reconvergentJoinCount: 0, maxScopeNesting: 0, bindingInterference: 0, roleOverlap: 1,
    estimatedLiveFrontier: 2, liveFrontierStatus: "approximate", strategyLanguage: "fixture",
    admissibleModelCount: 1, modelCountStatus: "exact", modelCountDomainNote: "fixture",
    transformationComposition: 0, noncommutative: false, crossFrameBridgeCount: 0,
    everyMinimalSupportRequiresBridge: null, bridgeNecessityStatus: "unavailable",
    format: "threeWayInference", memoryVisibility: "visible", distractorCount: 0,
    timePressure: "none", novelty: "new", priorExposureCount: 0,
};

const provenance: GenerationProvenance = {
    semanticSeed: "s::semantic", presentationSeed: "s::presentation", schedulerSeed: "s::scheduler",
    attempt: 1, maxAttempts: 8, elapsedMs: 2, wallTimeBudgetMs: 200,
    requestedTarget: target, appliedTarget: target, generatedAt: 100,
};

function session(): ExperimentalSessionRecord {
    return {
        id: "session-1", schemaVersion: 1, partition: "training", protocolVersion: "training-v1",
        startedAt: 100, activeDurationMs: 0, completedItemIds: [], interruptedByReload: false,
        settingsSnapshot: { ...DEFAULT_EXPERIMENTAL_SETTINGS, updatedAt: 100 },
    };
}

function assessmentTrial(): ExperimentalTrialRecord {
    return {
        id: "trial-1", schemaVersion: 1, sessionId: "session-1", partition: "assessment",
        assessmentPhase: "baseline", itemId: "item-1", seed: "seed-1", family: "categorical",
        componentFamilies: ["categorical"], structureFamily: "assessment-branch",
        structuralFingerprint: "fingerprint-1", generatorVersion: "g1", semanticsVersion: "s1", solverVersion: "o1",
        provenance, targetComplexity: target, measuredComplexity: measured,
        response: { kind: "threeWayInference", classification: "entailed" }, expectedClassification: "refuted", correct: false,
        activeDurationMs: 500, scaffoldsUsed: [], pauses: [], answeredAt: 200, certificateTrust: "locallyVerified",
    };
}

describe("ExperimentalRepository", () => {
    it("rejects malformed nested models and duplicate IDs before replacing anything", async () => {
        const repository = new ExperimentalRepository(null, null);
        await repository.initialize();
        await repository.saveSession(session());
        const bundle = await repository.createExportBundle();
        bundle.sessions.push(session());
        expect(() => repository.previewImport(JSON.stringify(bundle))).toThrowError("В файле повторяются идентификаторы записей.");
        bundle.sessions.pop();
        const trial = assessmentTrial();
        trial.response = { kind: "constructSatisfyingModel", world: { kind: "positionWorld", positions: [{ entityId: "x", value: 1 }] } };
        const malformed = JSON.parse(JSON.stringify({ ...bundle, trials: [trial] })) as { trials: Array<{ response: { world: { positions: unknown[] } } }> };
        malformed.trials[0].response.world.positions = ["<script>not-a-constraint</script>"];
        expect(() => repository.previewImport(JSON.stringify(malformed))).toThrow();
        expect((await repository.listSessions()).length).toBe(1);
    });
    it("uses a memory fallback and creates one exact legacy backup without reinterpreting it", async () => {
        const storage = new FakeStorage({ SYL_HISTORY: "{legacy:true}", darkmode: "true", unrelated: "ignore" });
        const repository = new ExperimentalRepository(null, storage, () => 123);
        await repository.initialize();
        await repository.initialize();
        expect(repository.backend).toBe("memory");
        expect(await repository.getLegacyBackup()).toEqual({
            id: "legacy-local-storage-backup", schemaVersion: 1, createdAt: 123,
            source: "legacyLocalStorage", values: { SYL_HISTORY: "{legacy:true}", darkmode: "true" },
        });
    });

    it("round-trips records and removes assessment answer keys from export", async () => {
        const repository = new ExperimentalRepository(null, null, () => 500);
        await repository.initialize();
        await repository.saveSession(session());
        await repository.saveTrial(assessmentTrial());
        const exported = await repository.createExportBundle();
        expect(exported.sessions.length).toBe(1);
        expect(exported.trials[0].expectedClassification).toBeUndefined();
        expect(exported.trials[0].correct).toBeUndefined();

        const imported = new ExperimentalRepository(null, null, () => 600);
        const preview = imported.previewImport(JSON.stringify(exported));
        await imported.importPreview(preview, "replace");
        expect((await imported.listTrials())[0].certificateTrust).toBe("externalUnverified");
    });

    it("rejects oversized, corrupt and unsupported imports", () => {
        const repository = new ExperimentalRepository(null, null);
        expect(() => repository.previewImport("not-json")).toThrowError("Не удалось прочитать JSON-файл.");
        expect(() => repository.previewImport("x".repeat(2 * 1024 * 1024 + 1))).toThrowError("Файл превышает допустимый размер 2 МБ.");
        const unsupported = { kind: "syllogimousExperimentalExport", schemaVersion: 99 };
        expect(() => repository.previewImport(JSON.stringify(unsupported))).toThrowError("Файл не соответствует формату данных экспериментального режима.");
    });

    it("replace deletes only experimental records and preserves the legacy backup", async () => {
        const repository = new ExperimentalRepository(null, new FakeStorage({ SYL_SCORE: "42" }), () => 700);
        await repository.initialize();
        await repository.saveSession(session());
        const empty: ExperimentalExportBundle = {
            kind: "syllogimousExperimentalExport", schemaVersion: 1, exportedAt: 1, locale: "ru",
            application: "Syllogimous V4", privacy: "localUserInitiatedExport", sessions: [], trials: [], mastery: [], exposures: [],
            settings: { ...DEFAULT_EXPERIMENTAL_SETTINGS, updatedAt: 1 },
        };
        await repository.importPreview(repository.previewImport(JSON.stringify(empty)), "replace");
        expect(await repository.listSessions()).toEqual([]);
        expect((await repository.getLegacyBackup())?.values["SYL_SCORE"]).toBe("42");
    });

    it("restores exact legacy strings only after an explicit call", async () => {
        const storage = new FakeStorage({ SYL_HISTORY: "original" });
        const repository = new ExperimentalRepository(null, storage, () => 700);
        await repository.initialize();
        storage.setItem("SYL_HISTORY", "changed");
        expect(await repository.restoreLegacyBackup()).toBe(1);
        expect(storage.getItem("SYL_HISTORY")).toBe("original");
    });
});
