// Phase 6: «Беглость» — answers by brute force over positions / sides, deadline rule, scoring, contextual blocks.

import { describe, expect, it } from 'vitest';
import { FLUENCY, generateFluencyBlock, isContextual, itemScore, nextDeadline } from './fluency';

describe('«Беглость»', () => {
    it('blocks: 30 items, families alternate, balanced answers, contextual every third block', () => {
        let t = 0;
        let n = 0;
        for (let b = 0; b < 30; b++) {
            const blk = generateFluencyBlock(b, 'seed');
            expect(blk.items.length).toBe(FLUENCY.blockSize);
            expect(blk.contextual).toBe(isContextual(b));
            expect(blk.contextual).toBe((b + 1) % 3 === 0);
            blk.items.forEach((it, i) => {
                if (i) expect(it.family).not.toBe(blk.items[i - 1].family);
                expect(it.premises.length).toBeGreaterThanOrEqual(2);
                expect(it.premises.length).toBeLessThanOrEqual(3);
                if (blk.contextual) expect(['normal', 'swapped']).toContain(it.frame); else expect(it.frame).toBeUndefined();
                t += it.answer ? 1 : 0;
                n++;
            });
            if (blk.contextual) expect(blk.legend.length).toBe(5);
        }
        expect(Math.abs(t / n - 0.5)).toBeLessThan(0.05);
    });

    it('deadline rule and its equilibrium (≈ 85 % correct)', () => {
        expect(nextDeadline(7, true)).toBeCloseTo(6.79);
        expect(nextDeadline(7, false)).toBeCloseTo(8.33);
        expect(nextDeadline(1.5, true)).toBe(1.5);
        expect(nextDeadline(15, false)).toBe(15);
        // equilibrium: p·ln 0.97 + (1 − p)·ln 1.19 = 0
        const p = Math.log(1.19) / (Math.log(1.19) - Math.log(0.97));
        expect(p).toBeGreaterThan(0.84);
        expect(p).toBeLessThan(0.86);
    });

    it('signed residual time', () => {
        expect(itemScore(true, 1, 4)).toBeCloseTo(0.75);
        expect(itemScore(false, 1, 4)).toBeCloseTo(-0.75);
        expect(itemScore(true, 5, 4)).toBe(0);
    });
});
