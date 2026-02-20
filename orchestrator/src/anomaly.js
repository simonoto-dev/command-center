/**
 * Anomaly detection module.
 *
 * Monitors for unusual behavior patterns and auto-pauses the system
 * when thresholds are exceeded:
 * - Excessive API calls from a single agent (per hour)
 * - Repeated consecutive blocked actions (same agent)
 */

import { setPace } from './pace.js';
import { logAction } from './audit.js';

const VALID_THRESHOLDS = new Set([
  'max_calls_per_agent_per_hour',
  'max_consecutive_failures',
]);

/**
 * Get current anomaly detection thresholds.
 * @param {import('better-sqlite3').Database} db
 * @returns {{ maxCallsPerAgentPerHour: number, maxConsecutiveFailures: number }}
 */
export function getAnomalyThresholds(db) {
  const calls = db.prepare("SELECT value FROM system_state WHERE key = 'max_calls_per_agent_per_hour'").get();
  const failures = db.prepare("SELECT value FROM system_state WHERE key = 'max_consecutive_failures'").get();
  return {
    maxCallsPerAgentPerHour: parseInt(calls.value),
    maxConsecutiveFailures: parseInt(failures.value),
  };
}

/**
 * Set an anomaly detection threshold.
 * @param {import('better-sqlite3').Database} db
 * @param {string} key - Threshold key
 * @param {number} value - Threshold value (positive integer)
 */
export function setAnomalyThreshold(db, key, value) {
  if (!VALID_THRESHOLDS.has(key)) {
    throw new Error(`Unknown threshold: ${key}. Valid: ${[...VALID_THRESHOLDS].join(', ')}`);
  }
  if (typeof value !== 'number' || value <= 0 || !Number.isInteger(value)) {
    throw new Error('Threshold must be a positive integer');
  }
  db.prepare('UPDATE system_state SET value = ? WHERE key = ?').run(String(value), key);
}

/**
 * Check for anomalies in recent system activity.
 * Auto-pauses the system if anomalies are detected.
 * @param {import('better-sqlite3').Database} db
 * @returns {{ anomalies: Array<{type: string, agent: string, detail: string}>, autoPaused: boolean }}
 */
export function checkAnomalies(db) {
  const thresholds = getAnomalyThresholds(db);
  const anomalies = [];

  // Check 1: Excessive API calls from a single agent in the last hour
  const agentCalls = db.prepare(`
    SELECT agent, COUNT(*) AS cnt
    FROM api_usage
    WHERE created_at >= datetime('now', '-1 hour')
    GROUP BY agent
    HAVING cnt > ?
  `).all(thresholds.maxCallsPerAgentPerHour);

  for (const row of agentCalls) {
    anomalies.push({
      type: 'excessive_calls',
      agent: row.agent,
      detail: `${row.cnt} calls in last hour (threshold: ${thresholds.maxCallsPerAgentPerHour})`,
    });
  }

  // Check 2: Consecutive blocked actions from same agent (recent audit log)
  const recentBlocked = db.prepare(`
    SELECT agent, COUNT(*) AS cnt
    FROM (
      SELECT agent, blocked,
        ROW_NUMBER() OVER (PARTITION BY agent ORDER BY id DESC) AS rn
      FROM audit_log
      WHERE blocked = 1
    )
    WHERE rn <= ?
    GROUP BY agent
    HAVING cnt >= ?
  `).all(thresholds.maxConsecutiveFailures, thresholds.maxConsecutiveFailures);

  for (const row of recentBlocked) {
    anomalies.push({
      type: 'consecutive_failures',
      agent: row.agent,
      detail: `${row.cnt} consecutive blocked actions (threshold: ${thresholds.maxConsecutiveFailures})`,
    });
  }

  // Auto-pause if any anomalies detected
  let autoPaused = false;
  if (anomalies.length > 0) {
    setPace(db, 'pause');
    autoPaused = true;
    for (const a of anomalies) {
      logAction(db, {
        agent: 'anomaly-detector',
        action: 'auto_pause',
        domain: 'system',
        detail: `${a.type}: ${a.agent} — ${a.detail}`,
      });
    }
  }

  return { anomalies, autoPaused };
}
