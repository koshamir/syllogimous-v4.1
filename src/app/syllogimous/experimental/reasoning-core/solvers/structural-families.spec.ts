import {
    AtomicQuery,
    BridgePremise,
    ComplexityTarget,
    ConditionalPremise,
    ContainmentPremise,
    DomainSpec,
    EntitySpec,
    GenerationRequest,
    GraphEdgePremise,
    IntervalPremise,
    MappingPairPremise,
    OrderPremise,
    RationalPremise,
    ScopedRelationPremise,
    TransformationPremise,
} from "../models/semantic.models";
import { DEFAULT_SEMANTICS_VERSION } from "../models/versions";
import {
    classifyHierarchyQuery,
    validateHierarchyWorld,
} from "./hierarchy-solver";
import {
    alphaRenameBinding,
    evaluateScopedRelation,
    validateBindings,
} from "../semantics/scope";
import { classifyScopeQuery } from "./scope-solver";
import {
    diagnoseSurfaceAgreement,
    scoreMissingRelationLabel,
    scoreStructuralMapping,
    StructuralMappingProblem,
} from "../semantics/structural-mapping";
import {
    checkDegreeMatchedHardNegative,
    classifyGraphIsomorphism,
} from "./graph-solver";
import { degreeSignature } from "../semantics/graph";
import { degreeMatchedNegativeEdges, generateGraphItem } from "../generators/graph-generator";
import { rational } from "../semantics/rational";
import {
    MappingQuantityProblem,
    MembershipOrderProblem,
    rejectIndependentBooleanComposition,
    solveCoupledFrame,
    TemporalSpatialProblem,
} from "../semantics/coupled-frames";
import { generateHierarchyItem } from "../generators/hierarchy-generator";
import { generateAnalogyItem } from "../generators/analogy-generator";
import { generateScopeItem } from "../generators/scope-generator";
import {
    CoupledFrameKind,
    generateCoupledFrameItem,
} from "../generators/coupled-frame-generator";
import { GenerationControl } from "../generators/generator-utils";
import { scoreReasoningResponse } from "../feedback/response-scorer";
import { renderPremiseRu } from "../rendering/russian-renderer";

function containment(
    id: string,
    relation: ContainmentPremise["relation"],
    subject: string,
    classId: string,
): ContainmentPremise {
    return { kind: "containment", id, relation, subject, classId };
}

function scoped(
    id: string,
    outer: "person" | "book",
): ScopedRelationPremise {
    const subjectBindingId = `${id}-person`;
    const objectBindingId = `${id}-book`;
    return {
        kind: "scopedRelation",
        id,
        contextId: "library",
        subjectBindingId,
        objectBindingId,
        quantifierOrder: outer === "person"
            ? [subjectBindingId, objectBindingId]
            : [objectBindingId, subjectBindingId],
        subjectQuantifier: "every",
        objectQuantifier: "some",
        subjectClass: "people",
        objectClass: "books",
        relation: "reads",
        nestingDepth: 2,
    };
}

