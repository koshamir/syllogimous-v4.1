import {
    AtomicQuery,
    DomainSpec,
    GenerationRequest,
    TransformationPremise,
} from "../models/semantic.models";
import { DEFAULT_SEMANTICS_VERSION } from "../models/versions";
import { evaluateTransformationChain } from "../semantics/transformations";
import { classifyTransformation } from "../solvers/transformation-solver";
import { GenerationControl } from "./generator-utils";
import { generateTransformationItem } from "./transformation-generator";

const STATIC_CONTROL: GenerationControl = { now: () => 400, isCancelled: () => false };

function request(
    seed: string,
    level: 1 | 2 | 3 | 4 | 5 = 3,
    partition: GenerationRequest["partition"] = "training",
): GenerationRequest {
    const minimum = level === 1 ? 1 : level === 2 || level === 3 ? 2 : level === 4 ? 3 : 4;
    return {
        requestId: `transformation-${seed}`,
        seed,
        family: "transformations",
        partition,
        semanticsVersion: DEFAULT_SEMANTICS_VERSION,
        maxAttempts: 10,
        wallTimeBudgetMs: 1_000,
        target: {
            level,
            primaryDimension: "transformComposition",
            displayedPremises: { min: minimum, max: 6 },
            responseFormat: "threeWayInference",
            memoryVisibility: "visible",
            distractorCount: 0,
            timePressure: "none",
        },
    };
}

function reproduciblePart(result: ReturnType<typeof generateTransformationItem>) {
    if (!result.ok) return result;
    return { ...result.item, provenance: { ...result.item.provenance, generatedAt: 0 } };
}

describe("transformation item generator", () => {
    it("reproduces the semantic and presentation streams from one seed", () => {
        const first = generateTransformationItem(request("repeatable-transform", 4, "development"), STATIC_CONTROL);
        const second = generateTransformationItem(request("repeatable-transform", 4, "development"), STATIC_CONTROL);

        expect(first.ok).toBeTrue();
        expect(second.ok).toBeTrue();
        expect(reproduciblePart(first)).toEqual(reproduciblePart(second));
    });

    it("produces true and false exact outcomes and validates the displayed chain", () => {
        const labels = new Set<string>();
        for (let index = 0; index < 60; index++) {
            const generated = generateTransformationItem(request(`transform-class-${index}`, 4, "development"), STATIC_CONTROL);
            expect(generated.ok).withContext(`seed ${index}`).toBeTrue();
            if (!generated.ok) continue;
            const item = generated.item;
            labels.add(item.semanticCertificate.classification!);
            const query = item.query as Extract<AtomicQuery, { kind: "transformationResult" }>;
            const domain = item.domain as Extract<DomainSpec, { kind: "boundedTransformations" }>;
            const solved = classifyTransformation(query, domain);
            const chain = evaluateTransformationChain(item.premises as TransformationPremise[], "s0", query.initialPoint, domain);
            expect(solved.ok).toBeTrue();
            expect(chain.ok).toBeTrue();
            if (solved.ok && chain.ok) {
                expect(solved.classification).toBe(item.semanticCertificate.classification!);
                expect(chain.world.finalPoint).toEqual(solved.queryWorld.finalPoint);
            }
        }
        expect([...labels].sort()).toEqual(["entailed", "refuted"]);
    });

    it("increases composition length and includes an order-sensitive rotation/reflection stage", () => {
        const early = generateTransformationItem(request("transform-early", 1, "training"), STATIC_CONTROL);
        const orderSensitive = generateTransformationItem(request("transform-sensitive", 3, "development"), STATIC_CONTROL);
        const advanced = generateTransformationItem(request("transform-advanced", 5, "assessment"), STATIC_CONTROL);
        expect(early.ok).toBeTrue();
        expect(orderSensitive.ok).toBeTrue();
        expect(advanced.ok).toBeTrue();
        if (!early.ok || !orderSensitive.ok || !advanced.ok) return;

        expect(early.item.measuredComplexity.transformationComposition).toBe(1);
        expect(orderSensitive.item.measuredComplexity.noncommutative).toBeTrue();
        expect(advanced.item.measuredComplexity.transformationComposition).toBe(4);
        expect(advanced.item.structureFamily).toContain("assessment-transform-");
        expect([...early.item.entities, ...advanced.item.entities].every(entity => /[А-Яа-яЁё]/.test(entity.label))).toBeTrue();
    });

    it("honours cancellation before composing a chain", () => {
        const result = generateTransformationItem(request("cancel-transform"), { now: () => 10, isCancelled: () => true });
        expect(result.ok).toBeFalse();
        if (!result.ok) expect(result.code).toBe("cancelled");
    });
});
