import { generateCoupledFrameItem } from "./coupled-frame-generator";
import { GenerationRequest, ReasoningItem, TemporalSpatialWorld } from "../models/semantic.models";
import { DEFAULT_SEMANTICS_VERSION } from "../models/versions";
import { reclassifyReasoningItem, verifyReasoningItem } from "../certificates/item-verifier";
import { reconstructCoupledFrameProblem, solveCoupledFrame, validateCoupledWorld } from "../semantics/coupled-frames";
import { structuralFingerprint } from "../certificates/canonical";
import { generateHierarchyItem } from "./hierarchy-generator";

function request(level: 1 | 2 | 3, seed = `coupled-public-${level}`): GenerationRequest {
    return {
        requestId: seed, seed, family: "coupledFrames", partition: "training",
        semanticsVersion: DEFAULT_SEMANTICS_VERSION, maxAttempts: 4, wallTimeBudgetMs: 1000,
        target: { level, primaryDimension: "crossFrameBridges", displayedPremises: { min: 3, max: 6 },
            responseFormat: "threeWayInference", memoryVisibility: "visible", distractorCount: 0, timePressure: "none" },
    };
}

function itemFor(level: 1 | 2 | 3): ReasoningItem {
    const result = generateCoupledFrameItem(request(level));
    if (!result.ok) throw new Error(result.messageRu);
    return result.item;
}

describe("public coupled semantic contract", () => {
    it("declares hierarchy as bounded membership, never as unrestricted unary logic", () => {
        const result = generateHierarchyItem({ ...request(1, "bounded-membership-domain"), family: "hierarchy" });
        if (!result.ok) throw new Error(result.messageRu);
        expect(result.item.domain.kind).toBe("boundedMembership");
        expect(verifyReasoningItem(result.item).issues).toEqual([]);
        const mislabeled: ReasoningItem = { ...result.item, domain: {
            kind: "categoricalUnary", closure: "unrestrictedUnaryPredicates", existentialImport: "emptyClassesAllowed",
            namedClasses: result.item.entities.filter(entity => entity.sort === "class").map(entity => entity.id),
        } };
        expect(reclassifyReasoningItem(mislabeled).status).toBe("unavailable");
    });
    it("repeats all three complete solvers from exported AST and certifies each necessary bridge", () => {
        for (const level of [1, 2, 3] as const) {
            const item: ReasoningItem = JSON.parse(JSON.stringify(itemFor(level)));
            const repeated = reclassifyReasoningItem(item);
            expect(repeated.status).toBe("exact");
            expect(repeated.classification).toBe("entailed");
            expect(verifyReasoningItem(item).issues).toEqual([]);
            const solved = solveCoupledFrame(reconstructCoupledFrameProblem(item));
            expect(solved.coupling.accepted).toBeTrue();
            expect(solved.coupling.everyMinimalSupportRequiresBridge).toBeTrue();
            expect(solved.certificate.supports.length).toBe(1);
            expect(solved.certificate.supports[0].premiseIds.length).toBe(3);
            for (const premise of item.premises) {
                expect(reclassifyReasoningItem(item, item.premises.filter(candidate => candidate.id !== premise.id)).classification)
                    .withContext(`${item.coupledFrameSpec?.kind}: remove ${premise.id}`).toBe("underdetermined");
            }
        }
    });

    it("does not select a shuffled tautological interval as the bridge condition", () => {
        const result = generateCoupledFrameItem({ ...request(2), target: { ...request(2).target, displayedPremises: { min: 4, max: 6 } } });
        if (!result.ok) throw new Error(result.messageRu);
        const item = { ...result.item, premises: [...result.item.premises].sort((left, right) => right.id.localeCompare(left.id)) };
        expect(reclassifyReasoningItem(item).classification).toBe("entailed");
        expect(item.presentation.instructionsRu?.join(" ")).toContain("Исходная отметка: (0; 1)");
    });

    it("changing the public initial point changes the answer and fingerprint", () => {
        const item = itemFor(2);
        if (item.coupledFrameSpec?.kind !== "temporalSpatial") throw new Error("Unexpected spec");
        const changed: ReasoningItem = { ...item, coupledFrameSpec: { ...item.coupledFrameSpec, initialPoint: [0, 0] } };
        expect(reclassifyReasoningItem(changed).classification).toBe("refuted");
        expect(verifyReasoningItem(changed).valid).toBeFalse();
        expect(structuralFingerprint(changed.entities, changed.premises, changed.query, changed.domain, changed.coupledFrameSpec))
            .not.toBe(item.structuralFingerprint);
    });

    it("rejects malformed witnesses rather than treating them as opposing worlds", () => {
        const item = itemFor(2);
        const problem = reconstructCoupledFrameProblem(item);
        const witness = item.semanticCertificate.queryWitness;
        if (!witness || witness.kind !== "temporalSpatialWorld") throw new Error("Missing temporal witness");
        const outside: TemporalSpatialWorld = { ...witness, outputPoint: [99, 0] };
        expect(validateCoupledWorld(problem, outside).valid).toBeFalse();
        expect(validateCoupledWorld(problem, { ...witness, intervals: [] }).valid).toBeFalse();
        const wrongDomain: ReasoningItem = { ...item, domain: { kind: "composite", closure: "productOfDeclaredDomains", parts: [] } };
        expect(reclassifyReasoningItem(wrongDomain).status).toBe("unavailable");
    });
});
