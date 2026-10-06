import {
    AtomicQuery,
    DomainSpec,
    GenerationRequest,
    RationalPremise,
} from "../models/semantic.models";
import { DEFAULT_SEMANTICS_VERSION } from "../models/versions";
import { classifyProportional } from "../solvers/proportional-solver";
import { GenerationControl } from "./generator-utils";
import { generateProportionalItem } from "./proportional-generator";

const STATIC_CONTROL: GenerationControl = { now: () => 300, isCancelled: () => false };

function request(
    seed: string,
    level: 1 | 2 | 3 | 4 | 5 = 3,
    partition: GenerationRequest["partition"] = "training",
): GenerationRequest {
    return {
        requestId: `proportional-${seed}`,
        seed,
        family: "proportional",
        partition,
        semanticsVersion: DEFAULT_SEMANTICS_VERSION,
        maxAttempts: 10,
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

function reproduciblePart(result: ReturnType<typeof generateProportionalItem>) {
    if (!result.ok) return result;
    return { ...result.item, provenance: { ...result.item.provenance, generatedAt: 0 } };
}

describe("proportional item generator", () => {
    it("reproduces every seeded exact rational", () => {
        const first = generateProportionalItem(request("repeatable-ratio", 5, "assessment"), STATIC_CONTROL);
        const second = generateProportionalItem(request("repeatable-ratio", 5, "assessment"), STATIC_CONTROL);

        expect(first.ok).toBeTrue();
        expect(second.ok).toBeTrue();
        expect(reproduciblePart(first)).toEqual(reproduciblePart(second));
    });

    it("produces both determinate labels and verifies every premise and query exactly", () => {
        const labels = new Set<string>();
        for (let index = 0; index < 60; index++) {
            const generated = generateProportionalItem(request(`ratio-class-${index}`, 5, "assessment"), STATIC_CONTROL);
            expect(generated.ok).withContext(`seed ${index}`).toBeTrue();
            if (!generated.ok) continue;
            const item = generated.item;
            labels.add(item.semanticCertificate.classification!);
            const solved = classifyProportional(
                item.premises as RationalPremise[],
                item.query as Extract<AtomicQuery, { kind: "rational" }>,
                item.domain as Extract<DomainSpec, { kind: "exactRationals" }>,
            );
            expect(solved.ok).toBeTrue();
            if (solved.ok) expect(solved.classification).toBe(item.semanticCertificate.classification!);
            for (const value of [
                (item.query as Extract<AtomicQuery, { kind: "rational" }>).left,
                (item.query as Extract<AtomicQuery, { kind: "rational" }>).right,
                (item.query as Extract<AtomicQuery, { kind: "rational" }>).result,
            ]) {
                if (value) expect(value.denominator).not.toBe(0);
            }
        }
        expect([...labels].sort()).toEqual(["entailed", "refuted"]);
    });

    it("progresses from integer comparison to scaling without inventing premise necessity", () => {
        const early = generateProportionalItem(request("ratio-early", 1, "training"), STATIC_CONTROL);
        const advanced = generateProportionalItem(request("ratio-advanced", 5, "development"), STATIC_CONTROL);
        expect(early.ok).toBeTrue();
        expect(advanced.ok).toBeTrue();
        if (!early.ok || !advanced.ok) return;

        const earlyQuery = early.item.query as Extract<AtomicQuery, { kind: "rational" }>;
        const advancedQuery = advanced.item.query as Extract<AtomicQuery, { kind: "rational" }>;
        expect(earlyQuery.left.denominator).toBe(1);
        expect(earlyQuery.right.denominator).toBe(1);
        expect(advancedQuery.relation).toBe("scaledBy");
        expect(advancedQuery.result).toBeDefined();
        expect(advanced.item.semanticCertificate.supports).toEqual([{ premiseIds: [], minimal: true, status: "exact" }]);
        expect(advanced.item.semanticCertificate.necessaryPremiseIds).toEqual([]);
        expect([...early.item.entities, ...advanced.item.entities].every(entity => /[А-Яа-яЁё]/.test(entity.label))).toBeTrue();
    });

    it("returns a recoverable cancellation instead of retrying", () => {
        const result = generateProportionalItem(request("cancel-ratio"), { now: () => 10, isCancelled: () => true });
        expect(result.ok).toBeFalse();
        if (!result.ok) expect(result.code).toBe("cancelled");
    });
});
