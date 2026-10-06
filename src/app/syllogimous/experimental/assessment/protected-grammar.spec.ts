import { generateReasoningItem } from "../reasoning-core/generators/generator-registry";
import { DEFAULT_EXPERIMENTAL_SETTINGS } from "../persistence/experimental-records";
import { ExperimentalRepository } from "../persistence/experimental-repository";
import { AssessmentSessionService } from "./assessment-session.service";

describe("original reserved assessment grammar", () => {
    it("generates solver-certified structures and a constructive format unavailable to the training grammar", async () => {
        const repository = new ExperimentalRepository(null, null, () => 100);
        await repository.initialize();
        const service = new AssessmentSessionService(repository);
        const run = await service.begin("baseline", { ...DEFAULT_EXPERIMENTAL_SETTINGS, updatedAt: 100 }, 100);
        for (const index of [0, 3]) {
            const request = service.requestFor(run, index)!;
            const generated = generateReasoningItem(request, { now: () => 0, isCancelled: () => false });
            expect(generated.ok).withContext(JSON.stringify(generated)).toBeTrue();
            if (!generated.ok) continue;
            expect((await service.checkCandidate(run, index, generated.item)).accepted).toBeTrue();
            const training = generateReasoningItem({ ...request, partition: "training", requestId: "training" }, { now: () => 0, isCancelled: () => false });
            if (training.ok) expect(training.item.structuralFingerprint).not.toBe(generated.item.structuralFingerprint);
            if (index === 3) {
                expect(generated.item.entities.length).toBe(5);
                expect(generated.item.responseSpec.kind).toBe("constructCounterexample");
            }
        }
    });
    it("has enough unrepeated structures for baseline, post-training and delayed blocks", async () => {
        const repository = new ExperimentalRepository(null, null, () => 100);
        await repository.initialize();
        const service = new AssessmentSessionService(repository);
        for (const phase of ["baseline", "postTraining", "delayed"] as const) {
            const run = await service.begin(phase, { ...DEFAULT_EXPERIMENTAL_SETTINGS, updatedAt: 100 }, 100);
            for (let index = 0; index < service.totalItems(run); index++) {
                const base = service.requestFor(run, index)!;
                let accepted = false;
                for (let candidate = 0; candidate < 16; candidate++) {
                    const generated = generateReasoningItem({ ...base, seed: `${base.seed}::candidate:${candidate}` }, { now: () => 0, isCancelled: () => false });
                    if (!generated.ok || !(await service.checkCandidate(run, index, generated.item)).accepted) continue;
                    await service.recordExposure(generated.item);
                    accepted = true;
                    break;
                }
                expect(accepted).withContext(`${phase}:${index}`).toBeTrue();
            }
        }
        expect((await repository.listExposures()).length).toBe(18);
    });
});
