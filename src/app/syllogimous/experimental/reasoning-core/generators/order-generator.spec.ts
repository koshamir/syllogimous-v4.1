import {
    AtomicQuery,
    DomainSpec,
    GenerationRequest,
    OrderPremise,
} from "../models/semantic.models";
import { DEFAULT_SEMANTICS_VERSION } from "../models/versions";
import { classifyBoundedOrder } from "../solvers/bounded-order-solver";
import { GenerationControl } from "./generator-utils";
import { generateOrderItem } from "./order-generator";

const STATIC_CONTROL: GenerationControl = { now: () => 100, isCancelled: () => false };

function request(
    seed: string,
    level: 1 | 2 | 3 | 4 | 5 = 3,
    partition: GenerationRequest["partition"] = "training",
): GenerationRequest {
    return {
        requestId: `order-${seed}`,
        seed,
        family: "order",
        partition,
        semanticsVersion: DEFAULT_SEMANTICS_VERSION,
        maxAttempts: 20,
        wallTimeBudgetMs: 1_000,
        target: {
            level,
            primaryDimension: level >= 3 ? "liveFrontier" : "supportSize",
            displayedPremises: { min: 3, max: 6 },
            responseFormat: "threeWayInference",
            memoryVisibility: "visible",
            distractorCount: 0,
            timePressure: "none",
        },
    };
}

function reproduciblePart(result: ReturnType<typeof generateOrderItem>) {
    if (!result.ok) return result;
    return {
        ...result.item,
        provenance: { ...result.item.provenance, generatedAt: 0 },
    };
}

describe("order item generator", () => {
    it("reproduces a seeded item independently of wall-clock metadata", () => {
        const first = generateOrderItem(request("repeatable-order"), STATIC_CONTROL);
        const second = generateOrderItem(request("repeatable-order"), STATIC_CONTROL);

        expect(first.ok).toBeTrue();
        expect(second.ok).toBeTrue();
        expect(reproduciblePart(first)).toEqual(reproduciblePart(second));
    });

    it("produces every answer class and reclassifies each item with the bounded oracle", () => {
        const labels = new Set<string>();
        for (let index = 0; index < 90; index++) {
            const generated = generateOrderItem(request(`order-class-${index}`, 4), STATIC_CONTROL);
            expect(generated.ok).withContext(`seed ${index}`).toBeTrue();
            if (!generated.ok) continue;
            const item = generated.item;
            labels.add(item.semanticCertificate.classification!);
            const solved = classifyBoundedOrder(
                item.entities.map(entity => entity.id),
                item.premises as OrderPremise[],
                item.query as Extract<AtomicQuery, { kind: "order" }>,
                item.domain as Extract<DomainSpec, { kind: "boundedPositions" }>,
            );
            expect(solved.ok).toBeTrue();
            if (solved.ok) {
                expect(solved.classification).toBe(item.semanticCertificate.classification!);
                expect(item.measuredComplexity.admissibleModelCount).toBe(solved.modelCount);
            }
        }
        expect([...labels].sort()).toEqual(["entailed", "refuted", "underdetermined"]);
    });

    it("separates grammar partitions, advances structure, and keeps display labels Russian", () => {
        const early = generateOrderItem(request("order-early", 1, "training"), STATIC_CONTROL);
        const reserved = generateOrderItem(request("order-reserved", 5, "assessment"), STATIC_CONTROL);
        expect(early.ok).toBeTrue();
        expect(reserved.ok).toBeTrue();
        if (!early.ok || !reserved.ok) return;

        expect(early.item.structureFamily).toContain("training-order-");
        expect(reserved.item.structureFamily).toContain("assessment-order-");
        expect(reserved.item.structureFamily).not.toBe(early.item.structureFamily);
        expect(reserved.item.targetComplexity.level).toBeGreaterThan(early.item.targetComplexity.level);
        expect([...early.item.entities, ...reserved.item.entities].every(entity => /[А-Яа-яЁё]/.test(entity.label))).toBeTrue();
    });

    it("turns cancellation into a recoverable typed result", () => {
        const result = generateOrderItem(request("cancel-order"), { now: () => 10, isCancelled: () => true });
        expect(result.ok).toBeFalse();
        if (!result.ok) {
            expect(result.code).toBe("cancelled");
            expect(result.recoverable).toBeTrue();
        }
    });
});
