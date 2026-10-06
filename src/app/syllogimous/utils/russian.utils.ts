import { EnumScreens, EnumTiers } from "../constants/game.constants";
import { EnumArrangements, EnumQuestionType } from "../constants/question.constants";
import { IArrangementRelationship } from "../models/question.models";

export const QUESTION_TYPE_LABELS: Readonly<Record<EnumQuestionType, string>> = {
    [EnumQuestionType.Distinction]: "Равенство и противоположность",
    [EnumQuestionType.ComparisonNumerical]: "Сравнение чисел",
    [EnumQuestionType.ComparisonChronological]: "Порядок во времени",
    [EnumQuestionType.Syllogism]: "Силлогизмы",
    [EnumQuestionType.Direction]: "Направления 2D",
    [EnumQuestionType.Direction3DSpatial]: "Направления 3D",
    [EnumQuestionType.Direction3DTemporal]: "Пространство и время",
    [EnumQuestionType.LinearArrangement]: "Линейный порядок",
    [EnumQuestionType.CircularArrangement]: "Круговой порядок",
    [EnumQuestionType.GraphMatching]: "Сравнение графов",
    [EnumQuestionType.Analogy]: "Аналогии",
    [EnumQuestionType.Binary]: "Логические связки",
};

export const SCREEN_LABELS: Readonly<Record<EnumScreens, string>> = {
    [EnumScreens.Intro]: "Введение",
    [EnumScreens.Start]: "Главная",
    [EnumScreens.Tutorial]: "Обучение",
    [EnumScreens.Game]: "Игра",
    [EnumScreens.Feedback]: "Результат",
    [EnumScreens.History]: "История",
    [EnumScreens.Tutorials]: "Уроки",
    [EnumScreens.Stats]: "Статистика",
    [EnumScreens.PlaygroundMode]: "Свободный режим",
    [EnumScreens.Settings]: "Настройки",
    [EnumScreens.TiersMatrix]: "Таблица уровней",
    [EnumScreens.OtherGames]: "Другие игры",
};

export const TIER_LABELS: Readonly<Record<EnumTiers, string>> = {
    [EnumTiers.Adept]: "Начинающий",
    [EnumTiers.Scholar]: "Ученик",
    [EnumTiers.Savant]: "Знаток",
    [EnumTiers.Expert]: "Эксперт",
    [EnumTiers.Mastermind]: "Стратег",
    [EnumTiers.Visionary]: "Провидец",
    [EnumTiers.Genius]: "Гений",
    [EnumTiers.Virtuoso]: "Виртуоз",
    [EnumTiers.Luminary]: "Светоч",
    [EnumTiers.Prodigy]: "Вундеркинд",
    [EnumTiers.Oracle]: "Оракул",
    [EnumTiers.Sage]: "Мудрец",
    [EnumTiers.Philosopher]: "Философ",
    [EnumTiers.Mystic]: "Мистик",
    [EnumTiers.Transcendent]: "Просветлённый",
};

export const BINARY_OPERATOR_LABELS = {
    and: "И",
    nand: "НЕ-И",
    or: "ИЛИ",
    nor: "НЕ-ИЛИ",
    xor: "ИСКЛЮЧАЮЩЕЕ ИЛИ",
    xnor: "РАВНОЗНАЧНО",
} as const;

export type BinaryOperator = keyof typeof BINARY_OPERATOR_LABELS;

export const BINARY_EXPRESSIONS: Readonly<Record<BinaryOperator, string>> = {
    and: "a&&b",
    nand: "!(a&&b)",
    or: "a||b",
    nor: "!(a||b)",
    xor: "!(a&&b)&&(a||b)",
    xnor: "!(!(a&&b)&&(a||b))",
};

export function questionTypeLabel(type: EnumQuestionType | string): string {
    return QUESTION_TYPE_LABELS[type as EnumQuestionType] || type;
}

export function tierLabel(tier: EnumTiers | string): string {
    return TIER_LABELS[tier as EnumTiers] || tier;
}

export function screenLabel(screen: EnumScreens | string): string {
    return SCREEN_LABELS[screen as EnumScreens] || screen;
}

export function uiLabel(value: unknown): string {
    if (value === true) return "Верно";
    if (value === false) return "Неверно";
    if (value == null) return "";

    const text = String(value);
    return questionTypeLabel(text) !== text
        ? questionTypeLabel(text)
        : tierLabel(text) !== text
            ? tierLabel(text)
            : screenLabel(text);
}

