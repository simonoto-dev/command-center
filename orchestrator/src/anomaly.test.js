import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { createDb } from './db.js';
import { logAction } from './audit.js';
import { recordUsage } from './budget.js';
import { setPace, getPace } from './pace.js';
import {
  checkAnomalies,
  getAnomalyThresholds,
  setAnomalyThreshold,
} from './anomaly.js';

const TEST_DB = 'test-anomaly.db';

describe('anomaly detection', () => {
  let db;

  before(() => {
    db = createDb(TEST_DB);
    setPace(db, 'full');
  });

  after(() => {
    if (db) db.close();
    try { unlinkSync(TEST_DB); } catch {}
    try { unlinkSync(TEST_DB + '-wal'); } catch {}
    try { unlinkSync(TEST_DB + '-shm'); } catch {}
  });

  describe('getAnomalyThresholds / setAnomalyThreshold', () => {
    it('should return default thresholds', () => {
      const t = getAnomalyThresholds(db);
      assert.equal(t.maxCallsPerAgentPerHour, 20);
      assert.equal(t.maxConsecutiveFailures, 5);
    });

    it('should update a threshold', () => {
      setAnomalyThreshold(db, 'max_calls_per_agent_per_hour', 10);
      const t = getAnomalyThresholds(db);
      assert.equal(t.maxCallsPerAgentPerHour, 10);
    });

    it('should reject non-positive value', () => {
      assert.throws(() => setAnomalyThreshold(db, 'max_calls_per_agent_per_hour', 0), /must be a positive integer/);
    });

    it('should reject unknown threshold key', () => {
      assert.throws(() => setAnomalyThreshold(db, 'fake_key', 5), /Unknown threshold/);
    });

    it('should restore defaults', () => {
      setAnomalyThreshold(db, 'max_calls_per_agent_per_hour', 20);
    });
  });

  describe('checkAnomalies — excessive calls', () => {
    it('should return no anomalies when usage is normal', () => {
      const result = checkAnomalies(db);
      assert.equal(result.anomalies.length, 0);
      assert.equal(result.autoPaused, false);
    });

    it('should detect excessive calls from a single agent', () => {
      // Set threshold low for testing
      setAnomalyThreshold(db, 'max_calls_per_agent_per_hour', 3);

      // Record 4 calls from the same agent
      for (let i = 0; i < 4; i++) {
        recordUsage(db, {
          agent: 'openclaw:research@pi1',
          domain: 'test',
          node: 'pi1',
          cost: 0.01,
          durationMs: 1000,
        });
      }

      const result = checkAnomalies(db);
      assert.ok(result.anomalies.length > 0);
      assert.ok(result.anomalies.some(a => a.type === 'excessive_calls'));
      assert.equal(result.autoPaused, true);
      assert.equal(getPace(db), 'pause');
    });

    it('should restore pace for remaining tests', () => {
      setPace(db, 'full');
      setAnomalyThreshold(db, 'max_calls_per_agent_per_hour', 20);
    });
  });

  describe('checkAnomalies — consecutive failures', () => {
    it('should detect consecutive blocked actions', () => {
      setAnomalyThreshold(db, 'max_consecutive_failures', 3);

      // Log 4 consecutive blocked actions from same agent
      for (let i = 0; i < 4; i++) {
        logAction(db, {
          agent: 'rogue-agent',
          action: 'deploy',
          domain: 'test',
          detail: `Blocked attempt ${i + 1}`,
          blocked: true,
        });
      }

      const result = checkAnomalies(db);
      assert.ok(result.anomalies.some(a => a.type === 'consecutive_failures'));
      assert.equal(result.autoPaused, true);
    });

    it('should restore for cleanup', () => {
      setPace(db, 'full');
      setAnomalyThreshold(db, 'max_consecutive_failures', 5);
    });
  });
});