describe("bounded hierarchy semantics", () => {
    const rule: ConditionalPremise = {
        kind: "conditional",
        id: "h3",
        bindingId: "x-h3",
        if: containment("h3-if", "memberOf", "x-h3", "middle"),
        then: containment("h3-then", "memberOf", "x-h3", "result"),
        exceptEntityIds: ["other"],
    };
    const premises = [
        containment("h1", "memberOf", "focus", "start"),
        containment("h2", "includedIn", "start", "middle"),
        rule,
    ];
    const objectIds = ["focus", "other"];
    const classIds = ["start", "middle", "result"];

    it("certifies every premise in the unique minimal support", () => {
        const query: Extract<AtomicQuery, { kind: "containment" }> = {
            kind: "containment",
            relation: "memberOf",
            subject: "focus",
            classId: "result",
        };
        const certificate = classifyHierarchyQuery(premises, query, objectIds, classIds);
        expect(certificate.classification).toBe("entailed");
        expect(certificate.supports).toEqual([{
            premiseIds: ["h1", "h2", "h3"],
            minimal: true,
            status: "exact",
        }]);
        expect(certificate.necessaryPremiseIds).toEqual(["h1", "h2", "h3"]);
    });

    it("implements exceptions as an explicit monotonic rule restriction", () => {
        const alternative = {
            kind: "membershipWorld" as const,
            memberships: [
                { objectId: "focus", classId: "start" },
                { objectId: "focus", classId: "middle" },
                { objectId: "focus", classId: "result" },
                { objectId: "other", classId: "middle" },
            ],
        };
        expect(validateHierarchyWorld(alternative, premises, objectIds, classIds).valid).toBeTrue();
        const unknown = classifyHierarchyQuery(premises, {
            kind: "containment",
            relation: "memberOf",
            subject: "other",
            classId: "result",
        }, objectIds, classIds);
        expect(unknown.classification).toBe("underdetermined");
        expect(unknown.queryWitness).toBeDefined();
        expect(unknown.negatedQueryWitness).toBeDefined();
        // Deleting a premise from an unknown monotonic problem does not manufacture entailment.
        expect(classifyHierarchyQuery(premises.slice(0, 2), {
            kind: "containment",
            relation: "memberOf",
            subject: "other",
            classId: "result",
        }, objectIds, classIds).classification).toBe("underdetermined");
    });
});

describe("scope and binding semantics", () => {
    it("distinguishes every-person/some-book from some-book/every-person", () => {
        const everyThenSome = scoped("scope-a", "person");
        const someThenEvery = scoped("scope-b", "book");
        const diagonalWorld = {
            kind: "scopeWorld" as const,
            contextId: "library",
            people: ["p1", "p2"],
            objects: ["b1", "b2"],
            relationPairs: [["p1", "b1"], ["p2", "b2"]] as Array<[string, string]>,
        };
        expect(evaluateScopedRelation(everyThenSome, diagonalWorld)).toBeTrue();
        expect(evaluateScopedRelation(someThenEvery, diagonalWorld)).toBeFalse();
        const { id: _id, ...query } = someThenEvery;
        const certificate = classifyScopeQuery([everyThenSome], query, diagonalWorld.people, diagonalWorld.objects);
        expect(certificate.classification).toBe("underdetermined");
        expect(certificate.queryWitness).toBeDefined();
        expect(certificate.negatedQueryWitness).toBeDefined();
    });

    it("rejects binding capture during validation and alpha-renaming", () => {
        const malformed = { ...scoped("bad", "person"), objectBindingId: "bad-person" };
        expect(validateBindings(malformed).length).toBeGreaterThan(0);
        expect(() => alphaRenameBinding(scoped("safe", "person"), "safe-person", "safe-book"))
            .toThrowError(/захвату/);
    });

    it("renders quantifier order explicitly in Russian", () => {
        const entities: EntitySpec[] = [
            { id: "library", label: "библиотека", sort: "context" },
            { id: "people", label: "посетители", sort: "class" },
            { id: "books", label: "книги", sort: "class" },
        ];
        const everyThenSome = renderPremiseRu(scoped("render-a", "person"), entities);
        const someThenEvery = renderPremiseRu(scoped("render-b", "book"), entities);
        expect(everyThenSome).toContain("может зависеть");
        expect(someThenEvery).toContain("существует хотя бы один общий элемент класса «книги»");
        expect(someThenEvery).toContain("каждый элемент класса «посетители»");
        expect(everyThenSome).not.toBe(someThenEvery);
    });
});

