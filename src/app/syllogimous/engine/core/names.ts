// Entity names (spec §4.7). Default pool: Cyrillic CVC pseudo-words (a rule, not a familiar word).

import { NOUNS, getEmojis, getStrings } from '../../constants/question.constants';
import { NAME_BLOCKED_SUBSTRINGS, NAME_BLOCKLIST } from './names.blocklist';
import { Rng } from './rng';
import { NameMode, NamePool } from './types';

export const CONSONANTS = 'БВГДЖЗКЛМНПРСТФХЦЧШ';
export const VOWELS = 'АЕИОУЫЭЮЯ';

/** Consonant+vowel pairs that violate Russian spelling rules. */
const BAD_BIGRAMS = new Set(['ЖЫ', 'ШЫ', 'ЧЯ', 'ЩЯ', 'ЧЮ', 'ЖЯ', 'ШЯ', 'ЖЮ', 'ШЮ', 'ГЫ', 'КЫ', 'ХЫ', 'ЦЮ', 'ЦЯ', 'ЧЫ', 'ЩЫ']);

let cyrillicPool: string[] | null = null;

export function isAllowedPseudoWord(w: string): boolean {
    if (w.length !== 3) return false;
    if (!CONSONANTS.includes(w[0]) || !VOWELS.includes(w[1]) || !CONSONANTS.includes(w[2])) return false;
    if (BAD_BIGRAMS.has(w.slice(0, 2))) return false;
    if (NAME_BLOCKLIST.has(w)) return false;
    return !NAME_BLOCKED_SUBSTRINGS.some(s => w.includes(s));
}

export function getCyrillicPool(): readonly string[] {
    if (!cyrillicPool) {
        const out: string[] = [];
        for (const c1 of CONSONANTS) for (const v of VOWELS) for (const c2 of CONSONANTS) {
            const w = c1 + v + c2;
            if (isAllowedPseudoWord(w)) out.push(w);
        }
        cyrillicPool = out;
    }
    return cyrillicPool;
}

export function poolFor(pool: NamePool): readonly string[] {
    switch (pool) {
        case 'latin': return getStrings();
        case 'words': return NOUNS;
        case 'emoji': return getEmojis();
        default: return getCyrillicPool();
    }
}

/** Two names are "confusable": same first letter or exactly one differing letter (same length). */
export function confusable(a: string, b: string): boolean {
    if (a === b) return false;
    if (a[0] === b[0]) return true;
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
    return d === 1;
}

export interface NameRequest {
    n: number;
    pool: NamePool;
    mode: NameMode;
    /** Probability that the item contains confusable pairs (ladder `confusableNames`). */
    pConfusable: number;
    /** Probability that 1–2 names are carried over from the previous item (ladder `carryOverNames`). */
    pCarryOver: number;
    prevNames?: readonly string[];
    /** Names that must not be used. */
    exclude?: readonly string[];
}

export interface NameResult { names: string[]; confusable: boolean; carriedOver: number }

const firstLetter = (w: string) => w[0];

/**
 * Picks n names. Default: distinct first letters (Cyrillic pool). With probability pConfusable,
 * one or two confusable pairs are planted; with probability pCarryOver, 1–2 previous names reappear
 * (they take new roles because entity roles are independent of names).
 */
export function pickNames(rng: Rng, req: NameRequest): NameResult {
    const pool = poolFor(req.pool);
    const cyr = req.pool === 'cyrillic';
    const byLevel = req.mode === 'byLevel';
    const names: string[] = [];
    const used = new Set<string>(req.exclude ?? []);
    let carriedOver = 0;

    if (byLevel && req.prevNames && req.prevNames.length && rng.chance(req.pCarryOver)) {
        const k = Math.min(req.n, req.prevNames.length, 1 + rng.int(2));
        for (const w of rng.shuffle(req.prevNames.slice()).slice(0, k)) {
            if (!used.has(w) && !names.includes(w)) { names.push(w); used.add(w); carriedOver++; }
        }
    }

    const wantConfusable = byLevel && req.n >= 2 && rng.chance(req.pConfusable);
    let planted = false;
    if (wantConfusable) {
        const pairs = 1 + (req.n >= 5 ? rng.int(2) : 0);
        for (let k = 0; k < pairs && names.length + 2 <= req.n; k++) {
            for (let tries = 0; tries < 50; tries++) {
                const a = rng.pick(pool);
                if (used.has(a)) continue;
                const cands = pool.filter(b => !used.has(b) && b !== a && confusable(a, b));
                if (!cands.length) continue;
                const b = rng.pick(cands);
                names.push(a, b);
                used.add(a); used.add(b);
                planted = true;
                break;
            }
        }
    }

    const letters = new Set(names.map(firstLetter));
    let guard = 0;
    while (names.length < req.n) {
        const w = rng.pick(pool);
        guard++;
        if (used.has(w)) continue;
        // distinct first letters (and therefore no Е/Э, И/Ы-only pairs) unless we ran out of letters
        if (cyr && guard < 5000 && letters.has(firstLetter(w))) continue;
        if (!cyr && guard < 5000 && names.some(x => confusable(x, w)) && req.pool !== 'emoji') continue;
        names.push(w);
        used.add(w);
        letters.add(firstLetter(w));
    }
    return { names: rng.shuffle(names), confusable: planted, carriedOver };
}
