const db = require('../../src/db');

// Mock pg module
jest.mock('pg', () => {
  const mockPool = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
    totalCount: 10
  };

  return {
    Pool: jest.fn(() => mockPool)
  };
});

describe('Database Module', () => {
  let mockPool;

  beforeEach(() => {
    const { Pool } = require('pg');
    mockPool = new Pool();
    jest.clearAllMocks();
  });

  describe('query()', () => {
    it('should execute query successfully', async () => {
      const mockResult = { rows: [{ id: 1 }], rowCount: 1 };
      mockPool.query.mockResolvedValue(mockResult);

      const result = await db.query('SELECT * FROM test', []);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test', []);
      expect(result).toEqual(mockResult);
    });

    it('should handle query errors', async () => {
      const mockError = new Error('Database error');
      mockPool.query.mockRejectedValue(mockError);

      await expect(db.query('INVALID SQL', [])).rejects.toThrow('Database error');
    });

    it('should log query execution', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await db.query('SELECT 1', []);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Executed query',
        expect.objectContaining({
          text: 'SELECT 1',
          rows: 0
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getClient()', () => {
    it('should return a client from the pool', async () => {
      const mockClient = { query: jest.fn(), release: jest.fn() };
      mockPool.connect.mockResolvedValue(mockClient);

      const client = await db.getClient();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(client).toEqual(mockClient);
    });
  });

  describe('close()', () => {
    it('should close the pool', async () => {
      mockPool.end.mockResolvedValue();

      await db.close();

      expect(mockPool.end).toHaveBeenCalled();
    });
  });

  describe('pool', () => {
    it('should export pool instance', () => {
      expect(db.pool).toBeDefined();
      expect(db.pool.totalCount).toBe(10);
    });
  });
});
