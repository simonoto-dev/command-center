import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from './db.js';
import { createProposal, listProposals, resolveProposal, findDuplicate } from './proposals.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = 'test-proposals.db';

describe('proposals module', () => {
  let db;

  before(() => {
    db = createDb(TEST_DB);
  });

  after(() => {
    if (db) db.close();
    try { unlinkSync(TEST_DB); } catch {}
    try { unlinkSync(TEST_DB + '-wal'); } catch {}
    try { unlinkSync(TEST_DB + '-shm'); } catch {}
  });

  it('should create a proposal and return it with an id', () => {
    const proposal = createProposal(db, {
      domain: 'infrastructure',
      title: 'Set up CI/CD pipeline',
      body: 'We need automated testing and deployment.',
      effort: 'medium',
      recommendation: 'greenlight',
      source: 'scout-agent',
    });
    assert.ok(proposal.id, 'should have an id');
    assert.equal(proposal.domain, 'infrastructure');
    assert.equal(proposal.title, 'Set up CI/CD pipeline');
    assert.equal(proposal.status, 'pending');
    assert.ok(proposal.created_at, 'should have created_at');
  });

  it('should list pending proposals', () => {
    const pending = listProposals(db, { status: 'pending' });
    assert.ok(pending.length >= 1, 'should have at least one pending proposal');
    assert.equal(pending[0].status, 'pending');
  });

  it('should list proposals by domain', () => {
    createProposal(db, {
      domain: 'design',
      title: 'Update color scheme',
      body: 'New brand colors needed.',
      effort: 'small',
      recommendation: 'greenlight',
      source: 'design-agent',
    });

    const infraOnly = listProposals(db, { domain: 'infrastructure' });
    assert.ok(infraOnly.every(p => p.domain === 'infrastructure'));

    const designOnly = listProposals(db, { domain: 'design' });
    assert.ok(designOnly.every(p => p.domain === 'design'));
  });

  it('should list proposals with limit', () => {
    const limited = listProposals(db, { limit: 1 });
    assert.equal(limited.length, 1);
  });

  it('should list proposals in DESC order by created_at', () => {
    const all = listProposals(db, {});
    if (all.length >= 2) {
      // Most recent first
      assert.ok(all[0].created_at >= all[1].created_at,
        'first item should be newer or same time as second');
    }
  });

  it('should resolve a proposal as greenlit', () => {
    const proposal = createProposal(db, {
      domain: 'testing',
      title: 'Add unit tests',
      body: 'Need comprehensive test coverage.',
      effort: 'large',
      recommendation: 'greenlight',
      source: 'qa-agent',
    });

    const resolved = resolveProposal(db, proposal.id, 'greenlit', 'Approved by Simon');
    assert.equal(resolved.status, 'greenlit');
    assert.equal(resolved.resolution_note, 'Approved by Simon');
    assert.ok(resolved.resolved_at, 'should have resolved_at');
  });

  it('should verify pending list is empty for resolved proposals', () => {
    // All "testing" domain proposals should be resolved
    const testingPending = listProposals(db, { status: 'pending', domain: 'testing' });
    assert.equal(testingPending.length, 0, 'no pending testing proposals after resolution');
  });

  it('should resolve as modified', () => {
    const p = createProposal(db, {
      domain: 'ops',
      title: 'Migrate database',
      body: 'Move to new server.',
      effort: 'large',
      recommendation: 'defer',
      source: 'ops-agent',
    });
    const resolved = resolveProposal(db, p.id, 'modified', 'Adjusted scope');
    assert.equal(resolved.status, 'modified');
  });

  it('should resolve as rejected', () => {
    const p = createProposal(db, {
      domain: 'ops',
      title: 'Buy new servers',
      body: 'Expensive hardware.',
      effort: 'xlarge',
      recommendation: 'reject',
      source: 'ops-agent',
    });
    const resolved = resolveProposal(db, p.id, 'rejected', 'Too expensive');
    assert.equal(resolved.status, 'rejected');
  });

  it('should resolve as shelved', () => {
    const p = createProposal(db, {
      domain: 'ops',
      title: 'Research quantum computing',
      body: 'Future tech.',
      effort: 'xlarge',
      recommendation: 'defer',
      source: 'research-agent',
    });
    const resolved = resolveProposal(db, p.id, 'shelved', 'Not a priority now');
    assert.equal(resolved.status, 'shelved');
  });

  it('should resolve as expired', () => {
    const p = createProposal(db, {
      domain: 'ops',
      title: 'Fix old bug',
      body: 'No longer reproducible.',
      effort: 'small',
      recommendation: 'greenlight',
      source: 'qa-agent',
    });
    const resolved = resolveProposal(db, p.id, 'expired', 'Issue no longer relevant');
    assert.equal(resolved.status, 'expired');
  });

  it('should reject invalid resolution status', () => {
    const p = createProposal(db, {
      domain: 'test',
      title: 'Test invalid',
      body: 'Test.',
      effort: 'small',
      recommendation: 'greenlight',
      source: 'test-agent',
    });
    assert.throws(
      () => resolveProposal(db, p.id, 'yolo', 'bad status'),
      /Invalid resolution status/
    );
  });

  // --- Deduplication tests ---

  it('should deduplicate proposals with the same domain and title', () => {
    const first = createProposal(db, {
      domain: 'dedup-test',
      title: 'Add favicon',
      body: 'First body text',
      effort: 'small',
      recommendation: 'greenlight',
      source: 'scan-cycle-1',
    });

    const second = createProposal(db, {
      domain: 'dedup-test',
      title: 'Add favicon',
      body: 'Different body text from later scan',
      effort: 'small',
      recommendation: 'greenlight',
      source: 'scan-cycle-2',
    });

    assert.equal(first.id, second.id, 'should return the same proposal');
    assert.equal(second._deduplicated, true, 'should be flagged as deduplicated');
  });

  it('should deduplicate case-insensitively', () => {
    const first = createProposal(db, {
      domain: 'dedup-test-case',
      title: 'Fix Firestore rules',
      body: 'Allow authenticated users read access',
      effort: 'small',
      recommendation: 'greenlight',
      source: 'scan-cycle-1',
    });

    const second = createProposal(db, {
      domain: 'dedup-test-case',
      title: 'FIX Firestore rules',
      body: 'Different description',
      effort: 'small',
      recommendation: 'greenlight',
      source: 'scan-cycle-2',
    });

    assert.equal(first.id, second.id, 'should return same proposal despite case difference');
  });

  it('should NOT deduplicate across different domains', () => {
    const first = createProposal(db, {
      domain: 'domain-a',
      title: 'Add favicon',
      body: 'Favicon for domain A',
      effort: 'small',
      recommendation: 'greenlight',
      source: 'scan',
    });

    const second = createProposal(db, {
      domain: 'domain-b',
      title: 'Add favicon',
      body: 'Favicon for domain B',
      effort: 'small',
      recommendation: 'greenlight',
      source: 'scan',
    });

    assert.notEqual(first.id, second.id, 'different domains should create separate proposals');
  });

  it('should allow re-proposing after a proposal is shelved', () => {
    const first = createProposal(db, {
      domain: 'dedup-resolved',
      title: 'Investigate issue',
      body: 'First attempt',
      effort: 'small',
      recommendation: 'greenlight',
      source: 'scan-1',
    });

    // Shelve the first one
    resolveProposal(db, first.id, 'shelved', 'Not now');

    const second = createProposal(db, {
      domain: 'dedup-resolved',
      title: 'Investigate issue',
      body: 'Re-proposed after shelving',
      effort: 'small',
      recommendation: 'greenlight',
      source: 'scan-2',
    });

    assert.notEqual(first.id, second.id, 'should create a new proposal since original was resolved');
    assert.equal(second._deduplicated, undefined, 'should not be flagged as deduplicated');
  });

  it('should NOT deduplicate against greenlit proposals (still active)', () => {
    const first = createProposal(db, {
      domain: 'dedup-greenlit',
      title: 'Deploy update',
      body: 'First version',
      effort: 'small',
      recommendation: 'greenlight',
      source: 'scan-1',
    });

    resolveProposal(db, first.id, 'greenlit', 'Approved');

    const second = createProposal(db, {
      domain: 'dedup-greenlit',
      title: 'Deploy update',
      body: 'Re-proposed while greenlit',
      effort: 'small',
      recommendation: 'greenlight',
      source: 'scan-2',
    });

    assert.equal(first.id, second.id, 'should deduplicate against greenlit (still in pipeline)');
  });

  it('findDuplicate should return null when no match', () => {
    const result = findDuplicate(db, 'nonexistent-domain', 'Nonexistent title');
    assert.equal(result, null);
  });
});