export function pluralRu(n: number, one: string, few: string, many: string): string {
    const absolute = Math.abs(Math.trunc(n));
    const lastTwo = absolute % 100;
    const last = absolute % 10;

    if (lastTwo >= 11 && lastTwo <= 14) return many;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
}

export function subject(value: string): string {
    return `<span class="subject">${value}</span>`;
}

function inverted(text: string, isInverted: boolean): string {
    return isInverted ? `<span class="is-negated">${text}</span>` : text;
}

export function formatBasicRelation(
    type: EnumQuestionType.Distinction | EnumQuestionType.ComparisonNumerical | EnumQuestionType.ComparisonChronological,
    isPositive: boolean,
    isInverted = false,
): string {
    const relations: Record<string, [string, string]> = {
        [EnumQuestionType.Distinction]: ["равен", "противоположен"],
        [EnumQuestionType.ComparisonNumerical]: ["больше", "меньше"],
        [EnumQuestionType.ComparisonChronological]: ["позже", "раньше"],
    };
    const pair = relations[type];
    const intended = isPositive ? 0 : 1;
    const displayed = isInverted ? 1 - intended : intended;
    return inverted(pair[displayed], isInverted);
}

export function formatBasicProposition(
    a: string,
    b: string,
    type: EnumQuestionType.Distinction | EnumQuestionType.ComparisonNumerical | EnumQuestionType.ComparisonChronological,
    isPositive: boolean,
    isInverted = false,
): string {
    return `${subject(a)} ${formatBasicRelation(type, isPositive, isInverted)} ${subject(b)}`;
}

export function formatMetaRelation(
    a: string,
    b: string,
    c: string,
    d: string,
    isSame: boolean,
    isInverted = false,
): string {
    const displayedSame = isInverted ? !isSame : isSame;
    const relation = displayedSame
        ? `${inverted("такое же", isInverted)}, как отношение`
        : inverted("противоположно", isInverted) + " отношению";
    return `Отношение ${subject(a)} к ${subject(b)} ${relation} ${subject(c)} к ${subject(d)}`;
}

const ARRANGEMENT_OPPOSITES: Readonly<Partial<Record<EnumArrangements, EnumArrangements>>> = {
    [EnumArrangements.AdjacentLeft]: EnumArrangements.AdjacentRight,
    [EnumArrangements.AdjacentRight]: EnumArrangements.AdjacentLeft,
    [EnumArrangements.NStepsLeft]: EnumArrangements.NStepsRight,
    [EnumArrangements.NStepsRight]: EnumArrangements.NStepsLeft,
    [EnumArrangements.Left]: EnumArrangements.Right,
    [EnumArrangements.Right]: EnumArrangements.Left,
};

export function formatArrangementRelationship(
    relationship: IArrangementRelationship,
    isInverted = false,
): string {
    const original = relationship.description;
    const description = isInverted ? (ARRANGEMENT_OPPOSITES[original] || original) : original;
    const marked = (text: string) => inverted(text, isInverted && description !== original);

    switch (description) {
        case EnumArrangements.AdjacentLeft:
            return `находится сразу ${marked("слева")} от`;
        case EnumArrangements.AdjacentRight:
            return `находится сразу ${marked("справа")} от`;
        case EnumArrangements.Next:
            return "находится рядом с";
        case EnumArrangements.NStepsLeft:
            return `находится на ${relationship.steps} ${pluralRu(relationship.steps, "позицию", "позиции", "позиций")} ${marked("левее")}`;
        case EnumArrangements.NStepsRight:
            return `находится на ${relationship.steps} ${pluralRu(relationship.steps, "позицию", "позиции", "позиций")} ${marked("правее")}`;
        case EnumArrangements.Left:
            return `находится ${marked("левее")}`;
        case EnumArrangements.Right:
            return `находится ${marked("правее")}`;
        case EnumArrangements.InFront:
            return "находится напротив";
        default:
            throw new Error(`Неизвестное отношение порядка: ${description}`);
    }
}

export function formatArrangementProposition(
    a: string,
    b: string,
    relationship: IArrangementRelationship,
    isInverted = false,
): string {
    return `${subject(a)} ${formatArrangementRelationship(relationship, isInverted)} ${subject(b)}`;
}

