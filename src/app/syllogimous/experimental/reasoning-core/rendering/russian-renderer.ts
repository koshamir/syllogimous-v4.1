import {
    CategoricalQuantifier,
    EntitySpec,
    IntervalRelation,
    OrderRelation,
    PremiseNode,
    QueryNode,
    RationalRelation,
    TransformOperator,
} from "../models/semantic.models";

function labels(entities: readonly EntitySpec[]): ReadonlyMap<string, string> {
    return new Map(entities.map(entity => [entity.id, entity.label]));
}

function label(id: string, entityLabels: ReadonlyMap<string, string>): string {
    return entityLabels.get(id) ?? id;
}

function categoricalText(
    quantifier: CategoricalQuantifier,
    subject: string,
    predicate: string,
    entityLabels: ReadonlyMap<string, string>,
): string {
    const left = label(subject, entityLabels);
    const right = label(predicate, entityLabels);
    switch (quantifier) {
        case "all": return `Каждый объект класса «${left}» относится к классу «${right}».`;
        case "no": return `Ни один объект класса «${left}» не относится к классу «${right}».`;
        case "some": return `Хотя бы один объект класса «${left}» относится к классу «${right}».`;
        case "someNot": return `Хотя бы один объект класса «${left}» не относится к классу «${right}».`;
    }
}

const ORDER_TEXT: Readonly<Record<OrderRelation, string>> = {
    strictLess: "строго раньше",
    lessOrEqual: "не позже",
    equal: "на той же позиции, что",
    between: "находится между",
    leftOf: "находится левее",
    rightOf: "находится правее",
    adjacent: "находится рядом с",
    exactDisplacement: "смещён относительно",
    cyclicClockwise: "следует по часовой стрелке за",
};

const INTERVAL_TEXT: Readonly<Record<IntervalRelation, string>> = {
    before: "заканчивается до начала",
    after: "начинается после окончания",
    overlaps: "частично перекрывается с",
    during: "целиком находится внутри",
    starts: "начинается одновременно с",
    finishes: "заканчивается одновременно с",
    equals: "совпадает с",
};

const RATIONAL_TEXT: Readonly<Record<RationalRelation, string>> = {
    ratioEqual: "равно",
    ratioLess: "меньше",
    ratioGreater: "больше",
    scaledBy: "изменяется с коэффициентом",
};

const TRANSFORM_TEXT: Readonly<Record<TransformOperator, string>> = {
    rotate90: "повернуть на 90° по часовой стрелке",
    rotate180: "повернуть на 180°",
    rotate270: "повернуть на 270° по часовой стрелке",
    reflectHorizontal: "отразить относительно горизонтальной оси",
    reflectVertical: "отразить относительно вертикальной оси",
};

function ratio(value: { numerator: number; denominator: number }): string {
    return value.denominator === 1 ? `${value.numerator}` : `${value.numerator}/${value.denominator}`;
}

function withoutFinalPeriod(value: string): string {
    return value.endsWith(".") ? value.slice(0, -1) : value;
}

type ScopedRenderable =
    | Extract<PremiseNode, { kind: "scopedRelation" }>
    | Extract<QueryNode, { kind: "scopedRelation" }>;

function scopedRelationText(
    statement: ScopedRenderable,
    entityLabels: ReadonlyMap<string, string>,
): string {
    const subjectClass = label(statement.subjectClass, entityLabels);
    const objectClass = label(statement.objectClass, entityLabels);
    const relation = statement.relation === "reads" ? "читает" : statement.relation === "sees" ? "видит"
        : statement.relation === "signalsTo" ? "передаёт сигнал" : "предшествует";
    const direction = `отношением «${relation}» от элемента класса «${subjectClass}» к элементу класса «${objectClass}»`;
    const subjectOuter = statement.quantifierOrder[0] === statement.subjectBindingId;
    if (statement.subjectQuantifier === "every" && statement.objectQuantifier === "every") {
        return `каждая пара из элемента класса «${subjectClass}» и элемента класса «${objectClass}» связана ${direction}`;
    }
    if (statement.subjectQuantifier === "some" && statement.objectQuantifier === "some") {
        return `существует пара из хотя бы одного элемента класса «${subjectClass}» и хотя бы одного элемента класса «${objectClass}», связанная ${direction}`;
    }
    if (statement.subjectQuantifier === "every") return subjectOuter
        ? `для каждого элемента класса «${subjectClass}» найдётся хотя бы один элемент класса «${objectClass}», связанный с ним ${direction}; второй элемент может зависеть от первого`
        : `существует хотя бы один общий элемент класса «${objectClass}», с которым каждый элемент класса «${subjectClass}» связан ${direction}`;
    return subjectOuter
        ? `существует хотя бы один общий элемент класса «${subjectClass}», связанный с каждым элементом класса «${objectClass}» ${direction}`
        : `для каждого элемента класса «${objectClass}» найдётся хотя бы один элемент класса «${subjectClass}», связанный с ним ${direction}; первый элемент может зависеть от второго`;
}

