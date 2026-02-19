import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { createDb } from './db.js';
import { setMode, getMode } from './pace.js';
import {
  getSchedule,
  setSchedule,
  isInSleepWindow,
  tick,
} from './sleep-scheduler.js';

const TEST_DB = 'test-sleep-scheduler.db';

describe('sleep scheduler', () => {
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

  describe('getSchedule / setSchedule', () => {
    it('should return default schedule', () => {
      const { sleepStart, sleepEnd } = getSchedule(db);
      assert.equal(sleepStart, '23:00');
      assert.equal(sleepEnd, '08:00');
    });

    it('should update the schedule', () => {
      setSchedule(db, '22:00', '07:00');
      const { sleepStart, sleepEnd } = getSchedule(db);
      assert.equal(sleepStart, '22:00');
      assert.equal(sleepEnd, '07:00');
    });

    it('should reject invalid time format', () => {
      assert.throws(() => setSchedule(db, 'abc', '07:00'), /Invalid sleep_start/);
      assert.throws(() => setSchedule(db, '22:00', '7pm'), /Invalid sleep_end/);
    });

    it('should restore default for remaining tests', () => {
      setSchedule(db, '23:00', '08:00');
      const { sleepStart, sleepEnd } = getSchedule(db);
      assert.equal(sleepStart, '23:00');
      assert.equal(sleepEnd, '08:00');
    });
  });

  describe('isInSleepWindow', () => {
    it('should detect time inside overnight window', () => {
      // Window: 23:00 - 08:00
      assert.equal(isInSleepWindow('23:00', '23:00', '08:00'), true);
      assert.equal(isInSleepWindow('23:30', '23:00', '08:00'), true);
      assert.equal(isInSleepWindow('00:00', '23:00', '08:00'), true);
      assert.equal(isInSleepWindow('03:00', '23:00', '08:00'), true);
      assert.equal(isInSleepWindow('07:59', '23:00', '08:00'), true);
    });

    it('should detect time outside overnight window', () => {
      assert.equal(isInSleepWindow('08:00', '23:00', '08:00'), false);
      assert.equal(isInSleepWindow('08:01', '23:00', '08:00'), false);
      assert.equal(isInSleepWindow('12:00', '23:00', '08:00'), false);
      assert.equal(isInSleepWindow('22:59', '23:00', '08:00'), false);
    });

    it('should handle same-day window', () => {
      // Window: 01:00 - 06:00
      assert.equal(isInSleepWindow('01:00', '01:00', '06:00'), true);
      assert.equal(isInSleepWindow('03:00', '01:00', '06:00'), true);
      assert.equal(isInSleepWindow('05:59', '01:00', '06:00'), true);
      assert.equal(isInSleepWindow('06:00', '01:00', '06:00'), false);
      assert.equal(isInSleepWindow('00:59', '01:00', '06:00'), false);
      assert.equal(isInSleepWindow('12:00', '01:00', '06:00'), false);
    });
  });

  describe('tick', () => {
    it('should transition to sleep when in sleep window and awake', () => {
      setMode(db, 'awake');
      // 2am should be in sleep window (23:00-08:00)
      const changed = tick(db, new Date('2026-02-19T02:00:00'));
      assert.equal(changed, true);
      assert.equal(getMode(db), 'sleep');
    });

    it('should not transition when already in correct mode', () => {
      // Already sleep from previous test, still in sleep window
      const changed = tick(db, new Date('2026-02-19T03:00:00'));
      assert.equal(changed, false);
      assert.equal(getMode(db), 'sleep');
    });

    it('should transition to awake when outside sleep window and sleeping', () => {
      setMode(db, 'sleep');
      // 10am should be outside sleep window
      const changed = tick(db, new Date('2026-02-19T10:00:00'));
      assert.equal(changed, true);
      assert.equal(getMode(db), 'awake');
    });

    it('should not transition when already awake outside sleep window', () => {
      const changed = tick(db, new Date('2026-02-19T12:00:00'));
      assert.equal(changed, false);
      assert.equal(getMode(db), 'awake');
    });

    it('should transition to sleep at boundary', () => {
      setMode(db, 'awake');
      const changed = tick(db, new Date('2026-02-19T23:00:00'));
      assert.equal(changed, true);
      assert.equal(getMode(db), 'sleep');
    });

    it('should transition to awake at boundary', () => {
      setMode(db, 'sleep');
      const changed = tick(db, new Date('2026-02-19T08:00:00'));
      assert.equal(changed, true);
      assert.equal(getMode(db), 'awake');
    });
  });
});
