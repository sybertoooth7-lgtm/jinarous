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

/**
 * Same scoring math as computeRiskScore, but for several clients in one
 * query instead of one call per client — for admin-dashboard list views
 * where an N+1 loop over computeRiskScore would mean one query per row.
 * Deliberately takes an explicit clientIds array (e.g. one page's worth)
 * rather than defaulting to "all clients", so the underlying
 * clients × compliance_items join stays bounded regardless of how large
 * either table grows.
 *
 * Returns a Map<clientId, { score, itemCount }> — clients with zero
 * applicable items (score: null) are included with score: null, matching
 * computeRiskScore's own null-score contract.
 */
export async function computeRiskScoreBulk(clientIds) {
  const results = new Map();
  if (!clientIds || clientIds.length === 0) return results;

  const result = await db.query(
    `SELECT
       c.id AS client_id,
       COALESCE(ccs.status, 'pending') AS status
     FROM clients c
     CROSS JOIN compliance_items ci
     LEFT JOIN client_compliance_status ccs
       ON ccs.client_id = c.id AND ccs.item_id = ci.id
     WHERE c.id = ANY($1::int[])`,
    [clientIds]
  );

  const byClient = new Map();
  for (const row of result.rows) {
    if (row.status === 'not_applicable') continue;
    if (!byClient.has(row.client_id)) byClient.set(row.client_id, { points: 0, count: 0 });
    const entry = byClient.get(row.client_id);
    entry.points += STATUS_POINTS[row.status] ?? 0;
    entry.count += 1;
  }

  for (const clientId of clientIds) {
    const entry = byClient.get(clientId);
    if (!entry || entry.count === 0) {
      results.set(clientId, { score: null, itemCount: 0 });
    } else {
      results.set(clientId, {
        score: Math.round((entry.points / entry.count) * 100),
        itemCount: entry.count,
      });
    }
  }

  return results;
}

/**
 * Platform-wide compliance summary for the admin dashboard overview:
 * total clients, average score, and a count of clients in each score
 * band (thresholds match scoreLabel() exactly). Computed as a single
 * aggregate query — never returns per-client rows, so it stays cheap to
 * call on every dashboard load regardless of how many clients exist.
 */
export async function computeComplianceOverview() {
  const result = await db.query(`
    WITH client_scores AS (
      SELECT
        c.id,
        SUM(
          CASE WHEN COALESCE(ccs.status, 'pending') = 'not_applicable' THEN 0
               ELSE CASE COALESCE(ccs.status, 'pending')
                      WHEN 'passing' THEN 1
                      WHEN 'in_progress' THEN 0.5
                      ELSE 0
                    END
          END
        ) AS points,
        COUNT(*) FILTER (WHERE COALESCE(ccs.status, 'pending') != 'not_applicable') AS applicable_count
      FROM clients c
      CROSS JOIN compliance_items ci
      LEFT JOIN client_compliance_status ccs
        ON ccs.client_id = c.id AND ccs.item_id = ci.id
      GROUP BY c.id
    ),
    scored AS (
      SELECT
        id,
        CASE WHEN applicable_count > 0
             THEN ROUND((points / applicable_count) * 100)
             ELSE NULL END AS score
      FROM client_scores
    )
    SELECT
      COUNT(*)::int AS total_clients,
      ROUND(AVG(score))::int AS avg_score,
      COUNT(*) FILTER (WHERE score >= 90)::int AS strong_count,
      COUNT(*) FILTER (WHERE score >= 70 AND score < 90)::int AS adequate_count,
      COUNT(*) FILTER (WHERE score >= 50 AND score < 70)::int AS developing_count,
      COUNT(*) FILTER (WHERE score IS NOT NULL AND score < 50)::int AS needs_attention_count,
      COUNT(*) FILTER (WHERE score IS NULL)::int AS not_assessed_count
    FROM scored
  `);

  const row = result.rows[0];
  return {
    totalClients: row.total_clients,
    avgScore: row.avg_score, // null when there are zero clients, or none have any applicable items
    bandCounts: {
      Strong: row.strong_count,
      Adequate: row.adequate_count,
      Developing: row.developing_count,
      'Needs attention': row.needs_attention_count,
      'Not yet assessed': row.not_assessed_count,
    },
  };
}