export function renderPremiseRu(premise: PremiseNode, entities: readonly EntitySpec[]): string {
    const entityLabels = labels(entities);
    switch (premise.kind) {
        case "categorical": return categoricalText(premise.quantifier, premise.subject, premise.predicate, entityLabels);
        case "order": {
            if (premise.relation === "between") {
                return `Позиция объекта «${label(premise.args[0], entityLabels)}» строго между позициями объектов «${label(premise.args[1], entityLabels)}» и «${label(premise.args[2], entityLabels)}».`;
            }
            if (premise.relation === "exactDisplacement") {
                const offset = premise.displacement ?? 0;
                return offset === 0
                    ? `Объекты «${label(premise.args[0], entityLabels)}» и «${label(premise.args[1], entityLabels)}» занимают одну позицию.`
                    : `Объект «${label(premise.args[0], entityLabels)}» находится ровно на ${Math.abs(offset)} поз. ${offset > 0 ? "правее" : "левее"} объекта «${label(premise.args[1], entityLabels)}».`;
            }
            if (premise.relation === "cyclicClockwise") return `От объекта «${label(premise.args[1], entityLabels)}» до объекта «${label(premise.args[0], entityLabels)}» по часовой стрелке ровно ${premise.displacement ?? 1} шагов.`;
            return `${label(premise.args[0], entityLabels)} ${ORDER_TEXT[premise.relation]} ${label(premise.args[1], entityLabels)}.`;
        }
        case "containment": {
            const relation = premise.relation === "memberOf" ? "принадлежит классу" : premise.relation === "includedIn" ? "входит в класс" : "не принадлежит классу";
            return `${label(premise.subject, entityLabels)} ${relation} «${label(premise.classId, entityLabels)}».`;
        }
        case "conditional": {
            const condition = withoutFinalPeriod(renderPremiseRu(premise.if, entities));
            const consequence = withoutFinalPeriod(renderPremiseRu(premise.then, entities));
            const exceptions = premise.exceptEntityIds.length
                ? ` Правило не применяется к: ${premise.exceptEntityIds.map(value => label(value, entityLabels)).join(", ")}.`
                : "";
            return `Если ${condition}, то ${consequence}.${exceptions}`;
        }
        case "interval": {
            const left = `интервала «${label(premise.left, entityLabels)}»`;
            const right = `интервала «${label(premise.right, entityLabels)}»`;
            switch (premise.relation) {
                case "before": return `Конец ${left} строго раньше начала ${right}.`;
                case "after": return `Начало ${left} строго позже конца ${right}.`;
                case "overlaps": return `Начало ${left} раньше начала ${right}, а его конец — после начала, но до конца ${right}.`;
                case "during": return `Начало ${left} строго позже начала ${right}, а конец — строго раньше конца ${right}.`;
                case "starts": return `Начала ${left} и ${right} совпадают; конец ${left} строго раньше конца ${right}.`;
                case "finishes": return `Концы ${left} и ${right} совпадают; начало ${left} строго позже начала ${right}.`;
                case "equals": return `Начала и концы ${left} и ${right} совпадают.`;
            }
        }
        case "rational": return premise.relation === "scaledBy"
            ? `Величина ${ratio(premise.left)} после умножения на коэффициент ${ratio(premise.right)} равна ${premise.result ? ratio(premise.result) : "не задано"}${premise.units ? ` (${premise.units})` : ""}.`
            : `Отношение ${ratio(premise.left)} ${RATIONAL_TEXT[premise.relation]} ${ratio(premise.right)}${premise.units ? ` (${premise.units})` : ""}.`;
        case "graphEdge": return `В структуре «${premise.graphId === "source" ? "источник" : "цель"}» отношение «${premise.relationLabel}» задано для упорядоченной пары (${label(premise.from, entityLabels)}; ${label(premise.to, entityLabels)}).`;
        case "mappingPair": return `Роль ${label(premise.source, entityLabels)} соответствует роли ${label(premise.target, entityLabels)}.`;
        case "transformation": return `Шаг ${premise.order}: ${TRANSFORM_TEXT[premise.operator]}.`;
        case "scopedRelation": {
            const context = label(premise.contextId, entityLabels);
            return `В контексте «${context}»: ${scopedRelationText(premise, entityLabels)}.`;
        }
        case "booleanConstraint": {
            const [left, right] = premise.propositionIds;
            const relation = premise.operator === "exactlyOne" ? "истинно ровно одно" : premise.operator === "atLeastOne" ? "истинно хотя бы одно" : premise.operator === "notBoth" ? "не могут быть истинны вместе" : "имеют одинаковое значение";
            return `Для P=${left} и Q=${right}: ${relation}.`;
        }
        case "propositionValue": return `Высказывание ${premise.propositionId} ${premise.value ? "истинно" : "ложно"}.`;
        case "bridge": {
            const bridge = premise.bridgeType === "membershipSelectsOrder"
                ? "принадлежность выбирает применимое отношение порядка"
                : premise.bridgeType === "temporalSelectsTransformation"
                    ? "временной контекст выбирает преобразование"
                    : "соответствие ролей выбирает сравниваемую величину";
            return `Связующее правило: ${bridge} (${label(premise.fromEntity, entityLabels)} → ${label(premise.toEntity, entityLabels)}).`;
        }
    }
}

