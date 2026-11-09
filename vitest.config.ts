import { defineConfig } from 'vitest/config';

// Engine unit tests only. Named *.test.ts so Karma (*.spec.ts) never picks them up.
export default defineConfig({
    test: {
        include: ['src/app/syllogimous/engine/**/*.test.ts'],
        environment: 'node',
    },
});
