import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from './db.js';
import {
  addRevenue, getRevenueSummary, getMonthlyTrend,
  addGig, listGigs, updateGig,
  addOpportunity, listOpportunities, updateOpportunity,
  getUpcomingDeadlines,
  upsertStream, listStreams, updateStream, analyzeStreams,
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

describe('revenue streams', () => {
  it('creates and lists streams', () => {
    upsertStream(db, { name: 'Private Lessons', type: 'lessons', status: 'active', monthly_estimate: 1500, monthly_goal: 2000, priority: 10 });
    upsertStream(db, { name: 'Streaming', type: 'streaming', status: 'active', monthly_estimate: 50, monthly_goal: 200, priority: 5 });

    const streams = listStreams(db);
    assert.equal(streams.length, 2);
    assert.equal(streams[0].name, 'Private Lessons'); // higher priority first
  });

  it('upserts existing stream by name+type', () => {
    upsertStream(db, { name: 'Lessons', type: 'lessons', monthly_estimate: 100, monthly_goal: 500 });
    upsertStream(db, { name: 'Lessons', type: 'lessons', monthly_estimate: 200 });

    const streams = listStreams(db);
    assert.equal(streams.length, 1);
    assert.equal(streams[0].monthly_estimate, 200);
    assert.equal(streams[0].monthly_goal, 500); // unchanged
  });

  it('filters by status', () => {
    upsertStream(db, { name: 'Active', type: 'lessons', status: 'active' });
    upsertStream(db, { name: 'Potential', type: 'merch', status: 'potential' });

    assert.equal(listStreams(db, { status: 'active' }).length, 1);
    assert.equal(listStreams(db, { status: 'potential' }).length, 1);
  });

  it('updates a stream by id', () => {
    const s = upsertStream(db, { name: 'Gigs', type: 'gigs', monthly_goal: 500 });
    const updated = updateStream(db, s.id, { monthly_estimate: 300, notes: 'Booked 3 this month' });
    assert.equal(updated.monthly_estimate, 300);
    assert.equal(updated.notes, 'Booked 3 this month');
  });

  it('returns null for unknown stream id', () => {
    assert.equal(updateStream(db, 999, { notes: 'nope' }), null);
  });
});

describe('stream analysis', () => {
  it('calculates gaps correctly', () => {
    upsertStream(db, { name: 'Lessons', type: 'lessons', status: 'active', monthly_estimate: 1200, monthly_goal: 2000 });
    upsertStream(db, { name: 'Streaming', type: 'streaming', status: 'active', monthly_estimate: 50, monthly_goal: 200 });
    upsertStream(db, { name: 'Sample Pack', type: 'merch', status: 'potential', monthly_goal: 300 });

    const analysis = analyzeStreams(db);
    assert.equal(analysis.summary.active_streams, 2);
    assert.equal(analysis.summary.potential_streams, 1);
    assert.equal(analysis.summary.monthly_estimate, 1250);
    assert.equal(analysis.summary.monthly_goal, 2200);
    assert.equal(analysis.summary.total_gap, 950);
    assert.equal(analysis.summary.potential_upside, 300);
    assert.equal(analysis.gaps.length, 2); // both active streams have gaps
    assert.equal(analysis.gaps[0].name, 'Lessons'); // biggest gap first
  });

  it('handles empty streams', () => {
    const analysis = analyzeStreams(db);
    assert.equal(analysis.summary.active_streams, 0);
    assert.equal(analysis.summary.total_gap, 0);
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
