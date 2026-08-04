const db = require('./db');

let stats = {
  totalContacts: 0,
  totalMessages: 0
};

/**
 * Fix #7: Replace top-level await with explicit async init function.
 * Call this after DB connection is established in index.js.
 * If DB is down, stats default to 0 and can be retried later.
 */
async function loadPersistedValues() {
  try {
    const contactResult = await db.query('SELECT COUNT(*) FROM contacts');
    const messageResult = await db.query('SELECT COUNT(*) FROM contacts WHERE message IS NOT NULL');

    stats.totalContacts = parseInt(contactResult.rows[0].count, 10) || 0;
    stats.totalMessages = parseInt(messageResult.rows[0].count, 10) || 0;

    console.log(`[stats] Loaded: ${stats.totalContacts} contacts, ${stats.totalMessages} messages`);
  } catch (err) {
    console.error('[stats] Failed to load persisted values:', err.message);
    // Stats remain at 0 — safe fallback. Retry can be triggered manually.
  }
}

function getStats() {
  return { ...stats };
}

function incrementContacts() {
  stats.totalContacts++;
}

function incrementMessages() {
  stats.totalMessages++;
}

module.exports = {
  loadPersistedValues,
  getStats,
  incrementContacts,
  incrementMessages
};
