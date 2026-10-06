import {
    AtomicQuery,
    DomainSpec,
    InferenceClassification,
    TransformWorld,
} from "../models/semantic.models";
import {
    evaluateTransformationQuery,
    TransformationErrorCode,
} from "../semantics/transformations";

export type TransformationClassificationResult =
    | {
        ok: true;
        classification: Exclude<InferenceClassification, "underdetermined">;
        premisesSatisfiable: true;
        queryWorld: TransformWorld;
        solverCompleteness: "completeForDeclaredFragment";
        finiteDomainAssumption: string;
    }
    | { ok: false; code: TransformationErrorCode; message: string };

/** A listed deterministic composition is either true or false in its grid. */
export function classifyTransformation(
    query: Extract<AtomicQuery, { kind: "transformationResult" }>,
    domain: Extract<DomainSpec, { kind: "boundedTransformations" }>,
): TransformationClassificationResult {
    const evaluation = evaluateTransformationQuery(query, domain);
    if (!evaluation.ok) return evaluation;
    return {
        ok: true,
        classification: evaluation.holds ? "entailed" : "refuted",
        premisesSatisfiable: true,
        queryWorld: evaluation.world,
        solverCompleteness: "completeForDeclaredFragment",
        finiteDomainAssumption: `Coordinates use the complete ${domain.width} × ${domain.height} fixed-axis grid.`,
    };
}
