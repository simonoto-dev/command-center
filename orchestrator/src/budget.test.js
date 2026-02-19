import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { createDb } from './db.js';
import {
  recordUsage,
  getUsage24h,
  getCeiling,
  setCeiling,
  getCostPerCall,
  setCostPerCall,
  isWithinBudget,
  getBudgetStatus,
} from './budget.js';

const TEST_DB = 'test-budget.db';

describe('budget enforcement', () => {
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

  describe('getCeiling / setCeiling', () => {
    it('should return default ceiling of 50', () => {
      assert.equal(getCeiling(db), 50);
    });

    it('should update the ceiling', () => {
      setCeiling(db, 100);
      assert.equal(getCeiling(db), 100);
    });

    it('should reject non-positive ceiling', () => {
      assert.throws(() => setCeiling(db, 0), /must be a positive number/);
      assert.throws(() => setCeiling(db, -5), /must be a positive number/);
    });

    it('should restore default for remaining tests', () => {
      setCeiling(db, 50);
      assert.equal(getCeiling(db), 50);
    });
  });

  describe('getCostPerCall / setCostPerCall', () => {
    it('should return default cost per call of 0.01', () => {
      assert.equal(getCostPerCall(db), 0.01);
    });

    it('should update cost per call', () => {
      setCostPerCall(db, 0.05);
      assert.equal(getCostPerCall(db), 0.05);
    });

    it('should reject negative cost', () => {
      assert.throws(() => setCostPerCall(db, -1), /must be a non-negative number/);
    });

    it('should restore default', () => {
      setCostPerCall(db, 0.01);
    });
  });

  describe('recordUsage / getUsage24h', () => {
    it('should start with zero usage', () => {
      const usage = getUsage24h(db);
      assert.equal(usage.totalCost, 0);
      assert.equal(usage.callCount, 0);
    });

    it('should record a usage entry', () => {
      recordUsage(db, {
        agent: 'openclaw:research@pi1',
        domain: 'glory-jams',
        node: 'pi1',
        cost: 0.01,
        durationMs: 5000,
      });
      const usage = getUsage24h(db);
      assert.equal(usage.callCount, 1);
      assert.equal(usage.totalCost, 0.01);
    });

    it('should accumulate multiple entries', () => {
      recordUsage(db, {
        agent: 'openclaw:draft@mac-mini',
        domain: 'music-career',
        node: 'mac-mini',
        cost: 0.02,
        durationMs: 8000,
      });
      const usage = getUsage24h(db);
      assert.equal(usage.callCount, 2);
      assert.ok(Math.abs(usage.totalCost - 0.03) < 0.001);
    });

    it('should not count entries older than 24h', () => {
      // Insert an old entry directly
      db.prepare(`
        INSERT INTO api_usage (agent, domain, node, cost, duration_ms, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now', '-25 hours'))
      `).run('old-agent', 'test', 'pi1', 1.00, 1000);

      const usage = getUsage24h(db);
      // Should still be 2 calls, 0.03 cost (old entry excluded)
      assert.equal(usage.callCount, 2);
      assert.ok(Math.abs(usage.totalCost - 0.03) < 0.001);
    });
  });

  describe('isWithinBudget', () => {
    it('should return true when under ceiling', () => {
      assert.equal(isWithinBudget(db), true);
    });

    it('should return false when at or over ceiling', () => {
      setCeiling(db, 0.03);
      assert.equal(isWithinBudget(db), false);
    });

    it('should return false when over ceiling', () => {
      setCeiling(db, 0.02);
      assert.equal(isWithinBudget(db), false);
    });

    it('should restore ceiling', () => {
      setCeiling(db, 50);
      assert.equal(isWithinBudget(db), true);
    });
  });

  describe('getBudgetStatus', () => {
    it('should return a complete budget status', () => {
      const status = getBudgetStatus(db);
      assert.equal(status.ceiling, 50);
      assert.equal(status.callCount, 2);
      assert.ok(Math.abs(status.spent - 0.03) < 0.001);
      assert.ok(Math.abs(status.remaining - 49.97) < 0.001);
      assert.equal(status.withinBudget, true);
      assert.ok(status.costPerCall === 0.01);
    });
  });
});
