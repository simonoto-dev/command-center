import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from './db.js';
import {
  addRevenue, getRevenueSummary, getMonthlyTrend,
  addGig, listGigs, updateGig,
  addOpportunity, listOpportunities, updateOpportunity,
  getUpcomingDeadlines,
} from './revenue.js';

let db;

beforeEach(() => {
  db = createDb(':memory:');
});

describe('revenue', () => {
  it('adds and summarizes revenue', () => {
    addRevenue(db, { type: 'lessons', amount: 50, description: 'Guitar lesson', date: '2026-02-20' });
    addRevenue(db, { type: 'lessons', amount: 50, description: 'Guitar lesson', date: '2026-02-21' });
    addRevenue(db, { type: 'gigs', amount: 200, description: 'Bar gig', date: '2026-02-22' });

    const summary = getRevenueSummary(db, '2026-02-01');
    assert.equal(summary.total, 300);
    assert.equal(summary.byType.lessons, 100);
    assert.equal(summary.byType.gigs, 200);
    assert.equal(summary.entries.length, 3);
  });

  it('returns empty summary when no revenue', () => {
    const summary = getRevenueSummary(db, '2026-02-01');
    assert.equal(summary.total, 0);
    assert.equal(summary.entries.length, 0);
  });

  it('tracks monthly trends', () => {
    addRevenue(db, { type: 'lessons', amount: 400, description: 'Feb lessons', date: '2026-02-15' });
    addRevenue(db, { type: 'lessons', amount: 350, description: 'Jan lessons', date: '2026-01-15' });

    const trend = getMonthlyTrend(db, 3);
    assert.ok(trend.length >= 1);
  });
});

describe('gigs', () => {
  it('adds and lists gigs', () => {
    addGig(db, { title: 'Jazz Night', venue: 'Blue Note', date: '2026-03-15', pay: 150 });
    addGig(db, { title: 'Open Mic', venue: 'Cafe', date: '2026-03-20' });

    const gigs = listGigs(db);
    assert.equal(gigs.length, 2);
    assert.equal(gigs[0].title, 'Open Mic'); // newest first
  });

  it('updates gig status', () => {
    const gig = addGig(db, { title: 'Session', venue: 'Studio', date: '2026-02-20', pay: 100 });
    const updated = updateGig(db, gig.id, { status: 'completed' });
    assert.equal(updated.status, 'completed');
  });

  it('filters by status', () => {
    addGig(db, { title: 'Past', date: '2026-01-01', status: 'completed' });
    addGig(db, { title: 'Future', date: '2026-03-01' });

    assert.equal(listGigs(db, { status: 'upcoming' }).length, 1);
    assert.equal(listGigs(db, { status: 'completed' }).length, 1);
  });
});

describe('opportunities', () => {
  it('adds and lists opportunities', () => {
    addOpportunity(db, {
      type: 'sync-licensing',
      title: 'Songtradr Brief: Upbeat Funk',
      platform: 'Songtradr',
      deadline: '2026-03-01',
      details: 'Looking for upbeat funk tracks, 2-3 min',
    });

    const opps = listOpportunities(db);
    assert.equal(opps.length, 1);
    assert.equal(opps[0].type, 'sync-licensing');
    assert.equal(opps[0].status, 'new');
  });

  it('updates opportunity status', () => {
    const opp = addOpportunity(db, {
      type: 'grant',
      title: 'Artist grant',
      deadline: '2026-04-01',
    });
    const updated = updateOpportunity(db, opp.id, { status: 'applied' });
    assert.equal(updated.status, 'applied');
  });

  it('filters by type', () => {
    addOpportunity(db, { type: 'sync-licensing', title: 'Sync 1' });
    addOpportunity(db, { type: 'grant', title: 'Grant 1' });

    assert.equal(listOpportunities(db, { type: 'sync-licensing' }).length, 1);
    assert.equal(listOpportunities(db, { type: 'grant' }).length, 1);
  });
});

describe('upcoming deadlines', () => {
  it('combines gigs and opportunities', () => {
    // Use dates relative to now to ensure they're in the future window
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    addGig(db, { title: 'Upcoming Gig', date: tomorrow, venue: 'Club' });
    addOpportunity(db, { type: 'sync-licensing', title: 'Brief deadline', deadline: nextWeek });

    const deadlines = getUpcomingDeadlines(db, 14);
    assert.equal(deadlines.length, 2);
    assert.equal(deadlines[0].source_type, 'gig');
    assert.equal(deadlines[1].source_type, 'opportunity');
  });
});
