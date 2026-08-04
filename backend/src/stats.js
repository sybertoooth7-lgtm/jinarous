const db = require('./db');

let stats = {
  totalContacts: 0,
  totalMessages: 0
};

async function loadPersistedValues() {
  try {
    const contactResult = await db.query('SELECT COUNT(*) FROM contacts');
    const messageResult = await db.query('SELECT COUNT(*) FROM contacts WHERE message IS NOT NULL');

    stats.totalContacts = parseInt(contactResult.rows[0].count, 10) || 0;
    stats.totalMessages = parseInt(messageResult.rows[0].count, 10) || 0;

    console.log(`[stats] Loaded: ${stats.totalContacts} contacts, ${stats.totalMessages} messages`);
  } catch (err) {
    console.error('[stats] Failed to load persisted values:', err.message);
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

// Background refresh every 5 minutes
setInterval(() => {
  loadPersistedValues().catch(err => {
    console.error('[stats] Background refresh failed:', err.message);
  });
}, 5 * 60 * 1000);

module.exports = {
  loadPersistedValues,
  getStats,
  incrementContacts,
  incrementMessages
};
