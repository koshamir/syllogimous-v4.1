// v5 layer constants: family ↔ question type mapping, localStorage keys, settings, Russian labels.

import { Answer, BinaryOp, FamilyId, LureType, NameMode, NamePool, StrategyTipId } from '../engine';
import { EnumQuestionType } from './question.constants';

export const LS_V5_SETTINGS = 'SYL_V5_SETTINGS';
export const LS_V5_LEVELS = 'SYL_V5_LEVELS';
/** v5.1: levels are premise counts (new keys; the old ones are only read for migration). */
export const LS_V5_PREMISES = 'SYL_V5_PREMISES';
export const LS_V5_PREMISE_HISTORY = 'SYL_V5_PREMISE_HISTORY';
export const LS_V5_SCHEDULER = 'SYL_V5_SCHEDULER';
export const LS_V5_LEVEL_HISTORY = 'SYL_V5_LEVEL_HISTORY';
export const LS_V5_PG_SETTINGS = 'SYL_V5_PG_SETTINGS';
export const LS_V5_CLEANUP_DONE = 'SYL_V5_CLEANUP_DONE';

export const FAMILY_TYPE: Record<FamilyId, EnumQuestionType> = {
    groups: EnumQuestionType.Distinction,
    orderNum: EnumQuestionType.ComparisonNumerical,
    orderTime: EnumQuestionType.ComparisonChronological,
    syllogism: EnumQuestionType.Syllogism,
    linear: EnumQuestionType.LinearArrangement,
    circular: EnumQuestionType.CircularArrangement,
    dir2d: EnumQuestionType.Direction,
    dir3dSpace: EnumQuestionType.Direction3DSpatial,
    dir3dTime: EnumQuestionType.Direction3DTemporal,
    graph: EnumQuestionType.GraphMatching,
    analogy: EnumQuestionType.Analogy,
    binary: EnumQuestionType.Binary,
    groups3: EnumQuestionType.Groups3,
    conditional: EnumQuestionType.Conditional,
    hierarchy: EnumQuestionType.Hierarchy,
    perspective: EnumQuestionType.Perspective,
};

export const TYPE_FAMILY = Object.fromEntries(Object.entries(FAMILY_TYPE).map(([f, t]) => [t, f])) as Record<EnumQuestionType, FamilyId>;

export type ExplanationMode = 'always' | 'errors' | 'never';

export interface V5Settings {
    /** «3 варианта» (ternary) or «2 варианта» (binary). */
    format: 'ternary' | 'binary';
    /** Target accuracy for three options (0.70–0.85). */
    targetAccuracy: number;
    /** Staircase step: 0.25 = four correct answers in a row add one premise. */
    step: 0.125 | 0.25 | 0.5;
    /** The number of premises follows the answers (true) or stays where the user put it (false). */
    auto: boolean;
    /** Settings layout version (2 = v5.1). */
    v?: number;
    explanation: ExplanationMode;
    namePool: NamePool;
    negations: boolean;
    metas: boolean;
    nameMode: NameMode;
}

export const DEFAULT_V5_SETTINGS: V5Settings = {
    format: 'ternary',
    targetAccuracy: 0.75,
    step: 0.25,
    auto: true,
    v: 2,
    explanation: 'errors',
    namePool: 'latin',
    negations: true,
    metas: true,
    nameMode: 'byLevel',
};

export interface PlaygroundV5 {
    families: Partial<Record<FamilyId, { enabled: boolean; level: number }>>;
    ops: Record<BinaryOp, boolean>;
    negations: boolean;
    metas: boolean;
    format: 'ternary' | 'binary';
}

export const ANSWER_LABELS: Record<Answer, string> = {
    entailed: 'Следует',
    contradicted: 'Противоречит',
    undetermined: 'Неизвестно',
};

export const LURE_LABELS: Record<LureType, string> = {
    none: 'Без ловушки',
    reversal: 'Перепутано направление',
    possible: 'Верно лишь в одном из миров',
    nearMiss: 'Не та величина',
    surface: 'Слова рядом в посылке',
};

export const NAME_POOL_LABELS: Record<NamePool, string> = {
    latin: 'Латинские три буквы (WCA)',
    cyrillic: 'Кириллические слоги (ВОЛ)',
    words: 'Слова',
    emoji: 'Эмодзи',
};

export const BINARY_OP_LABELS: Record<BinaryOp, string> = {
    and: 'И',
    nand: 'НЕ-И',
    or: 'ИЛИ',
    nor: 'НЕ-ИЛИ',
    xor: 'ИСКЛЮЧАЮЩЕЕ ИЛИ',
    xnor: 'РАВНОЗНАЧНО',
};

export interface StrategyCard { id: StrategyTipId; title: string; text: string }

/** Appendix A. */
export const STRATEGY_CARDS: StrategyCard[] = [
    { id: 1, title: 'Одна модель', text: 'Собери все посылки в одну картину — ряд, карту, группы, — а не держи их как отдельные факты.' },
    { id: 2, title: 'Начни с самой связующей посылки', text: 'Начинай с посылки, которая связывает больше участников или сразу троих.' },
    { id: 3, title: 'Ищи контрпример', text: 'Прежде чем ответить «Следует», попробуй построить мир, где вывод неверен.' },
    { id: 4, title: '«Неизвестно» — полноценный ответ', text: 'Отвечай «Неизвестно», если нашёл два мира, где ответ разный.' },
    { id: 5, title: 'Каждая посылка нужна', text: 'Лишних посылок нет: пройди цепочку от одного слова вывода до другого и убедись, что она не рвётся и не поворачивает.' },
    { id: 6, title: 'Отпусти прошлое задание', text: 'Имена повторяются в новых ролях: не переноси старые связи.' },
    { id: 7, title: 'Красное слово — сразу перекодируй', text: 'Прежде чем строить модель, замени красное слово на противоположное.' },
];

/** Hints by lure type (Appendix A). */
export const LURE_TIPS: Partial<Record<LureType, string>> = {
    reversal: 'Проговори направление: кто левее, кто больше.',
    nearMiss: 'Отношение верное, проверь величину.',
};
