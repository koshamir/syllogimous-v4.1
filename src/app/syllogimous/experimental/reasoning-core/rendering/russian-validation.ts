import { RUSSIAN_UI_ASCII_ALLOWLIST } from "./ru-catalog";

export interface UnexpectedEnglishToken {
    token: string;
    index: number;
}

/**
 * Runtime guard for newly generated copy. Developer strings are not passed to
 * this function. Intentional abbreviations/proper names use the reviewed list.
 */
export function findUnexpectedEnglishTokens(
    text: string,
    additionalAllowlist: ReadonlySet<string> = new Set(),
): UnexpectedEnglishToken[] {
    const unexpected: UnexpectedEnglishToken[] = [];
    const pattern = /[A-Za-z][A-Za-z0-9-]*/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
        const token = match[0];
        if (!RUSSIAN_UI_ASCII_ALLOWLIST.has(token) && !additionalAllowlist.has(token)) {
            unexpected.push({ token, index: match.index });
        }
    }
    return unexpected;
}

export function assertRussianUserFacingText(texts: readonly string[], additionalAllowlist?: ReadonlySet<string>): void {
    const failures = texts.flatMap(text => findUnexpectedEnglishTokens(text, additionalAllowlist).map(failure => ({ text, ...failure })));
    if (failures.length) {
        const first = failures[0];
        throw new Error(`Найден непреднамеренный английский фрагмент «${first.token}» в тексте: ${first.text}`);
    }
}
