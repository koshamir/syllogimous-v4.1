import { DomainSpec, ReasoningItem } from "../reasoning-core/models/semantic.models";
import { renderQueryRu } from "../reasoning-core/rendering/russian-renderer";

/** Never renders answer-bearing ResponseSpec fields into the learner prompt. */
export function renderLearnerQueryRu(item: ReasoningItem): string {
    if (item.responseSpec.kind === "identifyMissingRelation") {
        if (item.family === "analogy") {
            return "В целевой структуре пропущена одна связь. Выберите метку, которая сохраняет направления и соответствие ролей исходной структуры.";
        }
        if (item.query.kind === "categorical") {
            const query = item.query;
            const subject = item.entities.find(entity => entity.id === query.subject)?.label ?? "первым классом";
            const predicate = item.entities.find(entity => entity.id === query.predicate)?.label ?? "вторым классом";
            return `Какой квантор должен связывать классы «${subject}» и «${predicate}»?`;
        }
        return "Выберите связь, которая завершает структуру и сохраняет указанный порядок ролей.";
    }
    return renderQueryRu(item.query, item.entities);
}

/** Public domain conventions are not answer keys and must accompany every format. */
export function learnerInstructionsRu(item: ReasoningItem): string[] {
    const label = (id: string) => item.entities.find(entity => entity.id === id)?.label ?? id;
    const domainRules = (domain: DomainSpec): string[] => {
        switch (domain.kind) {
            case "categoricalUnary": return [domain.existentialImport === "allNamedClassesNonempty" ? "В этом категориальном задании каждый названный класс содержит хотя бы один объект. Область объектов не ограничена небольшим конечным миром." : "В этом категориальном задании классы могут быть пустыми; область объектов непуста и не ограничена небольшим конечным миром.", "«Все» не означает «существует». Отрицание «все» — «хотя бы один не», а не «ни один»."];
            case "boundedMembership": return [`Мир содержит только перечисленные объекты: ${domain.objectIds.map(label).join(", ")}. Перечисленные классы: ${domain.classIds.map(label).join(", ")}. Классы могут быть пустыми, если посылки не требуют иного.`, "Включение классов распространяет принадлежность объектов. Исключение в условном правиле означает, что правило не применяется к указанному объекту; другие посылки не отменяются."];
            case "boundedPositions": return [`Допустимы только целые позиции от 0 до ${domain.size - 1}. ${domain.allowCoincidence ? "Объекты могут занимать одну позицию." : "Разные объекты должны занимать разные позиции."} ${domain.cyclic ? "Позиции расположены по кругу; шаги считаются по часовой стрелке. Допустимые повороты не меняют отношений, отражения автоматически не разрешены." : "Позиции расположены на линии; меньшая позиция находится левее."}`, "Строго раньше: первая позиция меньше второй. Не позже: меньше или равна. Равенство — одна позиция. В отношении «между» первая роль находится строго между второй и третьей. Ответ проверяется во всех допустимых расположениях, а не по одному скрытому порядку."];
            case "boundedIntervals": return [`Все начало и конец интервалов — целые числа от ${domain.endpointMin} до ${domain.endpointMax}; начало строго меньше конца.`, "«До» означает, что конец первого строго раньше начала второго. Частичное перекрытие направлено: первый начинается раньше второго и заканчивается между началом и концом второго. «Внутри» требует строго внутренних границ. При общем начале первый заканчивается раньше; при общем конце первый начинается позже. Равенство означает совпадение обеих границ."];
            case "exactRationals": return [`Рассматриваются только указанные точные величины. ${domain.units ? `Единицы: ${domain.units}.` : "Отношения безразмерны."} Дроби сравниваются точно, без округления; знаменатель не может быть нулём.`];
            case "boundedContexts": return ["Контексты независимы, пока явно не указано связующее правило. Порядок ролей и внешний квантор важны: «для каждого найдётся свой» не означает «существует один общий для всех». Роль одного объекта может меняться между контекстами."];
            case "boundedGraph": return [`Узлы источника: ${item.entities.filter(entity => entity.features?.["frame"] === "source").map(entity => entity.label).join(", ")}. Узлы цели: ${item.entities.filter(entity => entity.features?.["frame"] === "target").map(entity => entity.label).join(", ")}. ${domain.directed ? "Связи направлены; порядок двух ролей менять нельзя." : "Связи ненаправленные."} ${domain.loopsAllowed ? "Петли разрешены." : "Петли запрещены."} Других узлов и связей нет.`, "Взаимно-однозначное соответствие должно сохранять все указанные направления и метки связей. Совпадение числа соседей само по себе не доказывает одинаковую структуру."];
            case "boundedStructuralMapping": return [`Источник: ${domain.sourceIds.map(label).join(", ")}; цель: ${domain.targetIds.map(label).join(", ")}. ${domain.mappingContract === "bijection" ? "Требуется взаимно-однозначное соответствие всех ролей." : domain.mappingContract === "injectiveHomomorphism" ? "Отображение сохраняет связи и сопоставляет разные роли разным ролям; охват всей цели не требуется." : "Отображение сохраняет связи; совпадение образов разных ролей разрешено."}`];
            case "boundedTransformations": return [`Сетка ${domain.width} × ${domain.height}; начало координат в левом верхнем углу. Горизонтальная координата растёт вправо, вертикальная — вниз. Повороты выполняются по часовой стрелке, в указанном порядке. Отражение относительно горизонтальной оси меняет верх и низ, относительно вертикальной — лево и право. Изменение порядка операций может изменить результат.`];
            case "composite": return domain.parts.flatMap(domainRules);
        }
    };
    return [...domainRules(item.domain), ...(item.presentation.instructionsRu ?? [])];
}
