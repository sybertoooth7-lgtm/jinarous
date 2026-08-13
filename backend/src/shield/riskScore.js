// shield/riskScore.js
// Computes a portable 0-100 risk score from a client's compliance
// checklist status. Deliberately NOT stored in a column — always
// computed fresh from client_compliance_status, so it's never stale
// and can't drift out of sync with the underlying checklist data.
import db from '../db.js';

// Points awarded per status. 'not_applicable' items are excluded
// entirely from both the numerator and denominator — they shouldn't
// drag the score down or artificially inflate it.
const STATUS_POINTS = {
  passing: 1,
  in_progress: 0.5,
  pending: 0,
  failing: 0,
};

/**
 * Computes a client's risk score (0-100) plus a per-framework breakdown.
 * Score = (weighted points earned / total applicable items) * 100.
 */
export async function computeRiskScore(clientId) {
  const result = await db.query(
    `SELECT
       ci.framework,
       COALESCE(ccs.status, 'pending') AS status
     FROM compliance_items ci
     LEFT JOIN client_compliance_status ccs
       ON ccs.item_id = ci.id AND ccs.client_id = $1`,
    [clientId]
  );

  const applicable = result.rows.filter((r) => r.status !== 'not_applicable');

  if (applicable.length === 0) {
    return { score: null, itemCount: 0, frameworkBreakdown: {} };
  }

  let totalPoints = 0;
  const frameworkTotals = {};

  for (const row of applicable) {
    const points = STATUS_POINTS[row.status] ?? 0;
    totalPoints += points;

    if (!frameworkTotals[row.framework]) {
      frameworkTotals[row.framework] = { earned: 0, count: 0 };
    }
    frameworkTotals[row.framework].earned += points;
    frameworkTotals[row.framework].count += 1;
  }

  const score = Math.round((totalPoints / applicable.length) * 100);

  const frameworkBreakdown = {};
  for (const [framework, { earned, count }] of Object.entries(frameworkTotals)) {
    frameworkBreakdown[framework] = Math.round((earned / count) * 100);
  }

  return { score, itemCount: applicable.length, frameworkBreakdown };
}

/**
 * Maps a numeric score to a human-readable band. Kept coarse and
 * conservative on purpose — an SME with a 62 shouldn't be able to call
 * itself "excellent," and a bank skimming scores wants a small,
 * unambiguous vocabulary rather than false precision.
 */
export function scoreLabel(score) {
  if (score === null) return 'Not yet assessed';
  if (score >= 90) return 'Strong';
  if (score >= 70) return 'Adequate';
  if (score >= 50) return 'Developing';
  return 'Needs attention';
}
