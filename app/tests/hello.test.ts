import { describe, it, expect } from 'vitest';

describe('Hello World', () => {
    it('should pass if 1 + 1 equals 2', () => {
        expect(1 + 1).toBe(2);
    });

    it('should say hello world', () => {
        const greeting = 'Hello World';
        expect(greeting).toBe('Hello World');
    });
});
