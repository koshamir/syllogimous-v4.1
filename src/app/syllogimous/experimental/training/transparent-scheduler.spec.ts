import { DEFAULT_EXPERIMENTAL_SETTINGS } from "../persistence/experimental-records";
import { EMPTY_CLASS_SEMANTICS_VERSION } from "../reasoning-core/models/versions";
import {
    initialMastery,
    masteryMean,
    masteryUncertainty,
    SchedulerCandidate,
    selectScheduledTarget,
    updateMastery,
} from "./transparent-scheduler";

const candidate: SchedulerCandidate = {
    family: "categorical", structureFamily: "chain", level: 2,
    primaryDimension: "supportSize", responseFormat: "threeWayInference",
    displayedPremises: { min: 3, max: 5 },
};

describe("transparent scheduler", () => {
    it("never transfers mastery or comprehension between semantic policies", () => {
        const basic = { ...candidate, structureFamily: "basic", level: 1 as const };
        const otherPolicy = updateMastery(initialMastery(basic, EMPTY_CLASS_SEMANTICS_VERSION), true, 100, true);
        const selected = selectScheduledTarget([candidate, basic], [otherPolicy], [], DEFAULT_EXPERIMENTAL_SETTINGS, 1_000);
        expect(selected.candidate.level).toBe(1);
        expect(selected.expectedAccuracy).toBe(0.75);
    });
    it("starts with a regularized estimate and shrinks uncertainty with observations", () => {
        const initial = initialMastery(candidate);
        const updated = updateMastery(initial, true, 100);
        expect(masteryMean(initial)).toBe(0.75);
        expect(masteryMean(updated)).toBe(0.8);
        expect(masteryUncertainty(updated)).toBeLessThan(masteryUncertainty(initial));
    });

    it("offers a lower target after three fast errors without punitive demotion", () => {
        const selected = selectScheduledTarget([candidate], [], [
            { correct: false, activeDurationMs: 400, family: "categorical", structureFamily: "chain" },
            { correct: false, activeDurationMs: 600, family: "categorical", structureFamily: "chain" },
            { correct: false, activeDurationMs: 800, family: "categorical", structureFamily: "chain" },
        ], { ...DEFAULT_EXPERIMENTAL_SETTINGS, updatedAt: 1 }, 1_000);
        expect(selected.target.level).toBe(1);
        expect(selected.offeredSupportRu).toContain("быстрые ошибки");
    });

    it("does not escalate advanced structures before their comprehension check", () => {
        const basic = { ...candidate, structureFamily: "basic", level: 1 as const };
        const advanced = { ...candidate, family: "contextScope" as const, structureFamily: "scope", level: 4 as const };
        const selected = selectScheduledTarget([advanced, basic], [], [], { ...DEFAULT_EXPERIMENTAL_SETTINGS, updatedAt: 1 }, 1_000);
        expect(selected.candidate.structureFamily).toBe("basic");
    });
});
