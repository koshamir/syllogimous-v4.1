import { AtomicQuery, ContextScopeWorld, GenerationRequest, ScopeFrameSpec, ScopedRelationPremise } from "../models/semantic.models";
import { classifyScopeQuery, validateContextScopeWorld } from "./scope-solver";
import { enumerateContextScopeWorlds, evaluateScopedRelation } from "../semantics/scope";
import { generateScopeItem } from "../generators/scope-generator";
import { DEFAULT_SEMANTICS_VERSION } from "../models/versions";
import { verifyReasoningItem } from "../certificates/item-verifier";

const FRAMES: ScopeFrameSpec[] = [
    { contextId: "first", relation: "signalsTo", subjectClass: "senders", objectClass: "receivers", subjectIds: ["A", "B"], objectIds: ["C", "D"] },
    { contextId: "second", relation: "sees", subjectClass: "senders", objectClass: "receivers", subjectIds: ["C", "D"], objectIds: ["A", "B"] },
];

function statement(id: string, frame: ScopeFrameSpec, subject: "every" | "some" = "every", object: "every" | "some" = "some", subjectOuter = true): ScopedRelationPremise {
    return { kind: "scopedRelation", id, contextId: frame.contextId, relation: frame.relation, subjectClass: frame.subjectClass,
        objectClass: frame.objectClass, subjectBindingId: `${id}-s`, objectBindingId: `${id}-o`,
        quantifierOrder: subjectOuter ? [`${id}-s`, `${id}-o`] : [`${id}-o`, `${id}-s`], subjectQuantifier: subject,
        objectQuantifier: object, nestingDepth: 2 };
}

function query(premise: ScopedRelationPremise): Extract<AtomicQuery, { kind: "scopedRelation" }> {
    const { id: _id, ...atomic } = premise;
    return atomic;
}

describe("bounded independent contexts and relation states", () => {
    it("does not transfer a quantified relation to a new context with reversed roles", () => {
        const premise = statement("p", FRAMES[0]);
        const q = query(statement("q", FRAMES[1]));
        const result = classifyScopeQuery([premise], q, [], [], FRAMES);
        expect(result.classification).toBe("underdetermined");
        expect(result.queryWitness?.kind).toBe("contextScopeWorld");
        expect(result.negatedQueryWitness?.kind).toBe("contextScopeWorld");
        for (const [world, polarity] of [[result.queryWitness, true], [result.negatedQueryWitness, false]] as const) {
            if (world?.kind !== "contextScopeWorld") throw new Error("Missing model");
            expect(validateContextScopeWorld(world, [premise], FRAMES).valid).toBeTrue();
            expect(evaluateScopedRelation(q, world)).toBe(polarity);
        }
    });

    it("keeps reads and sees separate even inside the same named context", () => {
        const frames: ScopeFrameSpec[] = [ { ...FRAMES[0], relation: "reads" }, { ...FRAMES[0], relation: "sees" } ];
        const p = statement("p", frames[0]);
        expect(classifyScopeQuery([p], query(statement("q", frames[1])), [], [], frames).classification).toBe("underdetermined");
    });

    it("checks every two-context2x2 table against an independent matrix quantifier oracle", () => {
        const worlds = enumerateContextScopeWorlds(FRAMES);
        expect(worlds.length).toBe(256);
        const quantify = (values: boolean[], kind: "every" | "some") => kind === "every" ? values.filter(Boolean).length === values.length : values.filter(Boolean).length > 0;
        for (const world of worlds) for (let frameIndex = 0; frameIndex < FRAMES.length; frameIndex++) {
            const frame = world.frames[frameIndex];
            const table = frame.subjectIds.map(subject => frame.objectIds.map(object => frame.relationPairs.some(pair => pair[0] === subject && pair[1] === object)));
            for (const subjectQuantifier of ["every", "some"] as const) for (const objectQuantifier of ["every", "some"] as const) for (const subjectOuter of [true, false]) {
                const independent = subjectOuter
                    ? quantify(table.map(row => quantify(row, objectQuantifier)), subjectQuantifier)
                    : quantify(frame.objectIds.map((_, column) => quantify(table.map(row => row[column]), subjectQuantifier)), objectQuantifier);
                expect(evaluateScopedRelation(statement("q", FRAMES[frameIndex], subjectQuantifier, objectQuantifier, subjectOuter), world)).toBe(independent);
            }
        }
    });

    it("rejects missing or conflated frames and invalid role pairs", () => {
        const world = enumerateContextScopeWorlds(FRAMES)[0];
        expect(validateContextScopeWorld({ ...world, frames: world.frames.slice(0, 1) }, [], FRAMES).valid).toBeFalse();
        const wrong: ContextScopeWorld = { ...world, frames: [ { ...world.frames[0], relationPairs: [["C", "A"]] }, world.frames[1] ] };
        expect(validateContextScopeWorld(wrong, [], FRAMES).valid).toBeFalse();
    });

    it("generates level3/4 context progression with all answer classes and verified witnesses", () => {
        for (const level of [3, 4] as const) {
            const labels = new Set<string>();
            for (let index = 0; index < 24; index++) {
                const request: GenerationRequest = { requestId: `scope-${level}-${index}`, seed: `scope-${level}-${index}`, family: "contextScope", partition: "training",
                    semanticsVersion: DEFAULT_SEMANTICS_VERSION, maxAttempts: 4, wallTimeBudgetMs: 1000,
                    target: { level, primaryDimension: "bindingInterference", displayedPremises: { min: 3, max: 6 }, responseFormat: "threeWayInference", memoryVisibility: "visible", distractorCount: 0, timePressure: "none" } };
                const result = generateScopeItem(request);
                if (!result.ok) throw new Error(result.messageRu);
                labels.add(result.item.semanticCertificate.classification!);
                expect(result.item.domain.kind).toBe("boundedContexts");
                if (result.item.domain.kind !== "boundedContexts") throw new Error("Wrong domain");
                expect(result.item.domain.frames?.length).toBe(2);
                expect(result.item.domain.frames?.[1].subjectIds).toEqual(result.item.domain.frames?.[0].objectIds);
                expect(verifyReasoningItem(result.item).issues).toEqual([]);
            }
            expect([...labels].sort()).toEqual(["entailed", "refuted", "underdetermined"]);
        }
    });
});
