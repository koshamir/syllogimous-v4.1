import { EnumQuestionType } from "../constants/question.constants";
import { Question } from "../models/question.models";

/**
 * Explicit compatibility boundary for the original rendered/Boolean game.
 * Experimental semantic items never pass through this adapter and legacy
 * answers are therefore not reinterpreted under new semantics.
 */
export class LegacyQuestionGeneratorAdapter {
    constructor(private readonly generators: Readonly<Record<EnumQuestionType, () => Question>>) {}

    generatorFor(type: EnumQuestionType): () => Question {
        const generator = this.generators[type];
        if (!generator) {
            throw new Error(`No legacy generator registered for ${type}`);
        }
        return generator;
    }
}
