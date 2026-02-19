/**
 * Log an action to the audit log.
 * @param {import('better-sqlite3').Database} db
 * @param {object} opts
 * @param {string} opts.agent - The agent that performed the action
 * @param {string} opts.action - The action performed
 * @param {string} opts.domain - The domain of the action
 * @param {string|null} [opts.detail] - Additional detail
 * @param {boolean} [opts.blocked=false] - Whether the action was blocked
 * @returns {object} The created audit log entry
 */
export function logAction(db, { agent, action, domain, detail = null, blocked = false }) {
  const blockedInt = blocked ? 1 : 0;
  const stmt = db.prepare(`
    INSERT INTO audit_log (agent, action, domain, detail, blocked)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(agent, action, domain, detail, blockedInt);
  return db.prepare('SELECT * FROM audit_log WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * Get the most recent audit log entries.
 * @param {import('better-sqlite3').Database} db
 * @param {number} [limit=50] - Maximum entries to return
 * @returns {object[]} Array of audit log entries, most recent first
 */
export function getRecentLogs(db, limit = 50) {
  return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
}
