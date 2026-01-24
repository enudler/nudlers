import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['__tests__/setup.ts'],
        // Use forks instead of threads as it's often more stable for memory-heavy tests
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
        // Enable isolation to ensure memory is cleared between test files
        isolate: true,
        // Increase timeout for scraper-related tests
        testTimeout: 60000,
    },
});
