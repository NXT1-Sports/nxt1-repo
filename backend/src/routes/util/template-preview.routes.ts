// backend/src/routes/util/template-preview.routes.ts
import { Router } from 'express';
import { replaceTemplateVariables } from '../../services/util/template-variable-replacer.js';

const router = Router();

// POST /api/util/preview-template
// Body: { template: string, values: Record<string, string> }
router.post('/preview-template', (req, res) => {
  const { template, values } = req.body as { template: unknown; values: unknown };
  if (typeof template !== 'string' || typeof values !== 'object' || values === null) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }
  const result = replaceTemplateVariables(template, values as Record<string, string>);
  res.json({ result });
});

export default router;