export function joinRu(items: string[]): string {
    if (items.length < 2) return items[0] || "";
    if (items.length === 2) return `${items[0]} и ${items[1]}`;
    return `${items.slice(0, -1).join(", ")} и ${items[items.length - 1]}`;
}

export function formatArrangementInstruction(items: string[], isLinear: boolean): string {
    return `${joinRu(items.map(subject))} ${isLinear ? "стоят в линию" : "расположены по кругу"}`;
}

export type CardinalDirection = "North" | "South" | "East" | "West";

export const CARDINAL_OPPOSITES: Readonly<Record<CardinalDirection, CardinalDirection>> = {
    North: "South",
    South: "North",
    East: "West",
    West: "East",
};

const CARDINAL_DATIVE: Readonly<Record<CardinalDirection, string>> = {
    North: "к северу",
    South: "к югу",
    East: "к востоку",
    West: "к западу",
};

const CARDINAL_COMPARATIVE: Readonly<Record<CardinalDirection, string>> = {
    North: "севернее",
    South: "южнее",
    East: "восточнее",
    West: "западнее",
};

function displayedCardinal(cardinal: CardinalDirection, isInverted: boolean): CardinalDirection {
    return isInverted ? CARDINAL_OPPOSITES[cardinal] : cardinal;
}

function diagonalDirection(cardinals: CardinalDirection[]): string {
    const vertical = cardinals.find(cardinal => cardinal === "North" || cardinal === "South");
    const horizontal = cardinals.find(cardinal => cardinal === "East" || cardinal === "West");
    if (!vertical || !horizontal) return CARDINAL_DATIVE[cardinals[0]];

    const labels: Record<string, string> = {
        "North-East": "к северо-востоку",
        "North-West": "к северо-западу",
        "South-East": "к юго-востоку",
        "South-West": "к юго-западу",
    };
    return labels[`${vertical}-${horizontal}`];
}

export function formatDirectionRelationship(
    cardinals: [string, number][],
    adjacent = false,
    inversions: boolean[] = [],
): string {
    const clean = cardinals.filter(([direction, steps]) => direction !== "!" && steps !== 0);
    if (!clean.length) return "в той же клетке";

    const directions = clean.map(([direction], index) =>
        displayedCardinal(direction as CardinalDirection, !!inversions[index])
    );

    if (adjacent) {
        const direction = directions.length === 2
            ? diagonalDirection(directions)
            : CARDINAL_DATIVE[directions[0]];
        return `в соседней клетке ${inverted(direction, inversions.some(Boolean))}`;
    }

    return clean.map(([, steps], index) => {
        const direction = inverted(CARDINAL_DATIVE[directions[index]], !!inversions[index]);
        return `на ${steps} ${pluralRu(steps, "шаг", "шага", "шагов")} ${direction}`;
    }).join(" и ");
}

export function formatDirectionProposition(
    a: string,
    b: string,
    cardinals: [string, number][],
    adjacent = false,
    inversions: boolean[] = [],
): string {
    return `${subject(a)} находится ${formatDirectionRelationship(cardinals, adjacent, inversions)} от ${subject(b)}`;
}

function formatHorizontal3D(
    cardinals: [string, number][],
    inversions: boolean[],
): string[] {
    return cardinals
        .filter(([direction, steps]) => direction !== "!" && steps !== 0)
        .map(([direction, steps], index) => {
            const isInverted = !!inversions[index];
            const shown = displayedCardinal(direction as CardinalDirection, isInverted);
            return `на ${steps} ${pluralRu(steps, "шаг", "шага", "шагов")} ${inverted(CARDINAL_COMPARATIVE[shown], isInverted)}`;
        });
}

function formatTransversal(
    difference: number,
    isSpatial: boolean,
    isInverted: boolean,
): string {
    const amount = Math.abs(difference);
    if (difference === 0) return isSpatial ? "на одном уровне" : "одновременно";

    const positive = difference > 0;
    const displayedPositive = isInverted ? !positive : positive;
    const unit = isSpatial
        ? pluralRu(amount, "уровень", "уровня", "уровней")
        : pluralRu(amount, "час", "часа", "часов");
    const direction = isSpatial
        ? (displayedPositive ? "выше" : "ниже")
        : (displayedPositive ? "позже" : "раньше");
    return `на ${amount} ${unit} ${inverted(direction, isInverted)}`;
}

