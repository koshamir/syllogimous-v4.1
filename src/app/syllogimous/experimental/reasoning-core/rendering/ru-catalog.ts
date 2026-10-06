import { InferenceClassification, ReasoningFamily, ResponseFormat } from "../models/semantic.models";

export const FAMILY_LABEL_RU: Readonly<Record<ReasoningFamily, string>> = {
    categorical: "Категориальные отношения",
    order: "Порядок и отношение «между»",
    hierarchy: "Иерархия и принадлежность",
    analogy: "Структурные аналогии",
    coupledFrames: "Связанные системы отношений",
    proportional: "Пропорциональные отношения",
    temporalIntervals: "Временные интервалы",
    contextScope: "Контекст и область действия",
    graphStructure: "Структура графа",
    transformations: "Порядок преобразований",
};

export const RESPONSE_FORMAT_LABEL_RU: Readonly<Record<ResponseFormat, string>> = {
    threeWayInference: "Определить статус вывода",
    constructSatisfyingModel: "Построить подходящую модель",
    constructCounterexample: "Построить контрпример",
    completeMapping: "Завершить соответствие ролей",
    identifyMissingRelation: "Указать недостающую связь",
    repairProof: "Исправить доказательство",
    identifyNecessaryPremise: "Найти необходимую посылку",
    updateAfterPremiseChange: "Обновить вывод после изменения посылки",
};

export const CLASSIFICATION_LABEL_RU: Readonly<Record<InferenceClassification, string>> = {
    entailed: "Следует",
    refuted: "Опровергнуто",
    underdetermined: "Недостаточно данных",
};

export const EXPERIMENTAL_UI_RU = {
    productName: "Экспериментальная тренировка отношений",
    shortName: "Экспериментальный режим",
    training: "Тренировка",
    assessment: "Независимая оценка",
    progress: "Ход обучения",
    settings: "Настройки исследования",
    data: "Данные и конфиденциальность",
    startTraining: "Начать тренировку",
    continueTraining: "Продолжить",
    pause: "Пауза",
    resume: "Продолжить",
    finish: "Завершить сессию",
    next: "Следующее задание",
    showDetails: "Показать подробности",
    hideDetails: "Скрыть подробности",
    premises: "Посылки",
    query: "Проверяемый вывод",
    answer: "Ответ",
    confidence: "Насколько вы уверены?",
    confidenceLow: "Не уверен(а)",
    confidenceMedium: "Скорее уверен(а)",
    confidenceHigh: "Уверен(а)",
    exportData: "Экспортировать данные",
    importData: "Импортировать данные",
    deleteData: "Удалить данные экспериментального режима",
    backToLegacy: "Вернуться в обычную игру",
    offlinePrivacy: "Данные сохраняются только на этом устройстве. Учётная запись и автоматическая отправка не нужны.",
    evidenceNote: "Режим тренирует конкретные способы работы с отношениями. Перенос на новые задачи проверяется отдельно; рост общего интеллекта или «нейронной мощности» не предполагается.",
    sessionNote: "Предлагаемая длительность — 25–35 минут, но её можно сократить. Это настраиваемая исследовательская эвристика, а не доказанный оптимум.",
    semanticsNonempty: "В этой учебной версии каждый названный класс содержит хотя бы один объект.",
    boundedWorld: "В этом задании рассматриваются только явно перечисленные объекты и позиции.",
    assessmentWarning: "Во время оценки подсказки и разбор ответов не показываются. Задания оригинальные и не имеют психометрических норм.",
} as const;

/** Intentional Latin tokens allowed in experimental user-facing validation. */
export const RUSSIAN_UI_ASCII_ALLOWLIST = new Set([
    "Syllogimous", "JSON", "RI", "Gf", "p50", "p95", "A", "B", "C", "D", "P", "Q", "ID",
]);

export const SEMANTIC_OPERATOR_LABEL_RU: Readonly<Record<string, string>> = {
    all: "все",
    no: "ни один",
    some: "некоторые",
    someNot: "некоторые не",
    strictLess: "строго раньше",
    lessOrEqual: "не позже",
    equal: "равно",
    between: "между",
    leftOf: "левее",
    rightOf: "правее",
    adjacent: "рядом",
    exactDisplacement: "точное смещение",
    cyclicClockwise: "по часовой стрелке",
    before: "до",
    after: "после",
    overlaps: "перекрывается",
    during: "внутри",
    starts: "одновременно начинается",
    finishes: "одновременно заканчивается",
    equals: "совпадает",
    ratioEqual: "равные отношения",
    ratioLess: "меньшее отношение",
    ratioGreater: "большее отношение",
    scaledBy: "масштабирование",
    "передаёт": "передаёт",
    "проверяет": "проверяет",
    "направляет": "направляет",
    "связь": "связь",
};

export function semanticOperatorLabelRu(operator: string): string {
    return SEMANTIC_OPERATOR_LABEL_RU[operator] ?? "неизвестная связь";
}
