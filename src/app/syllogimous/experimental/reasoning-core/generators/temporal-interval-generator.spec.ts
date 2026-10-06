import {
    AtomicQuery,
    DomainSpec,
    GenerationRequest,
    IntervalPremise,
} from "../models/semantic.models";
import { DEFAULT_SEMANTICS_VERSION } from "../models/versions";
import { classifyBoundedIntervals } from "../solvers/bounded-interval-solver";
import { GenerationControl } from "./generator-utils";
import { generateTemporalIntervalItem } from "./temporal-interval-generator";

const STATIC_CONTROL: GenerationControl = { now: () => 200, isCancelled: () => false };

function request(
    seed: string,
    level: 1 | 2 | 3 | 4 | 5 = 3,
    partition: GenerationRequest["partition"] = "training",
): GenerationRequest {
    return {
        requestId: `interval-${seed}`,
        seed,
        family: "temporalIntervals",
        partition,
        semanticsVersion: DEFAULT_SEMANTICS_VERSION,
        maxAttempts: 20,
        wallTimeBudgetMs: 1_000,
        target: {
            level,
            primaryDimension: "supportSize",
            displayedPremises: { min: 3, max: 6 },
            responseFormat: "threeWayInference",
            memoryVisibility: "visible",
            distractorCount: 0,
            timePressure: "none",
        },
    };
}

function reproduciblePart(result: ReturnType<typeof generateTemporalIntervalItem>) {
    if (!result.ok) return result;
    return { ...result.item, provenance: { ...result.item.provenance, generatedAt: 0 } };
}

describe("temporal interval item generator", () => {
    it("reproduces semantic and presentation streams for a fixed seed", () => {
        const first = generateTemporalIntervalItem(request("repeatable-interval"), STATIC_CONTROL);
        const second = generateTemporalIntervalItem(request("repeatable-interval"), STATIC_CONTROL);

        expect(first.ok).toBeTrue();
        expect(second.ok).toBeTrue();
        expect(reproduciblePart(first)).toEqual(reproduciblePart(second));
    });

    it("covers entailed, refuted, and ambiguous intervals with independently enumerated witnesses", () => {
        const labels = new Set<string>();
        for (let index = 0; index < 72; index++) {
            const generated = generateTemporalIntervalItem(request(`interval-class-${index}`, 4, "development"), STATIC_CONTROL);
            expect(generated.ok).withContext(`seed ${index}`).toBeTrue();
            if (!generated.ok) continue;
            const item = generated.item;
            labels.add(item.semanticCertificate.classification!);
            const solved = classifyBoundedIntervals(
                item.entities.map(entity => entity.id),
                item.premises as IntervalPremise[],
                item.query as Extract<AtomicQuery, { kind: "interval" }>,
                item.domain as Extract<DomainSpec, { kind: "boundedIntervals" }>,
            );
            expect(solved.ok).toBeTrue();
            if (solved.ok) {
                expect(solved.classification).toBe(item.semanticCertificate.classification!);
                expect(item.measuredComplexity.admissibleModelCount).toBe(solved.modelCount);
                if (solved.classification === "underdetermined") {
                    expect(item.semanticCertificate.queryWitness).toBeDefined();
                    expect(item.semanticCertificate.negatedQueryWitness).toBeDefined();
                }
            }
        }
        expect([...labels].sort()).toEqual(["entailed", "refuted", "underdetermined"]);
    });

    it("uses partition-specific interval grammars and Russian labels", () => {
        const training = generateTemporalIntervalItem(request("interval-training", 1, "training"), STATIC_CONTROL);
        const development = generateTemporalIntervalItem(request("interval-development", 3, "development"), STATIC_CONTROL);
        const assessment = generateTemporalIntervalItem(request("interval-assessment", 5, "assessment"), STATIC_CONTROL);
        expect(training.ok).toBeTrue();
        expect(development.ok).toBeTrue();
        expect(assessment.ok).toBeTrue();
        if (!training.ok || !development.ok || !assessment.ok) return;

        expect(training.item.structureFamily).toContain("training-interval-");
        expect(development.item.structureFamily).toContain("development-interval-");
        expect(assessment.item.structureFamily).toContain("assessment-interval-");
        expect(new Set([training.item.structureFamily, development.item.structureFamily, assessment.item.structureFamily]).size).toBe(3);
        expect([training.item, development.item, assessment.item]
            .flatMap(item => item.entities)
            .every(entity => /[А-Яа-яЁё]/.test(entity.label))).toBeTrue();
    });

    it("stops before generation when its cancellation signal is set", () => {
        const result = generateTemporalIntervalItem(request("cancel-interval"), { now: () => 10, isCancelled: () => true });
        expect(result.ok).toBeFalse();
        if (!result.ok) expect(result.code).toBe("cancelled");
    });
});
