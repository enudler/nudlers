import { describe, it, expect } from 'vitest';
import { msToSeconds, secondsToMs } from '../utils/settings-utils';

describe('Settings Units Conversion Utilities', () => {
    describe('msToSeconds', () => {
        it('should convert milliseconds to seconds correctly', () => {
            expect(msToSeconds(1000)).toBe(1);
            expect(msToSeconds(90000)).toBe(90);
            expect(msToSeconds(0)).toBe(0);
            expect(msToSeconds(500)).toBe(0.5);
        });

        it('should handle strings correctly', () => {
            expect(msToSeconds('1000')).toBe(1);
            expect(msToSeconds('90000')).toBe(90);
        });

        it('should handle null, undefined, and empty values gracefully', () => {
            expect(msToSeconds(null)).toBe(0);
            expect(msToSeconds(undefined)).toBe(0);
            expect(msToSeconds('')).toBe(0);
        });

        it('should handle invalid values gracefully', () => {
            expect(msToSeconds('invalid')).toBe(0);
        });
    });

    describe('secondsToMs', () => {
        it('should convert seconds to milliseconds correctly', () => {
            expect(secondsToMs(1)).toBe(1000);
            expect(secondsToMs(90)).toBe(90000);
            expect(secondsToMs(0)).toBe(0);
            expect(secondsToMs(0.5)).toBe(500);
        });

        it('should handle strings correctly', () => {
            expect(secondsToMs('1')).toBe(1000);
            expect(secondsToMs('90')).toBe(90000);
        });

        it('should handle null, undefined, and empty values gracefully', () => {
            expect(secondsToMs(null)).toBe(0);
            expect(secondsToMs(undefined)).toBe(0);
            expect(secondsToMs('')).toBe(0);
        });

        it('should handle invalid values gracefully', () => {
            expect(secondsToMs('invalid')).toBe(0);
        });
    });
});
