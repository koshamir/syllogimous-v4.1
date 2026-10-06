export const REASONING_ITEM_SCHEMA_VERSION = 1;
export const GENERATOR_VERSION = "experimental-generator/1.1.0";
export const SOLVER_VERSION = "relational-oracle/1.1.0";
export const DEFAULT_SEMANTICS_VERSION = "ri-explicit-nonempty/1.0.0";
export const EMPTY_CLASS_SEMANTICS_VERSION = "ri-empty-classes/1.0.0";

export const SUPPORTED_SEMANTICS = {
    [DEFAULT_SEMANTICS_VERSION]: {
        existentialImport: "allNamedClassesNonempty" as const,
        explanationRu: "В категориальных заданиях каждый названный класс содержит хотя бы один объект. В конечных задачах действуют отдельно указанные условия домена.",
    },
    [EMPTY_CLASS_SEMANTICS_VERSION]: {
        existentialImport: "emptyClassesAllowed" as const,
        explanationRu: "В альтернативной категориальной семантике названный класс может быть пустым. В конечных задачах действуют отдельно указанные условия домена.",
    },
};
