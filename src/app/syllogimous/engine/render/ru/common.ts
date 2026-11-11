// Shared Russian rendering helpers. Output is HTML compatible with the existing game styles
// (`.subject` for names, `.is-negated` for red inverted words).

export const subj = (name: string) => `<span class="subject">${name}</span>`;

export const inv = (text: string, inverted: boolean | undefined) =>
    inverted ? `<span class="is-negated">${text}</span>` : text;

export function pluralRu(n: number, one: string, few: string, many: string): string {
    const a = Math.abs(Math.trunc(n));
    const l2 = a % 100;
    const l1 = a % 10;
    if (l2 >= 11 && l2 <= 14) return many;
    if (l1 === 1) return one;
    if (l1 >= 2 && l1 <= 4) return few;
    return many;
}

/** Ordinals, masculine nominative: первый, второй… */
export const ORD_NOM = ['', 'первый', 'второй', 'третий', 'четвёртый', 'пятый', 'шестой', 'седьмой', 'восьмой', 'девятый', 'десятый'];
/** Ordinals, masculine instrumental: первым, вторым… */
export const ORD_INS = ['', 'первым', 'вторым', 'третьим', 'четвёртым', 'пятым', 'шестым', 'седьмым', 'восьмым', 'девятым', 'десятым'];

/** Russian collation for the alphabetical participant list. */
export const alphabetical = (names: readonly string[]) => names.slice().sort((a, b) => a.localeCompare(b, 'ru'));

export const listRu = (items: readonly string[]) =>
    items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} и ${items[items.length - 1]}`;

export const NOTE_INVERSION = 'Красное слово читай наоборот.';

export const LURE_NOTES = {
    possible: 'Это верно в одном из возможных миров, но не во всех.',
    reversal: 'Направление отношения перепутано.',
    nearMiss: 'Отношение то, но величина (шаг, расстояние) другая.',
    surface: 'Эти слова стояли рядом в посылке, но связь между ними другая.',
} as const;
