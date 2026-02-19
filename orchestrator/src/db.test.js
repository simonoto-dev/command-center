import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from './db.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = 'test-db.db';

describe('createDb', () => {
  let db;

  after(() => {
    if (db) db.close();
    try { unlinkSync(TEST_DB); } catch {}
    try { unlinkSync(TEST_DB + '-wal'); } catch {}
    try { unlinkSync(TEST_DB + '-shm'); } catch {}
  });

  it('should create a database and return an instance', () => {
    db = createDb(TEST_DB);
    assert.ok(db, 'db instance should be truthy');
  });

  it('should set WAL mode', () => {
    db = createDb(TEST_DB);
    const row = db.prepare('PRAGMA journal_mode').get();
    assert.equal(row.journal_mode, 'wal');
  });

  it('should have foreign keys enabled', () => {
    db = createDb(TEST_DB);
    const row = db.prepare('PRAGMA foreign_keys').get();
    assert.equal(row.foreign_keys, 1);
  });

  it('should have system_state table with default pace=pause', () => {
    db = createDb(TEST_DB);
    const row = db.prepare("SELECT value FROM system_state WHERE key = 'pace'").get();
    assert.ok(row, 'pace row should exist');
    assert.equal(row.value, 'pause');
  });

  it('should have system_state defaults for mode, sleep_start, sleep_end', () => {
    db = createDb(TEST_DB);
    const mode = db.prepare("SELECT value FROM system_state WHERE key = 'mode'").get();
    assert.equal(mode.value, 'awake');

    const start = db.prepare("SELECT value FROM system_state WHERE key = 'sleep_start'").get();
    assert.equal(start.value, '23:00');

    const end = db.prepare("SELECT value FROM system_state WHERE key = 'sleep_end'").get();
    assert.equal(end.value, '08:00');
  });

  it('should have proposals table', () => {
    db = createDb(TEST_DB);
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='proposals'").get();
    assert.ok(info, 'proposals table should exist');
  });

  it('should have audit_log table', () => {
    db = createDb(TEST_DB);
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'").get();
    assert.ok(info, 'audit_log table should exist');
  });

  it('should have scan_results table', () => {
    db = createDb(TEST_DB);
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scan_results'").get();
    assert.ok(info, 'scan_results table should exist');
  });

  it('should have api_usage table', () => {
    db = createDb(TEST_DB);
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='api_usage'").get();
    assert.ok(info, 'api_usage table should exist');
  });

  it('should have budget defaults in system_state', () => {
    db = createDb(TEST_DB);
    const ceiling = db.prepare("SELECT value FROM system_state WHERE key = 'budget_ceiling'").get();
    assert.equal(ceiling.value, '50');

    const costPerCall = db.prepare("SELECT value FROM system_state WHERE key = 'budget_cost_per_call'").get();
    assert.equal(costPerCall.value, '0.01');
  });
});
