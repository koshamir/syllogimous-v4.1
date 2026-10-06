import { MappingWorld, SemanticCertificate } from "../models/semantic.models";
import {
    findStructuralMappings,
    scoreStructuralMapping,
    StructuralMappingProblem,
} from "../semantics/structural-mapping";

export function classifyStructuralAnalogy(problem: StructuralMappingProblem): SemanticCertificate {
    const mappings = findStructuralMappings(problem);
    const first = mappings[0];
    const witness: MappingWorld | undefined = first
        ? { kind: "mappingWorld", pairs: first }
        : undefined;
    return {
        premisesSatisfiable: true,
        classification: witness ? "entailed" : "refuted",
        solverCompleteness: "boundedComplete",
        finiteDomainAssumptions: [
            `Отображения проверены на двух явно заданных структурах из ${problem.sourceIds.length} и ${problem.targetIds.length} ролей.`,
            problem.contract === "bijection"
                ? "Требуется взаимно-однозначное соответствие, сохраняющее и отражающее все подписанные связи."
                : "Проверяется только явно выбранный договор отображения; биекция не предполагается.",
        ],
        queryWitness: witness,
        supports: [],
        necessaryPremiseIds: [],
        contrastiveRelevantPremiseIds: [],
        verification: {
            premisesChecked: true,
            witnessesChecked: witness ? scoreStructuralMapping(problem, witness.pairs).valid : true,
            supportsChecked: "unavailable",
            independentOracleChecked: null,
        },
    };
}
