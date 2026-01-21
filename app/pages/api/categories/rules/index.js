import { createApiHandler } from "../../utils/apiHandler";

const handler = createApiHandler({
  validate: (req) => {
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
      return "Only GET, POST, PUT, and DELETE methods are allowed";
    }
    
    if (req.method === 'POST') {
      const { name_pattern, target_category } = req.body;
      if (!name_pattern || !target_category) {
        return "name_pattern and target_category are required";
      }
    }
    
    if (req.method === 'PUT') {
      const { id, name_pattern, target_category, is_active } = req.body;
      if (!id || !name_pattern || !target_category) {
        return "id, name_pattern, and target_category are required";
      }
    }
    
    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) {
        return "id is required";
      }
    }
  },
  query: async (req) => {
    if (req.method === 'GET') {
      return {
        sql: `
          SELECT id, name_pattern, target_category, is_active, created_at, updated_at
          FROM categorization_rules
          ORDER BY created_at DESC
        `,
        params: []
      };
    }
    
    if (req.method === 'POST') {
      const { name_pattern, target_category } = req.body;
      return {
        sql: `
          INSERT INTO categorization_rules (name_pattern, target_category)
          VALUES ($1, $2)
          RETURNING id, name_pattern, target_category, is_active, created_at, updated_at
        `,
        params: [name_pattern, target_category]
      };
    }
    
    if (req.method === 'PUT') {
      const { id, name_pattern, target_category, is_active } = req.body;
      return {
        sql: `
          UPDATE categorization_rules 
          SET name_pattern = $2, target_category = $3, is_active = $4, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING id, name_pattern, target_category, is_active, created_at, updated_at
        `,
        params: [id, name_pattern, target_category, is_active]
      };
    }
    
    if (req.method === 'DELETE') {
      const { id } = req.body;
      return {
        sql: `
          DELETE FROM categorization_rules 
          WHERE id = $1
        `,
        params: [id]
      };
    }
  },
  transform: (result, req) => {
    if (req.method === 'GET') {
      return result.rows;
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      return result.rows[0];
    }
    return { success: true };
  }
});

export default handler; 