describe("exact graph and analogy mapping", () => {
    it("detects a degree-matched non-isomorphic hard negative", () => {
        const edges = degreeMatchedNegativeEdges();
        const sourceIds = ["s0", "s1", "s2", "s3"];
        const targetIds = ["t0", "t1", "t2", "t3"];
        const domain: Extract<DomainSpec, { kind: "boundedGraph" }> = {
            kind: "boundedGraph",
            closure: "closedFiniteDomain",
            directed: true,
            loopsAllowed: false,
            nodeIds: [...sourceIds, ...targetIds],
            relationLabels: ["связь"],
        };
        expect(degreeSignature(edges, "source", sourceIds, true))
            .toBe(degreeSignature(edges, "target", targetIds, true));
        expect(checkDegreeMatchedHardNegative(edges, domain, sourceIds, targetIds))
            .toEqual({ degreeMatched: true, isomorphic: false, qualifies: true });
        expect(classifyGraphIsomorphism(edges, domain, sourceIds, targetIds, "bijection").classification)
            .toBe("refuted");
    });

    it("rejects reversed roles even when their surface features match", () => {
        const edges: GraphEdgePremise[] = [
            { kind: "graphEdge", id: "s", graphId: "source", from: "speaker", to: "message", relationLabel: "передаёт" },
            { kind: "graphEdge", id: "t", graphId: "target", from: "courier", to: "parcel", relationLabel: "передаёт" },
        ];
        const entities: EntitySpec[] = [
            { id: "speaker", label: "круг", sort: "graphNode", features: { surface: "круг" } },
            { id: "message", label: "квадрат", sort: "graphNode", features: { surface: "квадрат" } },
            { id: "courier", label: "квадрат", sort: "graphNode", features: { surface: "квадрат" } },
            { id: "parcel", label: "круг", sort: "graphNode", features: { surface: "круг" } },
        ];
        const problem: StructuralMappingProblem = {
            contract: "bijection",
            domain: {
                kind: "boundedGraph",
                closure: "closedFiniteDomain",
                directed: true,
                loopsAllowed: false,
                nodeIds: entities.map(entity => entity.id),
                relationLabels: ["передаёт"],
            },
            entities,
            sourceIds: ["speaker", "message"],
            targetIds: ["courier", "parcel"],
            edges,
        };
        const reversed = [{ source: "speaker", target: "parcel" }, { source: "message", target: "courier" }];
        expect(diagnoseSurfaceAgreement(problem, reversed).sameFeatureCount).toBe(2);
        expect(scoreStructuralMapping(problem, reversed).valid).toBeFalse();
        expect(scoreStructuralMapping(problem, [
            { source: "speaker", target: "courier" },
            { source: "message", target: "parcel" },
        ]).valid).toBeTrue();
    });
});

function membershipOrderProblem(): MembershipOrderProblem {
    const member: ContainmentPremise = {
        kind: "containment", id: "m", relation: "memberOf", subject: "a", classId: "selected",
    };
    const order: OrderPremise = { kind: "order", id: "o", relation: "leftOf", args: ["a", "b"] };
    const bridge: BridgePremise = {
        kind: "bridge",
        id: "bridge",
        bridgeType: "membershipSelectsOrder",
        fromEntity: "selected",
        toEntity: "a",
        componentFamilies: ["hierarchy", "order"],
    };
    return {
        kind: "membershipOrder",
        componentFamilies: ["hierarchy", "order"],
        premises: [member, order, bridge],
        objectIds: ["a", "b", "c"],
        classId: "selected",
        focusTargetId: "b",
        positionDomain: {
            kind: "boundedPositions",
            closure: "closedFiniteDomain",
            size: 3,
            cyclic: false,
            allowCoincidence: false,
        },
        queryPropositionId: "выбранный объект левее ориентира",
    };
}

