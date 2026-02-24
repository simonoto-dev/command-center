import { listProposals } from './proposals.js';
import { getRecentLogs } from './audit.js';
import { getBudgetStatus } from './budget.js';
import { checkAnomalies } from './anomaly.js';
import { getRecentEntries, getEntries } from './dossier.js';
import { getRevenueSummary, listGigs, listOpportunities, getUpcomingDeadlines } from './revenue.js';

/**
 * Generate a morning brief — an actionable daily cockpit.
 *
 * Design principle: Simon should be able to act on this in 2 minutes
 * from his phone. TL;DR at top, ranked action items, decision shortcuts.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {object} The morning brief payload
 */
export function generateBrief(db) {
  const pending = listProposals(db, { status: 'pending' });
  const greenlit = listProposals(db, { status: 'greenlit' });
  const logs = getRecentLogs(db, 100);
  const budget = getBudgetStatus(db);
  const { anomalies } = checkAnomalies(db);
  const recentDossier = getRecentEntries(db, 5);

  // Strategy memo
  const strategyMemos = getEntries(db, { topicId: 'strategy-memo', limit: 1 });
  const latestStrategy = strategyMemos.length > 0 ? strategyMemos[0] : null;

  // Revenue data
  let revenue = null;
  let upcomingGigs = [];
  let newOpportunities = [];
  let deadlines = [];
  try {
    revenue = getRevenueSummary(db);
    upcomingGigs = listGigs(db, { status: 'upcoming', limit: 5 });
    newOpportunities = listOpportunities(db, { status: 'new', limit: 10 });
    deadlines = getUpcomingDeadlines(db, 14);
  } catch {
    // Revenue tables may not exist yet on older DBs
  }

  // Sort proposals: recommended greenlights first, then by effort (small first)
  const effortOrder = { small: 0, medium: 1, large: 2 };
  pending.sort((a, b) => {
    if (a.recommendation === 'greenlight' && b.recommendation !== 'greenlight') return -1;
    if (b.recommendation === 'greenlight' && a.recommendation !== 'greenlight') return 1;
    return (effortOrder[a.effort] || 99) - (effortOrder[b.effort] || 99);
  });

  // Categorize for quick scanning
  const quickWins = pending.filter(p => p.effort === 'small' && p.recommendation === 'greenlight');
  const needsReview = pending.filter(p => p.recommendation !== 'greenlight');
  const contentProposals = pending.filter(p => p.domain === 'content');

  // Build the TL;DR — one line per urgent item
  const tldr = [];

  if (deadlines.length > 0) {
    const urgent = deadlines.filter(d => {
      const daysUntil = Math.ceil((new Date(d.date) - new Date()) / 86400000);
      return daysUntil <= 3;
    });
    if (urgent.length > 0) {
      tldr.push(`${urgent.length} deadline${urgent.length > 1 ? 's' : ''} in next 3 days`);
    }
  }
  if (newOpportunities.length > 0) {
    const highMatch = newOpportunities.filter(o => o.details?.includes('high'));
    tldr.push(`${newOpportunities.length} new opportunities${highMatch.length ? ` (${highMatch.length} high match)` : ''}`);
  }
  if (quickWins.length > 0) {
    tldr.push(`${quickWins.length} quick win${quickWins.length > 1 ? 's' : ''} ready to greenlight`);
  }
  if (contentProposals.length > 0) {
    tldr.push(`${contentProposals.length} content draft${contentProposals.length > 1 ? 's' : ''} to review`);
  }
  if (greenlit.length > 0) {
    tldr.push(`${greenlit.length} proposal${greenlit.length > 1 ? 's' : ''} in pipeline`);
  }
  if (anomalies.length > 0) {
    tldr.push(`${anomalies.length} system alert${anomalies.length > 1 ? 's' : ''}`);
  }
  if (revenue && revenue.total > 0) {
    tldr.push(`$${revenue.total.toFixed(0)} earned this month`);
  }

  // Ranked actions — what Simon should do first
  const actions = [];
  let rank = 1;

  // Urgent deadlines first
  for (const d of deadlines.slice(0, 3)) {
    const daysUntil = Math.ceil((new Date(d.date) - new Date()) / 86400000);
    if (daysUntil <= 7) {
      actions.push({
        rank: rank++,
        priority: daysUntil <= 3 ? 'urgent' : 'soon',
        action: d.source_type === 'gig' ? `Prepare for "${d.title}" (${d.detail || 'no venue'})` : `Submit for "${d.title}" on ${d.detail || 'platform'}`,
        date: d.date,
        type: d.source_type,
      });
    }
  }

  // Quick wins
  for (const p of quickWins.slice(0, 3)) {
    actions.push({
      rank: rank++,
      priority: 'quick-win',
      action: `Greenlight: ${p.title}`,
      proposal_id: p.id,
      domain: p.domain,
      effort: p.effort,
    });
  }

  // Content ready to post
  for (const p of contentProposals.slice(0, 2)) {
    actions.push({
      rank: rank++,
      priority: 'content',
      action: `Review & post: ${p.title}`,
      proposal_id: p.id,
    });
  }

  return {
    generated_at: new Date().toISOString(),

    // The headline: scan this in 10 seconds
    tldr,

    // Ranked action list: do these in order
    actions,

    // Money snapshot
    revenue: revenue ? {
      month_to_date: revenue.total,
      by_type: revenue.byType,
      upcoming_gigs: upcomingGigs.length,
    } : null,

    // Opportunities
    opportunities: {
      new_count: newOpportunities.length,
      items: newOpportunities.slice(0, 5).map(o => ({
        id: o.id, type: o.type, title: o.title, platform: o.platform, deadline: o.deadline,
      })),
    },

    // Deadlines
    deadlines: deadlines.slice(0, 10),

    // Strategy context
    latest_strategy: latestStrategy,

    // Proposals
    action_items: {
      quick_wins: quickWins,
      content_ready: contentProposals,
      in_pipeline: greenlit,
      needs_review: needsReview,
    },
    pending_proposals: pending,

    // System health
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
