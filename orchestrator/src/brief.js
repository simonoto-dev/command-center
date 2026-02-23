import { listProposals } from './proposals.js';
import { getRecentLogs } from './audit.js';
import { getBudgetStatus } from './budget.js';
import { checkAnomalies } from './anomaly.js';
import { getRecentEntries, getEntries } from './dossier.js';

/**
 * Generate a morning brief summarising pending proposals and overnight activity.
 * Now includes strategy memos and content drafts for an actionable daily agenda.
 * @param {import('better-sqlite3').Database} db
 * @returns {object} The morning brief payload
 */
export function generateBrief(db) {
  const pending = listProposals(db, { status: 'pending' });
  const greenlit = listProposals(db, { status: 'greenlit' });
  const logs = getRecentLogs(db, 100);

  const effortOrder = { small: 0, medium: 1, large: 2 };
  pending.sort((a, b) => {
    if (a.recommendation === 'greenlight' && b.recommendation !== 'greenlight') return -1;
    if (b.recommendation === 'greenlight' && a.recommendation !== 'greenlight') return 1;
    return (effortOrder[a.effort] || 99) - (effortOrder[b.effort] || 99);
  });

  const budget = getBudgetStatus(db);
  const { anomalies } = checkAnomalies(db);
  const recentDossier = getRecentEntries(db, 5);

  // Pull the latest strategy memo if one exists
  const strategyMemos = getEntries(db, { topicId: 'strategy-memo', limit: 1 });
  const latestStrategy = strategyMemos.length > 0 ? strategyMemos[0] : null;

  // Content proposals ready for review
  const contentProposals = pending.filter(p => p.domain === 'content');

  // Categorize proposals for quick scanning
  const quickWins = pending.filter(p => p.effort === 'small' && p.recommendation === 'greenlight');
  const needsReview = pending.filter(p => p.recommendation !== 'greenlight');

  return {
    generated_at: new Date().toISOString(),
    // Action items — what to do right now
    action_items: {
      quick_wins: quickWins,
      content_ready: contentProposals,
      in_pipeline: greenlit,
      needs_review: needsReview,
    },
    // Strategy context
    latest_strategy: latestStrategy,
    // Full lists
    pending_proposals: pending,
    overnight_activity: logs,
    budget,
    anomalies,
    recent_research: recentDossier,
    summary: {
      total_pending: pending.length,
      quick_wins: quickWins.length,
      content_ready: contentProposals.length,
      in_pipeline: greenlit.length,
      total_activity: logs.length,
      blocked_actions: logs.filter(l => l.blocked).length,
      active_anomalies: anomalies.length,
      recent_research_count: recentDossier.length,
    },
  };
}
