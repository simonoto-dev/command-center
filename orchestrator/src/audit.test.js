import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from './db.js';
import { logAction, getRecentLogs } from './audit.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = 'test-audit.db';

describe('audit module', () => {
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

  it('should log an allowed action (blocked=0)', () => {
    const entry = logAction(db, {
      agent: 'scout-agent',
      action: 'scan',
      domain: 'infrastructure',
      detail: 'Scanned npm packages for vulnerabilities',
      blocked: false,
    });
    assert.ok(entry.id, 'should have an id');
    assert.equal(entry.agent, 'scout-agent');
    assert.equal(entry.action, 'scan');
    assert.equal(entry.domain, 'infrastructure');
    assert.equal(entry.blocked, 0);
    assert.ok(entry.timestamp, 'should have a timestamp');
  });

  it('should log a blocked action (blocked=1)', () => {
    const entry = logAction(db, {
      agent: 'deploy-agent',
      action: 'deploy',
      domain: 'production',
      detail: 'Attempted production deploy during sleep mode',
      blocked: true,
    });
    assert.ok(entry.id, 'should have an id');
    assert.equal(entry.agent, 'deploy-agent');
    assert.equal(entry.action, 'deploy');
    assert.equal(entry.blocked, 1);
  });

  it('should log action with detail as null', () => {
    const entry = logAction(db, {
      agent: 'test-agent',
      action: 'test',
      domain: 'testing',
      detail: null,
      blocked: false,
    });
    assert.ok(entry.id);
    assert.equal(entry.detail, null);
    assert.equal(entry.blocked, 0);
  });

  it('should get recent logs in DESC order', () => {
    const logs = getRecentLogs(db, 10);
    assert.ok(logs.length >= 3, 'should have at least 3 log entries');
    // Most recent should be first (highest id)
    assert.ok(logs[0].id > logs[1].id, 'first log should have higher id (more recent)');
  });

  it('should respect limit parameter', () => {
    const logs = getRecentLogs(db, 1);
    assert.equal(logs.length, 1);
  });

  it('should default blocked to 0 when not provided', () => {
    const entry = logAction(db, {
      agent: 'misc-agent',
      action: 'analyze',
      domain: 'general',
      detail: 'Running analysis',
    });
    assert.equal(entry.blocked, 0);
  });
});
