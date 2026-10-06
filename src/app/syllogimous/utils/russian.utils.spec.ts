import { EnumArrangements, EnumQuestionType } from "../constants/question.constants";
import { FORMS, SYL_KINDS } from "../constants/syllogism.constants";
import { SylKind } from "../models/syllogism.models";
import { formatSylPremise } from "./syllogism.utils";
import {
    BINARY_EXPRESSIONS,
    BinaryOperator,
    evaluateBinaryExpression,
    formatAnalogyConclusion,
    formatArrangementInstruction,
    formatArrangementProposition,
    formatBasicProposition,
    formatBinaryConclusion,
    formatDirection3DProposition,
    formatDirectionProposition,
    formatGraphEdge,
    formatGraphMeta,
    formatMetaRelation,
    pluralRu,
    subject,
} from "./russian.utils";

describe("Russian formatters", () => {
    const A = '<span class="subject">А</span>';
    const B = '<span class="subject">Б</span>';
    const C = '<span class="subject">В</span>';
    const D = '<span class="subject">Г</span>';

    it("keeps subject spans exact", () => {
        expect(subject("Метка")).toBe('<span class="subject">Метка</span>');
    });

    it("uses Russian plural forms", () => {
        const cases: Array<[number, string]> = [
            [0, "шагов"], [1, "шаг"], [2, "шага"], [4, "шага"],
            [5, "шагов"], [11, "шагов"], [12, "шагов"], [14, "шагов"],
            [21, "шаг"], [22, "шага"], [25, "шагов"],
        ];
        for (const [value, expected] of cases) {
            expect(pluralRu(value, "шаг", "шага", "шагов")).withContext(String(value)).toBe(expected);
        }
    });

    it("formats equality and comparisons without filler words", () => {
        expect(formatBasicProposition("А", "Б", EnumQuestionType.Distinction, true)).toBe(`${A} равен ${B}`);
        expect(formatBasicProposition("А", "Б", EnumQuestionType.Distinction, false)).toBe(`${A} противоположен ${B}`);
        expect(formatBasicProposition("А", "Б", EnumQuestionType.ComparisonNumerical, true)).toBe(`${A} больше ${B}`);
        expect(formatBasicProposition("А", "Б", EnumQuestionType.ComparisonNumerical, false)).toBe(`${A} меньше ${B}`);
        expect(formatBasicProposition("А", "Б", EnumQuestionType.ComparisonChronological, true)).toBe(`${A} позже ${B}`);
        expect(formatBasicProposition("А", "Б", EnumQuestionType.ComparisonChronological, false)).toBe(`${A} раньше ${B}`);
        expect(formatBasicProposition("А", "Б", EnumQuestionType.ComparisonNumerical, true, true))
            .toBe(`${A} <span class="is-negated">меньше</span> ${B}`);
    });

    it("formats meta-relations with four subjects in order", () => {
        expect(formatMetaRelation("А", "Б", "В", "Г", true))
            .toBe(`Отношение ${A} к ${B} такое же, как отношение ${C} к ${D}`);
        expect(formatMetaRelation("А", "Б", "В", "Г", false))
            .toBe(`Отношение ${A} к ${B} противоположно отношению ${C} к ${D}`);
        expect(formatMetaRelation("А", "Б", "В", "Г", true, true))
            .toBe(`Отношение ${A} к ${B} <span class="is-negated">противоположно</span> отношению ${C} к ${D}`);
    });

    it("formats linear and circular arrangements", () => {
        expect(formatArrangementInstruction(["А", "Б", "В", "Г"], true))
            .toBe(`${A}, ${B}, ${C} и ${D} стоят в линию`);
        expect(formatArrangementInstruction(["А", "Б", "В", "Г"], false))
            .toBe(`${A}, ${B}, ${C} и ${D} расположены по кругу`);
        expect(formatArrangementProposition("А", "Б", { description: EnumArrangements.AdjacentLeft, steps: 1 }))
            .toBe(`${A} находится сразу слева от ${B}`);
        expect(formatArrangementProposition("А", "Б", { description: EnumArrangements.Next, steps: 1 }))
            .toBe(`${A} находится рядом с ${B}`);
        expect(formatArrangementProposition("А", "Б", { description: EnumArrangements.NStepsRight, steps: 2 }))
            .toBe(`${A} находится на 2 позиции правее ${B}`);
        expect(formatArrangementProposition("А", "Б", { description: EnumArrangements.NStepsLeft, steps: 5 }))
            .toBe(`${A} находится на 5 позиций левее ${B}`);
        expect(formatArrangementProposition("А", "Б", { description: EnumArrangements.NStepsLeft, steps: 21 }))
            .toBe(`${A} находится на 21 позицию левее ${B}`);
        expect(formatArrangementProposition("А", "Б", { description: EnumArrangements.InFront, steps: 0 }))
            .toBe(`${A} находится напротив ${B}`);
        expect(formatArrangementProposition("А", "Б", { description: EnumArrangements.AdjacentLeft, steps: 1 }, true))
            .toBe(`${A} находится сразу <span class="is-negated">справа</span> от ${B}`);
    });

    it("formats exact 2D directions and inversions", () => {
        expect(formatDirectionProposition("А", "Б", [["North", 2]]))
            .toBe(`${A} находится на 2 шага к северу от ${B}`);
        expect(formatDirectionProposition("А", "Б", [["West", 1]]))
            .toBe(`${A} находится на 1 шаг к западу от ${B}`);
        expect(formatDirectionProposition("А", "Б", [["North", 2], ["East", 1]]))
            .toBe(`${A} находится на 2 шага к северу и на 1 шаг к востоку от ${B}`);
        expect(formatDirectionProposition("А", "Б", [["North", 1]], true))
            .toBe(`${A} находится в соседней клетке к северу от ${B}`);
        expect(formatDirectionProposition("А", "Б", [["North", 1], ["West", 1]], true))
            .toBe(`${A} находится в соседней клетке к северо-западу от ${B}`);
        expect(formatDirectionProposition("А", "Б", [["North", 2]], false, [true]))
            .toBe(`${A} находится на 2 шага <span class="is-negated">к югу</span> от ${B}`);
    });

    it("formats spatial 3D directions", () => {
        expect(formatDirection3DProposition("А", "Б", true, 0, []))
            .toBe(`${A} на одном уровне и в той же точке, что ${B}`);
        expect(formatDirection3DProposition("А", "Б", true, 1, []))
            .toBe(`${A} прямо над ${B}`);
        expect(formatDirection3DProposition("А", "Б", true, -1, []))
            .toBe(`${A} прямо под ${B}`);
        expect(formatDirection3DProposition("А", "Б", true, -1, [["North", 2], ["East", 1]]))
            .toBe(`${A} на 1 уровень ниже, на 2 шага севернее и на 1 шаг восточнее ${B}`);
        expect(formatDirection3DProposition("А", "Б", true, -2, []))
            .toBe(`${A} на 2 уровня ниже ${B}`);
        expect(formatDirection3DProposition("А", "Б", true, 1, [], { transversal: true }))
            .toBe(`${A} прямо <span class="is-negated">под</span> ${B}`);
    });

    it("formats temporal 3D directions", () => {
        expect(formatDirection3DProposition("А", "Б", false, 0, []))
            .toBe(`${A} одновременно с ${B}`);
        expect(formatDirection3DProposition("А", "Б", false, -1, [["West", 2]]))
            .toBe(`${A} на 1 час раньше и на 2 шага западнее ${B}`);
        expect(formatDirection3DProposition("А", "Б", false, 2, []))
            .toBe(`${A} на 2 часа позже ${B}`);
        expect(formatDirection3DProposition("А", "Б", false, 0, [["South", 1]]))
            .toBe(`${A} одновременно с ${B}, но на 1 шаг южнее`);
    });

    it("keeps graph arrows and meta-pair direction", () => {
        expect(formatGraphEdge("А", "→", "Б")).toBe(`${A} ведёт к ${B}`);
        expect(formatGraphEdge("А", "←", "Б")).toBe(`${A} идёт от ${B}`);
        expect(formatGraphEdge("А", "↔", "Б")).toBe(`${A} связан с ${B}`);
        expect(formatGraphEdge("А", "→", "Б", true))
            .toBe(`${A} <span class="is-negated">идёт от</span> ${B}`);
        expect(formatGraphMeta("А", "Б", "В", "Г"))
            .toBe(`Отношение ${A} к ${B} такое же, как отношение ${C} к ${D}`);
        expect(formatGraphMeta("А", "Б", "В", "Г", true))
            .toBe(`Отношение ${A} к ${B} такое же, как отношение ${D} к ${C}`);
    });

    it("formats analogies without changing subject order", () => {
        expect(formatAnalogyConclusion("А", "Б", "В", "Г", true))
            .toBe(`Отношение ${A} к ${B}<div class="analogy-conclusion">такое же, как отношение</div>${C} к ${D}`);
        expect(formatAnalogyConclusion("А", "Б", "В", "Г", false))
            .toBe(`Отношение ${A} к ${B}<div class="analogy-conclusion">отличается от отношения</div>${C} к ${D}`);
    });

    it("formats all binary conclusions", () => {
        const a = `${A} равен ${B}`;
        const b = `${C} равен ${D}`;
        expect(formatBinaryConclusion("and", a, b)).toContain("Верны оба:");
        expect(formatBinaryConclusion("nand", a, b)).toContain("Не оба верны:");
        expect(formatBinaryConclusion("or", a, b)).toContain("возможно оба");
        expect(formatBinaryConclusion("nor", a, b)).toContain("Неверны оба:");
        expect(formatBinaryConclusion("xor", a, b)).toContain("Верно только одно:");
        expect(formatBinaryConclusion("xnor", a, b)).toContain("либо оба верны, либо оба неверны");
    });

    it("evaluates every binary truth table", () => {
        const inputs: Array<[boolean, boolean]> = [[false, false], [false, true], [true, false], [true, true]];
        const expected: Record<BinaryOperator, boolean[]> = {
            and:  [false, false, false, true],
            nand: [true, true, true, false],
            or:   [false, true, true, true],
            nor:  [true, false, false, false],
            xor:  [false, true, true, false],
            xnor: [true, false, false, true],
        };
        for (const operator of Object.keys(expected) as BinaryOperator[]) {
            inputs.forEach(([a, b], index) => {
                expect(evaluateBinaryExpression(BINARY_EXPRESSIONS[operator], a, b))
                    .withContext(`${operator}: ${a}, ${b}`)
                    .toBe(expected[operator][index]);
            });
        }
    });

    it("keeps FORMS and formatSylPremise identical for all four kinds", () => {
        const renderForm = (kind: SylKind, negated: boolean) => {
            const index = SYL_KINDS.indexOf(kind);
            return FORMS[negated ? 1 : 0][index].replace("$", "А").replace("$", "Б");
        };
        for (const kind of SYL_KINDS) {
            expect(formatSylPremise(["А", kind, "Б"], false)).toBe(renderForm(kind, false));
            expect(formatSylPremise(["А", kind, "Б"], true)).toBe(renderForm(kind, true));
        }
    });

    it("does not use randomness inside formatters", () => {
        const random = spyOn(Math, "random");
        formatBasicProposition("А", "Б", EnumQuestionType.Distinction, true, true);
        formatMetaRelation("А", "Б", "В", "Г", true, true);
        formatArrangementProposition("А", "Б", { description: EnumArrangements.Left, steps: 1 }, true);
        formatDirectionProposition("А", "Б", [["North", 1]], false, [true]);
        formatDirection3DProposition("А", "Б", true, 1, [["East", 1]], { transversal: true, cardinals: [true] });
        formatGraphEdge("А", "→", "Б", true);
        formatAnalogyConclusion("А", "Б", "В", "Г", true, true);
        formatBinaryConclusion("and", "А", "Б");
        expect(random).not.toHaveBeenCalled();
    });
});