export function renderQueryRu(query: QueryNode, entities: readonly EntitySpec[]): string {
    const entityLabels = labels(entities);
    if (query.kind === "logicalNot") return `Неверно, что ${renderAtomicQueryRu(query.operand, entityLabels)}`;
    if (query.kind === "boolean") {
        const connector = query.operator === "and" ? "И" : query.operator === "or" ? "ИЛИ" : "РОВНО ОДНО ИЗ";
        return `${renderAtomicQueryRu(query.operands[0], entityLabels)} ${connector} ${renderAtomicQueryRu(query.operands[1], entityLabels)}`;
    }
    return renderAtomicQueryRu(query, entityLabels);
}

function renderAtomicQueryRu(query: Exclude<QueryNode, { kind: "logicalNot" | "boolean" }>, entityLabels: ReadonlyMap<string, string>): string {
    switch (query.kind) {
        case "categorical": return categoricalText(query.quantifier, query.subject, query.predicate, entityLabels);
        case "order": return renderPremiseRu({ ...query, id: "query" }, [...entityLabels].map(([id, value]) => ({ id, label: value, sort: "object" }))) ;
        case "containment": return renderPremiseRu({ ...query, id: "query" }, [...entityLabels].map(([id, value]) => ({ id, label: value, sort: "object" })));
        case "interval": return renderPremiseRu({ ...query, id: "query" }, [...entityLabels].map(([id, value]) => ({ id, label: value, sort: "interval" })));
        case "rational": return query.relation === "scaledBy"
            ? `Величина ${ratio(query.left)} после умножения на коэффициент ${ratio(query.right)} равна ${query.result ? ratio(query.result) : "не задано"}${query.units ? ` (${query.units})` : ""}.`
            : `Отношение ${ratio(query.left)} ${RATIONAL_TEXT[query.relation]} ${ratio(query.right)}${query.units ? ` (${query.units})` : ""}.`;
        case "proposition": return `Высказывание ${query.propositionId} истинно.`;
        case "scopedRelation": {
            const context = label(query.contextId, entityLabels);
            return `В контексте «${context}»: ${scopedRelationText(query, entityLabels)}.`;
        }
        case "transformationResult": return `После указанных преобразований точка (${query.initialPoint.join("; ")}) окажется в точке (${query.expectedPoint.join("; ")}).`;
        case "graphIsomorphism": return `Структуры допускают ${query.mappingContract === "bijection" ? "взаимно-однозначное соответствие" : "разрешённое отображение"}, сохраняющее связи.`;
        case "mappingValidity": return `Предложенное соответствие ролей сохраняет требуемую структуру.`;
    }
}
