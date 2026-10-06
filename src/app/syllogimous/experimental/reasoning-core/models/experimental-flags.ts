export interface DisabledExperimentalModule {
    enabled: false;
    titleRu: string;
    reasonRu: string;
    completionGate: string[];
}

export const ADVANCED_EXPERIMENTAL_MODULES: Readonly<{
    causalModels: DisabledExperimentalModule;
    fictionalPerspectives: DisabledExperimentalModule;
}> = {
    causalModels: {
        enabled: false,
        titleRu: "Причинные модели",
        reasonRu: "Модуль не включён: ещё не реализована независимо проверенная семантика вмешательств и контрфактических миров.",
        completionGate: [
            "typed structural equations and exogenous assumptions",
            "distinct observation and intervention operators",
            "independent exhaustive oracle for every shipped bounded model",
            "counterfactual fixtures and Russian tutorial verification",
        ],
    },
    fictionalPerspectives: {
        enabled: false,
        titleRu: "Информационные перспективы",
        reasonRu: "Модуль не включён: требуется завершить проверку вложенных вымышленных информационных состояний и защиты от захвата переменных.",
        completionGate: [
            "typed fictional information-state contract",
            "bounded nested-context oracle",
            "variable-capture and accessibility fixtures",
            "Russian comprehension tutorial",
        ],
    },
};