export interface Direction3DInversions {
    transversal?: boolean;
    cardinals?: boolean[];
}

export function formatDirection3DProposition(
    a: string,
    b: string,
    isSpatial: boolean,
    transversalDifference: number,
    cardinals: [string, number][],
    inversions: Direction3DInversions = {},
): string {
    const A = subject(a);
    const B = subject(b);
    const horizontal = formatHorizontal3D(cardinals, inversions.cardinals || []);
    const transversal = formatTransversal(transversalDifference, isSpatial, !!inversions.transversal);

    if (!horizontal.length) {
        if (isSpatial && transversalDifference === 0) {
            return `${A} на одном уровне и в той же точке, что ${B}`;
        }
        if (isSpatial && Math.abs(transversalDifference) === 1) {
            const above = transversalDifference > 0;
            const displayedAbove = inversions.transversal ? !above : above;
            return `${A} прямо ${inverted(displayedAbove ? "над" : "под", !!inversions.transversal)} ${B}`;
        }
        if (!isSpatial && transversalDifference === 0) {
            return `${A} одновременно с ${B}`;
        }
        return `${A} ${transversal} ${B}`;
    }

    if (!isSpatial && transversalDifference === 0) {
        return `${A} одновременно с ${B}, но ${joinRu(horizontal)}`;
    }

    const parts = [transversal, ...horizontal];
    const relation = parts.length > 2
        ? `${parts[0]}, ${joinRu(parts.slice(1))}`
        : parts.join(" и ");
    return `${A} ${relation} ${B}`;
}

export type GraphArrow = "↔" | "→" | "←";

export const GRAPH_ARROW_OPPOSITES: Readonly<Partial<Record<GraphArrow, GraphArrow>>> = {
    "→": "←",
    "←": "→",
};

const GRAPH_RELATIONS: Readonly<Record<GraphArrow, string>> = {
    "→": "ведёт к",
    "←": "идёт от",
    "↔": "связан с",
};

export function formatGraphEdge(a: string, arrow: GraphArrow, b: string, isInverted = false): string {
    const displayedArrow = isInverted ? (GRAPH_ARROW_OPPOSITES[arrow] || arrow) : arrow;
    const relationship = inverted(GRAPH_RELATIONS[displayedArrow], isInverted && displayedArrow !== arrow);
    return `${subject(a)} ${relationship} ${subject(b)}`;
}

export function formatGraphMeta(a: string, b: string, c: string, d: string, reverseSecondPair = false): string {
    const [secondA, secondB] = reverseSecondPair ? [d, c] : [c, d];
    return `Отношение ${subject(a)} к ${subject(b)} такое же, как отношение ${subject(secondA)} к ${subject(secondB)}`;
}

export function formatAnalogyConclusion(
    a: string,
    b: string,
    c: string,
    d: string,
    isSame: boolean,
    isInverted = false,
): string {
    const displayedSame = isInverted ? !isSame : isSame;
    const css = `analogy-conclusion${isInverted ? " is-negated" : ""}`;
    const middle = displayedSame ? "такое же, как отношение" : "отличается от отношения";
    return `Отношение ${subject(a)} к ${subject(b)}<div class="${css}">${middle}</div>${subject(c)} к ${subject(d)}`;
}

export function formatBinaryConclusion(operator: BinaryOperator, a: string, b: string): string {
    const connector = (text: string) => `<div class="is-connector">${text}</div>`;
    switch (operator) {
        case "and":
            return `${connector("Верны оба:")}${a}${connector("и")}${b}`;
        case "nand":
            return `${connector("Не оба верны:")}${a}${connector("и")}${b}`;
        case "or":
            return `${connector("Верно")}${a}${connector("или")}${b}${connector("возможно оба")}`;
        case "nor":
            return `${connector("Неверны оба:")}${a}${connector("и")}${b}`;
        case "xor":
            return `${connector("Верно только одно:")}${a}${connector("или")}${b}`;
        case "xnor":
            return `${a}${connector("и")}${b}${connector("либо оба верны, либо оба неверны")}`;
        default:
            throw new Error(`Неизвестная логическая связка: ${operator}`);
    }
}

export function evaluateBinaryExpression(expression: string, a: boolean, b: boolean): boolean {
    return Boolean(eval(
        expression
            .replaceAll("a", String(a))
            .replaceAll("b", String(b))
    ));
}
