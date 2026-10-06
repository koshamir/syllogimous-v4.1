import { GraphEdgePremise, InferenceClassification, ReasoningItem } from "../models/semantic.models";
import { ResponseScore, UserReasoningResponse } from "../models/response.models";
import { CLASSIFICATION_LABEL_RU, RESPONSE_FORMAT_LABEL_RU, semanticOperatorLabelRu } from "../rendering/ru-catalog";
import { verifySubmittedWorld } from "../semantics/world-verifier";
import { validateGraphMapping } from "../semantics/graph";
import { scoreMissingRelationLabel, StructuralMappingProblem } from "../semantics/structural-mapping";
import { reclassifyReasoningItem } from "../certificates/item-verifier";

function mismatch(expected: ReasoningItem["responseSpec"]["kind"]): ResponseScore {
    return {
        correct: false,
        conciseFeedbackRu: "Этот формат ответа не подходит к текущему заданию.",
        detailRu: [`Ожидается формат: ${RESPONSE_FORMAT_LABEL_RU[expected]}.`],
    };
}

function classificationFeedback(item: ReasoningItem, selected: InferenceClassification): ResponseScore {
    const expected = item.semanticCertificate.classification;
    if (!expected) {
        return { correct: false, conciseFeedbackRu: "Обычное задание оказалось противоречивым и должно быть отклонено.", detailRu: [] };
    }
    const correct = selected === expected;
    const support = item.semanticCertificate.supports[0];
    const detail = expected === "underdetermined"
        ? ["Есть две допустимые модели: в одной вывод верен, в другой — неверен."]
        : support
            ? [`Проверенная минимальная опора: ${support.premiseIds.join(", ")}.`]
            : ["Статус получен проверкой всех допустимых миров объявленного фрагмента."];
    return {
        correct,
        evidenceRole: expected === "entailed" ? "proofOfEntailment" : expected === "refuted" ? "proofOfRefutation" : undefined,
        conciseFeedbackRu: correct
            ? `Верно: «${CLASSIFICATION_LABEL_RU[expected]}».`
            : `Ответ не совпадает с проверенным статусом «${CLASSIFICATION_LABEL_RU[expected]}».`,
        detailRu: detail,
    };
}

function verifiedExpectedRelation(item: ReasoningItem): string | undefined {
    if (item.responseSpec.kind !== "identifyMissingRelation") return undefined;
    const declared = item.responseSpec.expectedRelation;
    if (item.family === "analogy" && item.domain.kind === "boundedGraph") {
        const problem: StructuralMappingProblem = {
            contract: "bijection",
            domain: item.domain,
            entities: item.entities,
            sourceIds: item.entities.filter(entity => entity.features?.["frame"] === "source").map(entity => entity.id),
            targetIds: item.entities.filter(entity => entity.features?.["frame"] === "target").map(entity => entity.id),
            edges: item.premises.filter((premise): premise is GraphEdgePremise => premise.kind === "graphEdge"),
        };
        const exact = scoreMissingRelationLabel(problem, item.responseSpec.choices, declared);
        return exact.correct && exact.acceptedLabels.length === 1 ? declared : undefined;
    }
    const query = item.query;
    const semanticRelation = query.kind === "categorical"
        ? query.quantifier
        : query.kind === "order" || query.kind === "interval" || query.kind === "rational"
            ? query.relation
            : undefined;
    return semanticRelation === declared ? declared : undefined;
}

function scoreUpdatedClassification(item: ReasoningItem, selected: InferenceClassification): ResponseScore {
    if (item.responseSpec.kind !== "updateAfterPremiseChange") return mismatch("updateAfterPremiseChange");
    const removedId = item.responseSpec.changePremiseId;
    const recomputed = reclassifyReasoningItem(item, item.premises.filter(premise => premise.id !== removedId));
    if (!item.premises.some(premise => premise.id === removedId)
        || recomputed.status !== "exact" || !recomputed.classification) {
        return { correct: false, conciseFeedbackRu: "Статус после изменения не удалось сертифицировать. Выберите другое задание.", detailRu: [] };
    }
    const expected = recomputed.classification;
    const correct = selected === expected;
    return {
        correct,
        conciseFeedbackRu: correct ? "Статус после удаления посылки обновлён верно." : "После изменения нужно заново проверить множество допустимых моделей.",
        detailRu: [`После удаления «${removedId}» ожидается: «${CLASSIFICATION_LABEL_RU[expected]}».`],
    };
}

