import { defineConfig } from 'vitest/config';

// Cue audit (bots + gates). Long-running: sample size is set by the AUDIT_N env variable.
export default defineConfig({
    test: {
        include: ['src/app/syllogimous/engine/audit/**/*.audit.ts'],
        environment: 'node',
        testTimeout: 600000,
        hookTimeout: 600000,
    },
});
