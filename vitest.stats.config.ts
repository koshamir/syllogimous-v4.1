import { defineConfig } from 'vitest/config';

// Developer probe: generation statistics per family and premise count.
export default defineConfig({
    test: { include: ['tools/engine-stats.test.ts'], environment: 'node', testTimeout: 600000 },
});
