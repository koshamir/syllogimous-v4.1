import {
    AtomicQuery,
    DomainSpec,
    InferenceClassification,
    RationalPremise,
} from "../models/semantic.models";
import {
    evaluateRationalAtom,
    RationalSemanticErrorCode,
} from "../semantics/proportional";

export type ProportionalClassificationResult =
    | {
        ok: true;
        classification: Exclude<InferenceClassification, "underdetermined">;
        premisesSatisfiable: true;
        solverCompleteness: "completeForDeclaredFragment";
        finiteDomainAssumption: string;
    }
    | {
        ok: false;
        code: "invalidProblem" | "inconsistentPremises";
        detailCode?: RationalSemanticErrorCode;
        premiseId?: string;
        message: string;
    };

/**
 * Classifies the supported ground exact-rational fragment. Because every term
 * is a listed constant, a valid query is determinate; ambiguity belongs in a
 * future variable-bearing proportional fragment rather than being fabricated.
 */
export function classifyProportional(
    premises: readonly RationalPremise[],
    query: Extract<AtomicQuery, { kind: "rational" }>,
    domain: Extract<DomainSpec, { kind: "exactRationals" }>,
): ProportionalClassificationResult {
    for (const premise of premises) {
        const evaluation = evaluateRationalAtom(premise, domain);
        if (!evaluation.ok) {
            return {
                ok: false,
                code: "invalidProblem",
                detailCode: evaluation.code,
                premiseId: premise.id,
                message: evaluation.message,
            };
        }
        if (!evaluation.holds) {
            return {
                ok: false,
                code: "inconsistentPremises",
                premiseId: premise.id,
                message: "A ground rational premise is false in the declared exact domain",
            };
        }
    }
    const evaluation = evaluateRationalAtom(query, domain);
    if (!evaluation.ok) {
        return {
            ok: false,
            code: "invalidProblem",
            detailCode: evaluation.code,
            message: evaluation.message,
        };
    }
    return {
        ok: true,
        classification: evaluation.holds ? "entailed" : "refuted",
        premisesSatisfiable: true,
        solverCompleteness: "completeForDeclaredFragment",
        finiteDomainAssumption: `All quantities are the exact listed rational constants in units '${domain.units}'.`,
    };
}
