import { DEFAULT_EXPERIMENTAL_SETTINGS, ExposureRecord } from "../persistence/experimental-records";
import { ExperimentalRepository } from "../persistence/experimental-repository";
import { AssessmentSessionService } from "./assessment-session.service";

describe("AssessmentSessionService", () => {
    it("freezes the manifest and produces only assessment requests", async () => {
        const repository = new ExperimentalRepository(null, null, () => 100);
        await repository.initialize();
        const service = new AssessmentSessionService(repository);
        const run = await service.begin("baseline", { ...DEFAULT_EXPERIMENTAL_SETTINGS, updatedAt: 100 }, 100);
        const request = service.requestFor(run, 0);
        expect(run.session.protocolVersion).toBe(service.manifest.version);
        expect(request?.partition).toBe("assessment");
        expect(request?.seed).toContain("assessment/");
        expect(service.updatesTrainingScheduler).toBeFalse();
    });

    it("rejects a structural fingerprint previously exposed in training", async () => {
        const repository = new ExperimentalRepository(null, null, () => 100);
        await repository.initialize();
        const prior: ExposureRecord = {
            id: "training::same", schemaVersion: 1, structuralFingerprint: "same", partition: "training",
            family: "categorical", firstSeenAt: 1, lastSeenAt: 1, count: 1,
        };
        await repository.saveExposure(prior);
        const service = new AssessmentSessionService(repository);
        const run = await service.begin("baseline", { ...DEFAULT_EXPERIMENTAL_SETTINGS, updatedAt: 100 }, 100);
        const result = await service.checkCandidate(run, 0, {
            grammarPartition: "assessment", family: "categorical", structureFamily: "assessment-categorical-reserved-mixed-witness-v1", structuralFingerprint: "same",
        } as Parameters<AssessmentSessionService["checkCandidate"]>[2]);
        expect(result.accepted).toBeFalse();
        expect(result.reasonRu).toContain("уже предъявлялась");
    });
});
