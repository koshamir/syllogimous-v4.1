import {
    AtomicQuery,
    CategoricalPremise,
    EntitySpec,
    ExistentialImportPolicy,
    InferenceClassification,
    SemanticCertificate,
} from "../reasoning-core/models/semantic.models";
import { classifyCategorical } from "../reasoning-core/solvers/categorical-solver";
import { renderPremiseRu, renderQueryRu } from "../reasoning-core/rendering/russian-renderer";

export interface CategoricalTutorialExample {
    id: string;
    titleRu: string;
    semanticsRu: string;
    entities: EntitySpec[];
    premises: CategoricalPremise[];
    query: Extract<AtomicQuery, { kind: "categorical" }>;
    policy: ExistentialImportPolicy;
    statedClassification: InferenceClassification;
    explanationRu: string;
}

export interface VerifiedTutorialExample {
    id: string;
    titleRu: string;
    semanticsRu: string;
    premiseTextsRu: string[];
    queryTextRu: string;
    classification: InferenceClassification;
    explanationRu: string;
    certificate: SemanticCertificate;
}

const ENTITIES: EntitySpec[] = [
    { id: "a", label: "исследователи", sort: "class" },
    { id: "b", label: "наблюдатели", sort: "class" },
    { id: "c", label: "аналитики", sort: "class" },
];

export const CATEGORICAL_TUTORIAL_EXAMPLES: readonly CategoricalTutorialExample[] = [
    {
        id: "tutorial-chain",
        titleRu: "Цепочка включений",
        semanticsRu: "Каждый названный класс содержит хотя бы один объект.",
        entities: ENTITIES,
        premises: [
            { kind: "categorical", id: "t1", quantifier: "all", subject: "a", predicate: "b" },
            { kind: "categorical", id: "t2", quantifier: "all", subject: "b", predicate: "c" },
        ],
        query: { kind: "categorical", quantifier: "all", subject: "a", predicate: "c" },
        policy: "allNamedClassesNonempty",
        statedClassification: "entailed",
        explanationRu: "Любой объект первого класса входит во второй, а затем и в третий; контрмодель невозможна.",
    },
    {
        id: "tutorial-empty-class",
        titleRu: "Почему политика существования важна",
        semanticsRu: "Названные классы могут быть пустыми; область предметов при этом не пуста.",
        entities: ENTITIES.slice(0, 2),
        premises: [
            { kind: "categorical", id: "t1", quantifier: "all", subject: "a", predicate: "b" },
        ],
        query: { kind: "categorical", quantifier: "some", subject: "a", predicate: "b" },
        policy: "emptyClassesAllowed",
        statedClassification: "underdetermined",
        explanationRu: "Общее включение не утверждает существование объекта первого класса. Возможны и пустой первый класс, и непустой.",
    },
    {
        id: "tutorial-same-structure-new-surface",
        titleRu: "Та же структура, другой материал",
        semanticsRu: "Каждый названный класс содержит хотя бы один объект.",
        entities: [
            { id: "a", label: "синие жетоны", sort: "class" },
            { id: "b", label: "круглые жетоны", sort: "class" },
            { id: "c", label: "крупные жетоны", sort: "class" },
        ],
        premises: [
            { kind: "categorical", id: "t1", quantifier: "all", subject: "a", predicate: "b" },
            { kind: "categorical", id: "t2", quantifier: "all", subject: "b", predicate: "c" },
        ],
        query: { kind: "categorical", quantifier: "all", subject: "a", predicate: "c" },
        policy: "allNamedClassesNonempty",
        statedClassification: "entailed",
        explanationRu: "Смена названий не меняет цепочку включений. Здесь работает тот же принцип, что в первом примере.",
    },
    {
        id: "tutorial-similar-surface-different-structure",
        titleRu: "Похожая формулировка, другая структура",
        semanticsRu: "Каждый названный класс содержит хотя бы один объект.",
        entities: ENTITIES,
        premises: [
            { kind: "categorical", id: "t1", quantifier: "all", subject: "a", predicate: "b" },
            { kind: "categorical", id: "t2", quantifier: "all", subject: "c", predicate: "b" },
        ],
        query: { kind: "categorical", quantifier: "all", subject: "a", predicate: "c" },
        policy: "allNamedClassesNonempty",
        statedClassification: "underdetermined",
        explanationRu: "Оба класса входят в общий третий класс, но их взаимное включение не задано. Перестановка ролей меняет смысл, хотя слова почти те же.",
    },
    {
        id: "tutorial-negation",
        titleRu: "Отрицание общего утверждения",
        semanticsRu: "Каждый названный класс содержит хотя бы один объект.",
        entities: ENTITIES.slice(0, 2),
        premises: [
            { kind: "categorical", id: "t1", quantifier: "someNot", subject: "a", predicate: "b" },
        ],
        query: { kind: "categorical", quantifier: "all", subject: "a", predicate: "b" },
        policy: "allNamedClassesNonempty",
        statedClassification: "refuted",
        explanationRu: "«Не все A относятся к B» означает существование A вне B. Это не то же самое, что «ни один A не относится к B».",
    },
];

export function verifyCategoricalTutorialExample(example: CategoricalTutorialExample): VerifiedTutorialExample {
    const domain = {
        kind: "categoricalUnary" as const,
        closure: "unrestrictedUnaryPredicates" as const,
        existentialImport: example.policy,
        namedClasses: example.entities.map(entity => entity.id),
    };
    const solved = classifyCategorical(example.premises, example.query, domain);
    if (!solved.certificate.premisesSatisfiable || solved.classification !== example.statedClassification) {
        throw new Error(`Учебный пример «${example.id}» не подтверждён категориальным решателем.`);
    }
    return {
        id: example.id,
        titleRu: example.titleRu,
        semanticsRu: example.semanticsRu,
        premiseTextsRu: example.premises.map(premise => renderPremiseRu(premise, example.entities)),
        queryTextRu: renderQueryRu(example.query, example.entities),
        classification: solved.classification,
        explanationRu: example.explanationRu,
        certificate: solved.certificate,
    };
}

export function verifiedCategoricalTutorialExamples(): VerifiedTutorialExample[] {
    return CATEGORICAL_TUTORIAL_EXAMPLES.map(verifyCategoricalTutorialExample);
}
