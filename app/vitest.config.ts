import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        // Use forks instead of threads as it's often more stable for memory-heavy tests
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
        // Disable isolation to save memory by not reloading modules for each test file
        isolate: false,
        // Increase timeout for scraper-related tests
        testTimeout: 60000,
    },
});
