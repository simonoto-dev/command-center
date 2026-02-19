import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from './db.js';
import { createProposal } from './proposals.js';
import { logAction } from './audit.js';
import { generateBrief } from './brief.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = './test-brief.db';

describe('Morning brief', () => {
  let db;

  before(() => {
    db = createDb(TEST_DB);
    createProposal(db, { domain: 'glory-jams', title: 'Expand to Portland', body: 'Traffic spike from Portland.', effort: 'medium', recommendation: 'research-more', source: 'test' });
    createProposal(db, { domain: 'infrastructure', title: 'Renew SSL cert', body: 'Expires in 14 days.', effort: 'low', recommendation: 'greenlight', source: 'test' });
    logAction(db, { agent: 'scan:health', action: 'scan', domain: 'glory-jams', detail: 'Health check: OK' });
    logAction(db, { agent: 'scan:deps', action: 'scan', domain: 'glory-jams', detail: '2 outdated dependencies found' });
  });

  after(() => { db.close(); try { unlinkSync(TEST_DB); } catch {} });

  it('generates a brief with proposals and activity', () => {
    const brief = generateBrief(db);
    assert.equal(brief.pending_proposals.length, 2);
    assert.ok(brief.overnight_activity.length > 0);
    assert.ok(brief.generated_at);
  });

  it('sorts greenlight recommendations first', () => {
    const brief = generateBrief(db);
    assert.equal(brief.pending_proposals[0].title, 'Renew SSL cert');
  });

  it('includes summary stats', () => {
    const brief = generateBrief(db);
    assert.equal(brief.summary.total_pending, 2);
    assert.equal(brief.summary.total_activity, 2);
    assert.equal(brief.summary.blocked_actions, 0);
  });

  it('counts blocked actions in summary', () => {
    logAction(db, { agent: 'test', action: 'deploy', domain: 'test', detail: 'Blocked', blocked: true });
    const brief = generateBrief(db);
    assert.equal(brief.summary.blocked_actions, 1);
  });
});
