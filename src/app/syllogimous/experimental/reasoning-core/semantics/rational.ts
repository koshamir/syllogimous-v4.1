import { RationalValue } from "../models/semantic.models";

function gcd(left: number, right: number): number {
    let a = Math.abs(left);
    let b = Math.abs(right);
    while (b !== 0) {
        [a, b] = [b, a % b];
    }
    return a || 1;
}

export function rational(numerator: number, denominator = 1): RationalValue {
    if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
        throw new Error("Exact rational values require safe integers");
    }
    if (denominator === 0) {
        throw new Error("A rational denominator cannot be zero");
    }
    const sign = denominator < 0 ? -1 : 1;
    const divisor = gcd(numerator, denominator);
    return {
        numerator: sign * numerator / divisor,
        denominator: Math.abs(denominator) / divisor,
    };
}

export function multiplyRational(left: RationalValue, right: RationalValue): RationalValue {
    const a = rational(left.numerator, left.denominator);
    const b = rational(right.numerator, right.denominator);
    // Cancel before multiplication; BigInt prevents intermediate rounding.
    const crossLeft = gcd(a.numerator, b.denominator);
    const crossRight = gcd(b.numerator, a.denominator);
    const numerator = BigInt(a.numerator / crossLeft) * BigInt(b.numerator / crossRight);
    const denominator = BigInt(a.denominator / crossRight) * BigInt(b.denominator / crossLeft);
    const bound = BigInt(Number.MAX_SAFE_INTEGER);
    if (numerator > bound || numerator < -bound || denominator > bound) {
        throw new Error("Exact rational result exceeds the safe integer storage contract");
    }
    return rational(Number(numerator), Number(denominator));
}

export function compareRational(left: RationalValue, right: RationalValue): -1 | 0 | 1 {
    const a = rational(left.numerator, left.denominator);
    const b = rational(right.numerator, right.denominator);
    const delta = BigInt(a.numerator) * BigInt(b.denominator) - BigInt(b.numerator) * BigInt(a.denominator);
    return delta < 0 ? -1 : delta > 0 ? 1 : 0;
}

export function rationalEquals(left: RationalValue, right: RationalValue): boolean {
    return compareRational(left, right) === 0;
}
