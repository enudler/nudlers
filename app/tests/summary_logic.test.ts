import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateDailySummary } from '../utils/summary.js';
import { getDB } from '../pages/api/db.js';
import { GoogleGenerativeAI } from "@google/generative-ai";

vi.mock('../pages/api/db.js', () => ({
    getDB: vi.fn(),
}));

vi.mock('@google/generative-ai', () => {
    const generateContentMock = vi.fn().mockResolvedValue({
        response: {
            text: () => "Mocked AI Summary",
            candidates: [{ finishReason: 'STOP', safetyRatings: [] }]
        }
    });
    const getGenerativeModelMock = vi.fn().mockReturnValue({
        generateContent: generateContentMock
    });
    return {
        GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
            getGenerativeModel: getGenerativeModelMock
        }))
    };
});

vi.mock('../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    }
}));

describe('Summary Generation Logic', () => {
    let mockClient: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockClient = {
            query: vi.fn(),
            release: vi.fn()
        };
        (getDB as any).mockResolvedValue(mockClient);
    });

    it('should calculate burndown rate and construct prompt correctly', async () => {
        // Mock settings
        mockClient.query.mockResolvedValueOnce({
            rows: [
                { key: 'gemini_api_key', value: '"test-key"' },
                { key: 'gemini_model', value: '"gemini-2.5-flash"' },
                { key: 'whatsapp_summary_mode', value: '"calendar"' },
                { key: 'billing_cycle_start_day', value: '10' }
            ]
        });

        // Mock transactionsResult
        mockClient.query.mockResolvedValueOnce({
            rows: [
                { date: '2026-01-20', name: 'Test Shop', category: 'Food', price: 100, vendor: 'Visa' }
            ]
        });

        // Mock budgetResult
        mockClient.query.mockResolvedValueOnce({
            rows: [{ category: 'Food', budget_limit: 1000 }]
        });

        // Mock actualResult
        mockClient.query.mockResolvedValueOnce({
            rows: [
                { category: 'Food', actual_spent: 200 },
                { category: 'Unbudgeted', actual_spent: 50 }
            ]
        });

        // Mock totalBudgetResult
        mockClient.query.mockResolvedValueOnce({
            rows: [{ budget_limit: 5000 }]
        });

        const result = await generateDailySummary();

        expect(result).toBe("Mocked AI Summary");

        // Check if the prompt contains expected elements
        const genAiInstance = (GoogleGenerativeAI as any).mock.results[0].value;
        const modelInstance = genAiInstance.getGenerativeModel.mock.results[0].value;
        const prompt = modelInstance.generateContent.mock.calls[0][0];

        expect(prompt).toContain('💰 *סיכום הוצאות יומי* 💰');
        expect(prompt).toContain('1️⃣ *10 עסקאות אחרונות');
        expect(prompt).toContain('חובה להציג את כל 10 העסקאות');
        expect(prompt).toContain('2️⃣ *סטטוס תקציב לפי קטגוריות');
        expect(prompt).toContain('3️⃣ *תמונת מצב תקציב כולל');
        expect(prompt).toContain('• *תקציב:* ₪5000');
        expect(prompt).toContain('*Food:* ₪200/₪1000');
        expect(prompt).not.toContain('Unbudgeted:');
        expect(prompt).toContain('20.01: Test Shop - ₪100 (Food)');
    });
});
