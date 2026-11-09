// One place that knows how an item was answered — v5 records (userChoice vs correct) and v4.1 records
// (userAnswer vs isValid) alike. Every page and statistic goes through these helpers (spec §6.2).

import { ANSWER_LABELS } from "../constants/v5.constants";
import { Question } from "../models/question.models";

export const isV5 = (q: Question) => !!q.engineVersion;

/** true / false; undefined when the item was not answered (timeout or not yet answered). */
export function isCorrect(q: Question): boolean | undefined {
    if (isV5(q)) return q.userChoice === undefined ? undefined : q.userChoice === q.correct;
    return q.userAnswer === undefined ? undefined : q.userAnswer === q.isValid;
}

export function isTimeout(q: Question): boolean {
    return isV5(q) ? q.userChoice === undefined : q.userAnswer === undefined;
}

/** Answer → Russian words. */
export function responseLabel(q: Question, value: string | boolean | undefined): string {
    if (value === undefined) return "Время вышло";
    if (typeof value === "boolean") return value ? "Верно" : "Неверно";
    if (value === "true") return "Верно";
    if (value === "false") return "Неверно";
    if (value in ANSWER_LABELS) return ANSWER_LABELS[value as keyof typeof ANSWER_LABELS];
    const opt = q.options?.find(o => o.id === value);
    return opt ? opt.label.replace(/<[^>]+>/g, "") : value;
}

export function correctLabel(q: Question): string {
    return isV5(q) ? responseLabel(q, q.correct) : responseLabel(q, q.isValid);
}

export function userLabel(q: Question): string {
    return isV5(q) ? responseLabel(q, q.userChoice) : responseLabel(q, q.userAnswer);
}

/** Response time in ms (from showing the item to the answer). */
export const responseTime = (q: Question) => q.answeredAt - q.createdAt;
