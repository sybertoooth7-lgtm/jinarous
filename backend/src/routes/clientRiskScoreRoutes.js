// routes/clientRiskScore.js
// Client-facing: view own score. Mount under requireClientAuth.
import { Router } from 'express';
import { computeRiskScore, scoreLabel } from '../shield/riskScore.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await computeRiskScore(req.client.sub);
    res.json({ ...result, label: scoreLabel(result.score) });
  } catch (err) {
    console.error('[clientRiskScore] Failed to compute score:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
