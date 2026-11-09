import { EnumArrangements, EnumQuestionType } from "../constants/question.constants";
import type { Answer, AnswerFormat, EngineVersion, Explanation, FamilyId, ItemMetrics, LureType } from "../engine";

export interface IArrangementRelationship {
    description: EnumArrangements;
    steps: number;
}

export class Question {
    instructions?: string[];
    notes?: string[];
    type: EnumQuestionType;
    /** Binary format (and v4.1 records): is the conclusion true? */
    isValid = false;
    premises: string[] = [];
    conclusion: string | string[] = "";
    createdAt = new Date().getTime();
    answeredAt = new Date().getTime();
    /** Binary format (and v4.1 records). */
    userAnswer?: boolean;
    negations = 0;
    metaRelations = 0;
    timerTypeOnAnswer = "0";
    userScore = 0;
    playgroundMode = false;

    // ------------------------------------------------------------------ v5 fields (absent in v4.1 history)
    engineVersion?: EngineVersion;
    family?: FamilyId;
    format?: AnswerFormat;
    /** Correct response: 'entailed' | 'contradicted' | 'undetermined' (ternary), 'true' | 'false' (binary), option id (choice). */
    correct?: string;
    /** The user's response in the same coding; undefined = timeout. */
    userChoice?: string;
    /** Answer class of the item (ternary: = correct). */
    answerClass?: Answer;
    level?: number;
    seed?: string;
    metrics?: ItemMetrics;
    lure?: LureType;
    explanation?: Explanation;
    options?: { id: string; label: string }[];
    /** «Сравнение графов»: iso / map. */
    subtype?: 'iso' | 'map';
    /** Staircase target p used for this item. */
    targetP?: number;

    constructor(type: EnumQuestionType) {
        this.type = type;
    }
}
