import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from './db.js';
import { getPace, setPace, getMode, setMode } from './pace.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = 'test-pace.db';

describe('pace module', () => {
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

  describe('getPace / setPace', () => {
    it('should default to pause', () => {
      assert.equal(getPace(db), 'pause');
    });

    it('should set pace to full', () => {
      setPace(db, 'full');
      assert.equal(getPace(db), 'full');
    });

    it('should set pace to slow', () => {
      setPace(db, 'slow');
      assert.equal(getPace(db), 'slow');
    });

    it('should set pace to stop', () => {
      setPace(db, 'stop');
      assert.equal(getPace(db), 'stop');
    });

    it('should set pace back to pause', () => {
      setPace(db, 'pause');
      assert.equal(getPace(db), 'pause');
    });

    it('should reject invalid pace', () => {
      assert.throws(() => setPace(db, 'turbo'), /Invalid pace/);
    });

    it('should reject empty pace', () => {
      assert.throws(() => setPace(db, ''), /Invalid pace/);
    });
  });

  describe('getMode / setMode', () => {
    it('should default to awake', () => {
      assert.equal(getMode(db), 'awake');
    });

    it('should toggle to sleep', () => {
      setMode(db, 'sleep');
      assert.equal(getMode(db), 'sleep');
    });

    it('should toggle back to awake', () => {
      setMode(db, 'awake');
      assert.equal(getMode(db), 'awake');
    });

    it('should reject invalid mode', () => {
      assert.throws(() => setMode(db, 'nap'), /Invalid mode/);
    });

    it('should reject empty mode', () => {
      assert.throws(() => setMode(db, ''), /Invalid mode/);
    });
  });
});
