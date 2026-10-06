import {
    AtomicQuery,
    DomainSpec,
    RationalPremise,
    RationalValue,
} from "../models/semantic.models";

export type RationalAtom = RationalPremise | Extract<AtomicQuery, { kind: "rational" }>;

export type RationalSemanticErrorCode =
    | "nonIntegerComponent"
    | "unsafeIntegerComponent"
    | "zeroDenominator"
    | "missingResult"
    | "unitMismatch";

export type RationalEvaluationResult =
    | { ok: true; holds: boolean }
    | { ok: false; code: RationalSemanticErrorCode; message: string };

interface BigRational {
    numerator: bigint;
    denominator: bigint;
}

function toBigRational(value: RationalValue): BigRational | RationalEvaluationResult {
    if (!Number.isInteger(value.numerator) || !Number.isInteger(value.denominator)) {
        return {
            ok: false,
            code: "nonIntegerComponent",
            message: "Exact rational components must be integers",
        };
    }
    if (!Number.isSafeInteger(value.numerator) || !Number.isSafeInteger(value.denominator)) {
        return {
            ok: false,
            code: "unsafeIntegerComponent",
            message: "Exact rational components must be safe integers",
        };
    }
    if (value.denominator === 0) {
        return { ok: false, code: "zeroDenominator", message: "A rational denominator cannot be zero" };
    }
    const denominatorSign = value.denominator < 0 ? -1n : 1n;
    return {
        numerator: BigInt(value.numerator) * denominatorSign,
        denominator: BigInt(value.denominator) * denominatorSign,
    };
}

function isEvaluationError(
    value: BigRational | RationalEvaluationResult,
): value is RationalEvaluationResult {
    return "ok" in value;
}

function compareExact(left: BigRational, right: BigRational): -1 | 0 | 1 {
    const delta = left.numerator * right.denominator - right.numerator * left.denominator;
    return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

/**
 * Evaluates ground proportional constraints with bigint cross-products. The
 * public values remain the shared number-based contract, while the internal
 * comparison does not lose precision when cross-products exceed 2^53 - 1.
 * `scaledBy` has the explicit role equation left × right = result.
 */
export function evaluateRationalAtom(
    atom: RationalAtom,
    domain: Extract<DomainSpec, { kind: "exactRationals" }>,
): RationalEvaluationResult {
    if (atom.units !== domain.units) {
        return {
            ok: false,
            code: "unitMismatch",
            message: `The atom uses units '${atom.units}' but the domain declares '${domain.units}'`,
        };
    }
    const left = toBigRational(atom.left);
    if (isEvaluationError(left)) return left;
    const right = toBigRational(atom.right);
    if (isEvaluationError(right)) return right;

    switch (atom.relation) {
        case "ratioEqual":
            return { ok: true, holds: compareExact(left, right) === 0 };
        case "ratioLess":
            return { ok: true, holds: compareExact(left, right) < 0 };
        case "ratioGreater":
            return { ok: true, holds: compareExact(left, right) > 0 };
        case "scaledBy": {
            if (!atom.result) {
                return { ok: false, code: "missingResult", message: "scaledBy requires an exact result" };
            }
            const result = toBigRational(atom.result);
            if (isEvaluationError(result)) return result;
            return {
                ok: true,
                holds: left.numerator * right.numerator * result.denominator
                    === result.numerator * left.denominator * right.denominator,
            };
        }
    }
}
