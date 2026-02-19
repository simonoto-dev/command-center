import { listProposals } from './proposals.js';
import { getRecentLogs } from './audit.js';
import { getBudgetStatus } from './budget.js';

/**
 * Generate a morning brief summarising pending proposals and overnight activity.
 * @param {import('better-sqlite3').Database} db
 * @returns {object} The morning brief payload
 */
export function generateBrief(db) {
  const pending = listProposals(db, { status: 'pending' });
  const logs = getRecentLogs(db, 100);

  const effortOrder = { low: 0, medium: 1, high: 2 };
  pending.sort((a, b) => {
    if (a.recommendation === 'greenlight' && b.recommendation !== 'greenlight') return -1;
    if (b.recommendation === 'greenlight' && a.recommendation !== 'greenlight') return 1;
    return (effortOrder[a.effort] || 99) - (effortOrder[b.effort] || 99);
  });

  const budget = getBudgetStatus(db);

  return {
    generated_at: new Date().toISOString(),
    pending_proposals: pending,
    overnight_activity: logs,
    budget,
    summary: {
      total_pending: pending.length,
      total_activity: logs.length,
      blocked_actions: logs.filter(l => l.blocked).length,
    },
  };
}
