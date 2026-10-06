export const EXPERIMENTAL_COPY_RU = {
    productName: "Экспериментальная тренировка отношений",
    overview: "Обзор",
    setup: "Начальная настройка",
    training: "Тренировка",
    assessment: "Независимая оценка",
    progress: "Ход обучения",
    settings: "Настройки",
    data: "Данные",
    back: "Обычная игра",
    evidence: "Исследования убедительнее подтверждают улучшение в отрабатываемых заданиях, чем устойчивый широкий перенос. Перенос от этого режима — экспериментальная гипотеза: крупные улучшения общей реляционной интеграции или флюидного интеллекта у здоровых взрослых не установлены. Успех в практике и результаты на новых структурах оцениваются раздельно; рост интеллекта или нейронных возможностей не обещается.",
    privacy: "Работа идёт без учётной записи. Данные сохраняются только на этом устройстве и никуда не отправляются автоматически.",
    offline: "После загрузки основные задания, проверка ответов и история доступны без сети.",
    trainedLearning: "Обучение на тренировочных заданиях",
    trainedLearningDescription: "Изменение точности на генераторах, которые встречались во время занятий.",
    structuralTransfer: "Структурный перенос",
    structuralTransferDescription: "Применение освоенного принципа к новому материалу, формату или устройству задачи.",
    generalIntegration: "Общая реляционная интеграция",
    generalIntegrationDescription: "Широкий вывод, для которого нужны надёжные независимые показатели, а не только успех в приложении.",
    fluidIntelligence: "Флюидный интеллект",
    fluidIntelligenceDescription: "Отдельный психометрический конструкт; этот режим не выдаёт баллы интеллекта и процентили.",
    startSetup: "Настроить тренировку",
    semanticsHeading: "Правило существования классов в категориальных заданиях",
    nonemptySemantics: "В категориальных заданиях каждый названный класс содержит хотя бы один объект",
    emptySemantics: "В категориальных заданиях названные классы могут быть пустыми",
    semanticsTutorial: "При первом варианте из «все A относятся к B» можно вывести существование A. При втором нельзя: общее утверждение может быть истинно для пустого A.",
    comprehension: "Я понимаю, что выбор правила может изменить статус вывода",
    saveAndStart: "Сохранить и начать",
    loading: "Подготавливаем проверенное задание…",
    premises: "Посылки",
    query: "Проверяемый вывод",
    answerPrompt: "Следует ли вывод из всех посылок?",
    entailed: "Следует",
    refuted: "Опровергнуто",
    unknown: "Недостаточно данных",
    entailedHint: "Посылки исключают любой контрпример.",
    refutedHint: "Посылки влекут логическое отрицание вывода.",
    unknownHint: "Есть допустимые модели как с выводом, так и с его отрицанием.",
    submit: "Ответить",
    next: "Следующее задание",
    pause: "Приостановить",
    resume: "Продолжить",
    finish: "Завершить сессию",
    retry: "Попробовать ещё раз",
    details: "Подробный разбор",
    confidence: "Уверенность в ответе",
    confidenceLow: "Низкая",
    confidenceMedium: "Средняя",
    confidenceHigh: "Высокая",
    assessmentNotice: "Во время блока правильность и разбор не показываются. Задания оригинальные, экспериментальные и не имеют психометрических норм.",
    baseline: "Исходная оценка",
    postTraining: "Оценка после обучения",
    delayed: "Отсроченная оценка",
    beginAssessment: "Начать защищённый блок",
    assessmentComplete: "Блок завершён",
    importData: "Импортировать JSON",
    exportData: "Экспортировать JSON",
    deleteData: "Удалить данные экспериментального режима",
} as const;

const INTENTIONAL_LATIN_TOKENS = new Set(["Syllogimous", "JSON", "A", "B", "RI", "Gf", "ID"]);

export function unintendedLatinTokens(text: string): string[] {
    const tokens = text.match(/[A-Za-z][A-Za-z0-9-]*/g) ?? [];
    return [...new Set(tokens.filter(token => !INTENTIONAL_LATIN_TOKENS.has(token)))];
}

export function collectCopyStrings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(collectCopyStrings);
    if (typeof value === "object" && value !== null) return Object.values(value).flatMap(collectCopyStrings);
    return [];
}
