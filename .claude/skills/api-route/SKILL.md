---
name: api-route
description: Scaffold a new API route using the createApiHandler pattern. Use when the user wants to add a new API endpoint.
---

Create a new API route at `app/pages/api/$ARGUMENTS/index.js` following the project's established patterns.

## Requirements

1. **Use `createApiHandler`** from `../utils/apiHandler` for all database operations
2. **Use `getDB`** from `../db` for any custom database work outside createApiHandler
3. **Always release client** in a `finally` block when using `getDB()` directly
4. **Use `logger`** from `../../../utils/logger.js` — never `console.log/error/warn`
5. **Use parameterized queries** — never interpolate user input into SQL
6. **Error responses**: `{ error: "Internal Server Error" }` — never expose `error.message`
7. **Use `parseInt(value, 10)`** with explicit radix for numeric params
8. **Import vendor lists** from `utils/constants.js` if needed — never duplicate locally

## Template Structure

```javascript
import { createApiHandler } from "../utils/apiHandler";
import { getDB } from "../db";
import logger from '../../../utils/logger.js';

const handler = async (req, res) => {
    if (req.method === 'GET') {
        return getHandler(req, res);
    } else if (req.method === 'POST') {
        return postHandler(req, res);
    }
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
};

const getHandler = createApiHandler({
    validate: (req) => {
        // Return error string if invalid, undefined if valid
    },
    query: async (req) => ({
        sql: 'SELECT * FROM table_name WHERE column = $1',
        params: [req.query.param]
    }),
    transform: (result) => result.rows
});

const postHandler = createApiHandler({
    validate: (req) => {
        if (!req.body.required_field) return "required_field is required";
    },
    query: async (req) => ({
        sql: 'INSERT INTO table_name (col) VALUES ($1) RETURNING *',
        params: [req.body.required_field]
    }),
    transform: (result) => result.rows[0]
});

export default handler;
```

## After Creating

- Add corresponding test file at `app/tests/$ARGUMENTS.test.ts`
- Follow the test patterns from the `/test` skill