export function scoreReasoningResponse(item: ReasoningItem, response: UserReasoningResponse): ResponseScore {
    if (response.kind !== item.responseSpec.kind) return mismatch(item.responseSpec.kind);
    switch (response.kind) {
        case "threeWayInference":
            return classificationFeedback(item, response.classification);
        case "constructSatisfyingModel": {
            const verified = verifySubmittedWorld(item, response.world);
            const correct = verified.valid && verified.queryHolds === true;
            return {
                correct,
                evidenceRole: correct ? "satisfyingWitness" : undefined,
                conciseFeedbackRu: correct ? "Модель удовлетворяет всем посылкам и проверяемому выводу." : verified.messageRu ?? "Модель не удовлетворяет запросу.",
                detailRu: correct ? ["Допустимы и другие модели; совпадение с моделью генератора не требуется."] : [],
                violatedConstraintId: verified.violatedPremiseId,
            };
        }
        case "constructCounterexample": {
            const verified = verifySubmittedWorld(item, response.world);
            const correct = verified.valid && verified.queryHolds === false;
            return {
                correct,
                evidenceRole: correct ? "counterexampleToEntailment" : undefined,
                conciseFeedbackRu: correct ? "Это допустимый контрпример к следованию вывода." : verified.messageRu ?? "Модель не опровергает следование.",
                detailRu: correct
                    ? ["Контрпример доказывает, что вывод не следует. Сам по себе он не доказывает, что посылки влекут логическое отрицание вывода."]
                    : [],
                violatedConstraintId: verified.violatedPremiseId,
            };
        }
        case "completeMapping": {
            if (item.domain.kind !== "boundedGraph") return mismatch("completeMapping");
            const edges = item.premises.filter((premise): premise is GraphEdgePremise => premise.kind === "graphEdge");
            const sourceIds = item.responseSpec.kind === "completeMapping" ? item.responseSpec.sourceIds : [];
            const targetIds = item.responseSpec.kind === "completeMapping" ? item.responseSpec.targetIds : [];
            const contract = item.responseSpec.kind === "completeMapping" ? item.responseSpec.contract : "bijection";
            const result = validateGraphMapping(edges, item.domain, sourceIds, targetIds, response.pairs, contract);
            return {
                correct: result.valid,
                evidenceRole: result.valid ? "structuralValidation" : undefined,
                conciseFeedbackRu: result.valid ? "Соответствие сохраняет отношения и порядок ролей." : result.violations[0]?.messageRu ?? "Соответствие неверно.",
                detailRu: result.violations.slice(1).map(violation => violation.messageRu),
            };
        }
        case "identifyMissingRelation": {
            const expected = verifiedExpectedRelation(item);
            const correct = response.relation === expected;
            return { correct, conciseFeedbackRu: correct ? "Недостающая связь выбрана верно." : "Выбранная связь меняет структуру.", detailRu: expected ? [`Проверенная связь: ${semanticOperatorLabelRu(expected)}.`] : [] };
        }
        case "repairProof": {
            const selected = [...response.premiseIds].sort();
            const matchingSupport = item.semanticCertificate.supports.find(support =>
                support.status === "exact"
                && [...support.premiseIds].sort().join("\u0000") === selected.join("\u0000"));
            return {
                correct: !!matchingSupport,
                evidenceRole: matchingSupport ? (item.semanticCertificate.classification === "refuted" ? "proofOfRefutation" : "proofOfEntailment") : undefined,
                conciseFeedbackRu: matchingSupport ? "Выбрана полная минимальная опора доказательства." : "Набор не является проверенной минимальной опорой.",
                detailRu: [],
            };
        }
        case "identifyNecessaryPremise": {
            const correct = item.semanticCertificate.necessaryPremiseIds.includes(response.premiseId);
            return {
                correct,
                conciseFeedbackRu: correct ? "Удаление этой посылки меняет статус вывода." : "Для этой посылки критерий необходимости не выполнен.",
                detailRu: item.semanticCertificate.classification === "underdetermined"
                    ? ["Для неопределённого вывода удаление не называется логической необходимостью; используется отдельный критерий ограничения миров."]
                    : [],
            };
        }
        case "updateAfterPremiseChange":
            return scoreUpdatedClassification(item, response.classification);
    }
}
