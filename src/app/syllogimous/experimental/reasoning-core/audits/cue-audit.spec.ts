import { generateCategoricalItem } from "../generators/categorical-generator";
import { SeededRandom } from "../generators/seeded-random";
import { DEFAULT_SEMANTICS_VERSION } from "../models/versions";
import { AuditSample, AuditSplit, runCueAudit } from "./cue-audit";

function samplesFor(split: AuditSplit, count: number): AuditSample[] {
    const partition = split === "test" ? "assessment" : split;
    const scheduler = new SeededRandom(`audit-metadata-${split}`);
    const result: AuditSample[] = [];
    let previous: AuditSample["label"] | undefined;
    for (let index = 0; index < count; index++) {
        const generated = generateCategoricalItem({
            requestId: `audit-${split}-${index}`,
            seed: `audit-${split}-${index}`,
            family: "categorical",
            partition,
            semanticsVersion: DEFAULT_SEMANTICS_VERSION,
            maxAttempts: 16,
            wallTimeBudgetMs: 2_000,
            target: {
                level: (1 + index % 5) as 1 | 2 | 3 | 4 | 5,
                primaryDimension: index % 2 ? "supportSize" : "branching",
                displayedPremises: { min: 2, max: 7 },
                responseFormat: "threeWayInference",
                memoryVisibility: "visible",
                distractorCount: index % 2,
                timePressure: "none",
            },
        });
        expect(generated.ok).withContext(`${split}-${index}`).toBeTrue();
        if (!generated.ok || !generated.item.semanticCertificate.classification) continue;
        const sample: AuditSample = {
            item: generated.item,
            label: generated.item.semanticCertificate.classification,
            split,
            previousLabel: scheduler.bool(0.25) ? previous : undefined,
            schedulerBucket: scheduler.pick(["review", "focus", "transfer"] as const),
        };
        result.push(sample);
        previous = sample.label;
    }
    return result;
}

describe("held-out shallow-cue audit", () => {
    it("fits on training/development only, reports uncertainty, and detects its positive leak", () => {
        const samples = [
            ...samplesFor("training", 180),
            ...samplesFor("development", 120),
            ...samplesFor("test", 180),
        ];
        const report = runCueAudit(samples, 120);
        expect(report.splits.training.sampleSize).toBe(180);
        expect(report.splits.development.sampleSize).toBe(120);
        expect(report.splits.test.sampleSize).toBe(180);
        expect(report.labels.length).toBe(3);
        expect(report.threshold.balancedBaseline).toBeCloseTo(1 / 3, 8);
        expect(report.finalHeldOutPredictors.length).toBe(8);
        expect(report.finalSelectedPredictor.sampleSize).toBe(180);
        expect(report.leakyControl.detected).toBeTrue();
        expect(report.leakyControl.detectedBalancedAccuracy).toBeGreaterThanOrEqual(0.8);
        expect(report.disposition).not.toBe("insufficientSample");
    });

    it("uses the corresponding baseline and quarantines a one-label fragment", () => {
        const seedSamples = [
            ...samplesFor("training", 40),
            ...samplesFor("development", 40),
            ...samplesFor("test", 80),
        ];
        const oneLabel = seedSamples.map(sample => ({ ...sample, label: "entailed" as const }));
        const report = runCueAudit(oneLabel, 60);
        expect(report.labels).toEqual(["entailed"]);
        expect(report.threshold.balancedBaseline).toBe(1);
        expect(report.disposition).toBe("cueLimited");
        expect(report.leakyControl.detected).toBeTrue();
    });
});
