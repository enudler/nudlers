---
description: Frontend UI Standards
---

# UI Standards

## Category Selection
When implementing category selection or assignment in any component (modals, tables, forms):
- MUST use the `CategoryAutocomplete` component (`app/components/CategoryAutocomplete.tsx`).
- This ensures consistent behavior (free text entry + dropdown) and supports the "Apply to all & create rule" functionality where appropriate.
- Do NOT use simple Select/Menu components for categories unless there is a specific reason to deviate.
