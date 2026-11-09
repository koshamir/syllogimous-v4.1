// Public API of the Syllogimous v5 engine.
// Rules: pure TypeScript only — no Angular, DOM or localStorage imports anywhere under engine/.
// Determinism: an item is fully defined by (engineVersion, family, level, params, seed).

export * from './core/types';
export { Rng, streams, xmur3, sfc32 } from './core/rng';
export type { RngStreams } from './core/rng';
export { generate, pluginFor, ENGINE_FAMILIES, PLUGINS, DIRECT, isDirect, familyFormats } from './generate';
export { ladder, ladderAt, jitterLevel, planningParams, LADDER_CONFIG } from './difficulty/ladder';
export {
    nextPlan, pickFamily, familyWeights, pushHistory, seenFingerprint, emptySchedulerState, FINGERPRINT_WINDOW,
} from './difficulty/scheduler';
export type { SchedulerState, PlanRequest } from './difficulty/scheduler';
export { getCyrillicPool, pickNames } from './core/names';
export { nextItem, formatFor } from './session';
export type { SessionRequest, SessionResult } from './session';
export {
    STAIRCASE, targetFor, updateLevel, newFamilyLevel, levelNotice, migratedLevel, adaptiveSeconds,
} from './difficulty/staircase';
export type { FamilyLevel, Outcome } from './difficulty/staircase';
export { analogyBases, ANALOGY_BASES } from './families/analogy';
export { binaryOps } from './families/binary';