function temporalSpatialProblem(): TemporalSpatialProblem {
    const time: IntervalPremise = {
        kind: "interval", id: "time", relation: "before", left: "first", right: "second",
    };
    const recipe: TransformationPremise = {
        kind: "transformation",
        id: "recipe",
        operator: "rotate90",
        inputState: "start",
        outputState: "finish",
        order: 1,
    };
    const bridge: BridgePremise = {
        kind: "bridge",
        id: "bridge",
        bridgeType: "temporalSelectsTransformation",
        fromEntity: "first",
        toEntity: "finish",
        componentFamilies: ["temporalIntervals", "transformations"],
    };
    return {
        kind: "temporalSpatial",
        componentFamilies: ["temporalIntervals", "transformations"],
        premises: [time, recipe, bridge],
        intervalIds: ["first", "second"],
        intervalDomain: { kind: "boundedIntervals", closure: "closedFiniteDomain", endpointMin: 0, endpointMax: 4 },
        transformDomain: { kind: "boundedTransformations", closure: "listedStatesOnly", width: 3, height: 3, frame: "fixedAxes" },
        initialPoint: [0, 1],
        expectedPoint: [1, 0],
        recipeOperators: ["rotate90", "reflectVertical"],
        queryPropositionId: "результат совпадает с целью",
    };
}

function mappingQuantityProblem(): MappingQuantityProblem {
    const mapping: MappingPairPremise = { kind: "mappingPair", id: "map", source: "role", target: "high" };
    const quantity: RationalPremise = {
        kind: "rational", id: "quantity", relation: "ratioGreater", left: rational(3), right: rational(2), units: "балла",
    };
    const bridge: BridgePremise = {
        kind: "bridge",
        id: "bridge",
        bridgeType: "mappingSelectsQuantity",
        fromEntity: "role",
        toEntity: "quantity-high",
        componentFamilies: ["analogy", "proportional"],
    };
    return {
        kind: "mappingQuantity",
        componentFamilies: ["analogy", "proportional"],
        premises: [mapping, quantity, bridge],
        sourceIds: ["role", "other-role"],
        targetIds: ["high", "low"],
        selectedSourceRoleId: "role",
        threshold: rational(2),
        quantityCandidates: [rational(1), rational(3)],
        quantityFacts: [{ premiseId: "quantity", targetId: "high" }],
        quantityEntities: [{ entityId: "quantity-high", targetId: "high" }],
        queryPropositionId: "выбранная величина больше порога",
    };
}

describe("genuinely coupled frames", () => {
    for (const [name, problem] of [
        ["membership with order", membershipOrderProblem()],
        ["temporal context with spatial transformation", temporalSpatialProblem()],
        ["role mapping with quantity", mappingQuantityProblem()],
    ] as const) {
        it(`requires the bridge in every exact minimal support: ${name}`, () => {
            const solved = solveCoupledFrame(problem);
            expect(solved.certificate.classification).toBe("entailed");
            expect(solved.certificate.supports.length).toBe(1);
            expect(solved.certificate.supports[0].premiseIds).toContain("bridge");
            expect(solved.coupling.accepted).toBeTrue();
            expect(solved.coupling.everyMinimalSupportRequiresBridge).toBeTrue();
            expect(solved.certificate.necessaryPremiseIds).toContain("bridge");
        });
    }

    it("does not relabel independent Boolean subquestions as coupled", () => {
        const result = rejectIndependentBooleanComposition([{
            kind: "booleanConstraint",
            id: "independent",
            operator: "exactlyOne",
            propositionIds: ["P", "Q"],
        }], ["categorical", "order"]);
        expect(result.accepted).toBeFalse();
        expect(result.everyMinimalSupportRequiresBridge).toBeFalse();
        expect(result.reasonRu).toContain("Независимые");
    });
});

function target(
    level: 1 | 2 | 3 | 4 | 5,
    min: number,
    max: number,
    responseFormat: ComplexityTarget["responseFormat"],
): ComplexityTarget {
    return {
        level,
        primaryDimension: "supportSize",
        displayedPremises: { min, max },
        responseFormat,
        memoryVisibility: "visible",
        distractorCount: 0,
        timePressure: "none",
    };
}

function request(
    family: GenerationRequest["family"],
    complexity: ComplexityTarget,
    seed = "structural-fixture",
): GenerationRequest {
    return {
        requestId: `${family}-${seed}`,
        seed,
        family,
        partition: "training",
        target: complexity,
        semanticsVersion: DEFAULT_SEMANTICS_VERSION,
        maxAttempts: 4,
        wallTimeBudgetMs: 5_000,
    };
}

