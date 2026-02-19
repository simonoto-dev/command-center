import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { createDb } from './db.js';
import { setPace } from './pace.js';
import { getRecentLogs } from './audit.js';
import { callAgent, dispatch } from './openclaw.js';

const TEST_DB = 'test-openclaw.db';

describe('openclaw module', () => {

  describe('exports', () => {
    it('should export callAgent as a function', () => {
      assert.equal(typeof callAgent, 'function');
    });

    it('should export dispatch as a function', () => {
      assert.equal(typeof dispatch, 'function');
    });
  });

  describe('dispatch gating logic', () => {
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

    it('should block when pace is stop', async () => {
      setPace(db, 'stop');
      const result = await dispatch(db, {
        action: 'scan',
        domain: 'test-domain',
        message: 'Test scan prompt',
      });
      assert.equal(result.ok, false);
      assert.equal(result.allowed, false);
      assert.equal(result.response, null);
      assert.equal(result.error, 'Blocked by allowlist');
    });

    it('should log blocked actions to audit', async () => {
      // The previous test already dispatched a blocked action.
      // Verify it was logged.
      const logs = getRecentLogs(db, 5);
      const blocked = logs.find(
        (l) => l.agent.startsWith('openclaw:scan') && l.blocked === 1
      );
      assert.ok(blocked, 'should find a blocked audit log entry');
      assert.ok(
        blocked.detail.includes('Blocked by allowlist'),
        'detail should mention allowlist block'
      );
      assert.equal(blocked.domain, 'test-domain');
    });

    it('should use custom agentName in audit log', async () => {
      setPace(db, 'stop');
      await dispatch(db, {
        action: 'research',
        domain: 'career',
        message: 'Research job postings',
        agentName: 'custom-agent',
      });
      const logs = getRecentLogs(db, 5);
      const entry = logs.find(
        (l) => l.agent === 'custom-agent' && l.blocked === 1
      );
      assert.ok(entry, 'should find audit entry with custom agent name');
    });

    it('should block non-sleep-safe actions in sleep mode', async () => {
      const { setMode } = await import('./pace.js');
      setMode(db, 'sleep');
      setPace(db, 'full');
      const result = await dispatch(db, {
        action: 'deploy',
        domain: 'production',
        message: 'Deploy the app',
      });
      assert.equal(result.ok, false);
      assert.equal(result.allowed, false);
      // Reset mode for other tests
      setMode(db, 'awake');
    });
  });
});
