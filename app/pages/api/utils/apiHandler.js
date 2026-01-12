import { getDB } from "../db";
import logger from '../../../utils/logger.js';

/**
 * Generic API handler utility for database operations
 * @param {Object} options - Handler configuration
 * @param {Function} options.query - Function that returns the SQL query and parameters
 * @param {Function} [options.validate] - Optional validation function
 * @param {Function} [options.transform] - Optional transformation function for results
 * @returns {Function} - API handler function
 */
export function createApiHandler({ query, validate, transform }) {
  return async function handler(req, res) {
    const client = await getDB();

    try {
      if (validate) {
        const validationError = await validate(req);
        if (validationError) {
          return res.status(400).json({ error: validationError });
        }
      }

      const { sql, params = [] } = await query(req);
      const result = await client.query(sql, params);
      const data = transform ? await transform(result, req) : result.rows;

      res.status(200).json(data);
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, "Error executing query");
      res.status(500).json({ 
        error: "Internal Server Error", 
        details: error.message 
      });
    } finally {
      client.release();
    }
  };
} 