describe("deterministic structural generators", () => {
    const control: GenerationControl = { now: () => 0, isCancelled: () => false };

    it("reproduces hierarchy, analogy, scope and graph structures from a seed", () => {
        const calls = [
            () => generateHierarchyItem(request("hierarchy", target(2, 3, 3, "threeWayInference")), control),
            () => generateAnalogyItem(request("analogy", target(1, 4, 4, "completeMapping")), control),
            () => generateScopeItem(request("contextScope", target(2, 1, 1, "threeWayInference")), control),
            () => generateGraphItem(request("graphStructure", target(3, 6, 6, "threeWayInference")), control),
        ];
        for (const generate of calls) {
            const first = generate();
            const second = generate();
            expect(first.ok).toBeTrue();
            expect(second.ok).toBeTrue();
            if (!first.ok || !second.ok) continue;
            expect(first.item.structuralFingerprint).toBe(second.item.structuralFingerprint);
            expect(first.item.query).toEqual(second.item.query);
            expect(first.item.premises).toEqual(second.item.premises);
            expect(first.item.semanticCertificate.classification)
                .toBe(second.item.semanticCertificate.classification);
        }
    });

    it("generates and certifies all three coupled combinations", () => {
        const kinds: CoupledFrameKind[] = ["membershipOrder", "temporalSpatial", "mappingQuantity"];
        for (const kind of kinds) {
            const result = generateCoupledFrameItem(
                request("coupledFrames", target(3, 3, 3, "identifyNecessaryPremise"), `coupled-${kind}`),
                control,
                kind,
            );
            expect(result.ok).withContext(kind).toBeTrue();
            if (!result.ok) continue;
            expect(result.item.componentFamilies.length).toBe(2);
            expect(result.item.semanticCertificate.supports.length).toBe(1);
            expect(result.item.measuredComplexity.everyMinimalSupportRequiresBridge).toBeTrue();
            expect(result.item.measuredComplexity.bridgeNecessityStatus).toBe("exact");
        }
    });

    it("derives and scores the omitted analogy relation by exact repair", () => {
        const result = generateAnalogyItem(
            request("analogy", target(2, 3, 3, "identifyMissingRelation"), "missing-edge"),
            control,
        );
        expect(result.ok).toBeTrue();
        if (!result.ok || result.item.responseSpec.kind !== "identifyMissingRelation") return;
        expect(result.item.responseSpec.expectedRelation).toBe("проверяет");
        expect(result.item.domain.kind).toBe("boundedGraph");
        if (result.item.domain.kind !== "boundedGraph") return;
        const exactProblem: StructuralMappingProblem = {
            contract: "bijection",
            domain: result.item.domain,
            entities: result.item.entities,
            sourceIds: result.item.entities.filter(entity => entity.features?.["frame"] === "source").map(entity => entity.id),
            targetIds: result.item.entities.filter(entity => entity.features?.["frame"] === "target").map(entity => entity.id),
            edges: result.item.premises.filter((premise): premise is GraphEdgePremise => premise.kind === "graphEdge"),
        };
        const exactRepair = scoreMissingRelationLabel(
            exactProblem,
            result.item.responseSpec.choices,
            result.item.responseSpec.expectedRelation,
        );
        expect(exactRepair.acceptedLabels).toEqual(["проверяет"]);
        expect(exactRepair.repairs.length).toBeGreaterThan(0);
        expect(scoreReasoningResponse(result.item, {
            kind: "identifyMissingRelation",
            relation: "проверяет",
        }).correct).toBeTrue();
        expect(scoreReasoningResponse(result.item, {
            kind: "identifyMissingRelation",
            relation: "передаёт",
        }).correct).toBeFalse();
        const tampered = {
            ...result.item,
            responseSpec: { ...result.item.responseSpec, expectedRelation: "передаёт" },
        };
        expect(scoreReasoningResponse(tampered, {
            kind: "identifyMissingRelation",
            relation: "передаёт",
        }).correct).toBeFalse();
    });

    it("uses explicit structural progressions rather than only shortening deadlines", () => {
        const hierarchyBasic = generateHierarchyItem(
            request("hierarchy", target(1, 2, 2, "threeWayInference"), "hierarchy-level-1"),
            control,
        );
        const hierarchyRule = generateHierarchyItem(
            request("hierarchy", target(2, 3, 3, "threeWayInference"), "hierarchy-level-2"),
            control,
        );
        expect(hierarchyBasic.ok && hierarchyBasic.item.structureFamily).toContain("membership-inclusion");
        expect(hierarchyRule.ok && hierarchyRule.item.structureFamily).toContain("monotonic-exception");

        const scopeBasic = generateScopeItem(
            request("contextScope", target(1, 1, 1, "threeWayInference"), "scope-level-1"),
            control,
        );
        const scopeNested = generateScopeItem(
            request("contextScope", target(3, 2, 2, "threeWayInference"), "scope-level-3"),
            control,
        );
        expect(scopeBasic.ok && scopeBasic.item.structureFamily).toContain("operator-comprehension");
        expect(scopeNested.ok && scopeNested.item.measuredComplexity.maxScopeNesting).toBe(2);
        expect(scopeNested.ok && scopeNested.item.structureFamily).toContain("two-context-role-switch");

        const analogyBasic = generateAnalogyItem(
            request("analogy", target(1, 4, 4, "completeMapping"), "analogy-level-1"),
            control,
        );
        const analogyExpanded = generateAnalogyItem(
            request("analogy", target(3, 6, 6, "completeMapping"), "analogy-level-3"),
            control,
        );
        expect(analogyBasic.ok && analogyBasic.item.premises.length).toBe(4);
        expect(analogyExpanded.ok && analogyExpanded.item.premises.length).toBe(6);

        const coupledLevels = ([1, 2, 3] as const).map(level => generateCoupledFrameItem(
            request("coupledFrames", target(level, 3, 3, "threeWayInference"), `coupled-level-${level}`),
            control,
        ));
        expect(coupledLevels.every(result => result.ok)).toBeTrue();
        expect(coupledLevels.map(result => result.ok ? result.item.componentFamilies.join("+") : ""))
            .toEqual(["hierarchy+order", "temporalIntervals+transformations", "analogy+proportional"]);
    });

    it("only emits constructive items that have the required verified witness", () => {
        const generators = [
            (format: "constructSatisfyingModel" | "constructCounterexample", seed: string) =>
                generateHierarchyItem(request("hierarchy", target(2, 3, 3, format), seed), control),
            (format: "constructSatisfyingModel" | "constructCounterexample", seed: string) =>
                generateScopeItem(request("contextScope", target(3, 2, 2, format), seed), control),
        ];
        for (const generate of generators) {
            for (let index = 0; index < 6; index++) {
                const satisfying = generate("constructSatisfyingModel", `satisfying-${index}`);
                expect(satisfying.ok).toBeTrue();
                if (satisfying.ok) {
                    expect(satisfying.item.semanticCertificate.classification).not.toBe("refuted");
                    const witness = satisfying.item.semanticCertificate.queryWitness;
                    expect(witness).toBeDefined();
                    if (witness) {
                        expect(scoreReasoningResponse(satisfying.item, {
                            kind: "constructSatisfyingModel",
                            world: witness,
                        }).correct).toBeTrue();
                    }
                }
                const counterexample = generate("constructCounterexample", `counterexample-${index}`);
                expect(counterexample.ok).toBeTrue();
                if (counterexample.ok) {
                    expect(counterexample.item.semanticCertificate.classification).not.toBe("entailed");
                    const witness = counterexample.item.semanticCertificate.negatedQueryWitness;
                    expect(witness).toBeDefined();
                    if (witness) {
                        expect(scoreReasoningResponse(counterexample.item, {
                            kind: "constructCounterexample",
                            world: witness,
                        }).correct).toBeTrue();
                    }
                }
            }
        }
    });
});
