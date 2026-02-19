/**
 * Budget enforcement module.
 *
 * Tracks API spend per rolling 24-hour window and enforces a configurable
 * ceiling. When the ceiling is reached, dispatches are blocked until the
 * window rolls past older entries.
 */

/**
 * Get the current budget ceiling (max spend per 24h in dollars).
 * @param {import('better-sqlite3').Database} db
 * @returns {number}
 */
export function getCeiling(db) {
  const row = db.prepare("SELECT value FROM system_state WHERE key = 'budget_ceiling'").get();
  return parseFloat(row.value);
}

/**
 * Set the budget ceiling.
 * @param {import('better-sqlite3').Database} db
 * @param {number} ceiling - Max spend per 24h in dollars
 */
export function setCeiling(db, ceiling) {
  if (typeof ceiling !== 'number' || ceiling <= 0) {
    throw new Error('Budget ceiling must be a positive number');
  }
  db.prepare("UPDATE system_state SET value = ? WHERE key = 'budget_ceiling'").run(String(ceiling));
}

/**
 * Get the estimated cost per API call.
 * @param {import('better-sqlite3').Database} db
 * @returns {number}
 */
export function getCostPerCall(db) {
  const row = db.prepare("SELECT value FROM system_state WHERE key = 'budget_cost_per_call'").get();
  return parseFloat(row.value);
}

/**
 * Set the estimated cost per API call.
 * @param {import('better-sqlite3').Database} db
 * @param {number} cost - Cost per call in dollars
 */
export function setCostPerCall(db, cost) {
  if (typeof cost !== 'number' || cost < 0) {
    throw new Error('Cost per call must be a non-negative number');
  }
  db.prepare("UPDATE system_state SET value = ? WHERE key = 'budget_cost_per_call'").run(String(cost));
}

/**
 * Record an API usage entry.
 * @param {import('better-sqlite3').Database} db
 * @param {object} opts
 * @param {string} opts.agent - Agent identifier
 * @param {string} opts.domain - Domain context
 * @param {string} opts.node - Compute node used
 * @param {number} opts.cost - Estimated cost in dollars
 * @param {number} opts.durationMs - Call duration in milliseconds
 */
export function recordUsage(db, { agent, domain, node, cost, durationMs }) {
  db.prepare(`
    INSERT INTO api_usage (agent, domain, node, cost, duration_ms)
    VALUES (?, ?, ?, ?, ?)
  `).run(agent, domain, node || 'pi1', cost, durationMs || 0);
}

/**
 * Get total API usage in the last 24 hours.
 * @param {import('better-sqlite3').Database} db
 * @returns {{ totalCost: number, callCount: number }}
 */
export function getUsage24h(db) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(cost), 0) AS totalCost, COUNT(*) AS callCount
    FROM api_usage
    WHERE created_at >= datetime('now', '-24 hours')
  `).get();
  return { totalCost: row.totalCost, callCount: row.callCount };
}

/**
 * Check if the system is within the budget ceiling.
 * @param {import('better-sqlite3').Database} db
 * @returns {boolean}
 */
export function isWithinBudget(db) {
  const ceiling = getCeiling(db);
  const { totalCost } = getUsage24h(db);
  return totalCost < ceiling;
}

/**
 * Get a complete budget status summary.
 * @param {import('better-sqlite3').Database} db
 * @returns {{ ceiling: number, spent: number, remaining: number, callCount: number, withinBudget: boolean, costPerCall: number }}
 */
export function getBudgetStatus(db) {
  const ceiling = getCeiling(db);
  const costPerCall = getCostPerCall(db);
  const { totalCost, callCount } = getUsage24h(db);
  return {
    ceiling,
    spent: totalCost,
    remaining: Math.max(0, ceiling - totalCost),
    callCount,
    withinBudget: totalCost < ceiling,
    costPerCall,
  };
}
