import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { createDb } from './db.js';
import {
  addEntry,
  getEntries,
  getRecentEntries,
  getTopics,
  getReferences,
  pickNextTopic,
} from './dossier.js';

const TEST_DB = 'test-dossier.db';

describe('career dossier', () => {
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

  describe('getTopics / getReferences', () => {
    it('should load topics from career-topics.json', () => {
      const topics = getTopics();
      assert.ok(topics.length >= 6);
      assert.ok(topics[0].id);
      assert.ok(topics[0].topic);
      assert.ok(topics[0].category);
    });

    it('should load references from career-topics.json', () => {
      const refs = getReferences();
      assert.ok(refs.length >= 4);
      assert.ok(refs.some(r => r.name === 'Otis McDonald'));
    });
  });

  describe('addEntry / getEntries', () => {
    it('should add a dossier entry', () => {
      const entry = addEntry(db, {
        topicId: 'licensing-strategies',
        category: 'revenue',
        findings: 'Sync licensing platforms like Musicbed and Artlist offer non-exclusive deals with 50/50 splits.',
        relevance: 'high',
        source: 'agent:researcher',
      });
      assert.ok(entry.id);
      assert.equal(entry.topic_id, 'licensing-strategies');
      assert.equal(entry.relevance, 'high');
    });

    it('should get entries by topic', () => {
      const entries = getEntries(db, { topicId: 'licensing-strategies' });
      assert.equal(entries.length, 1);
      assert.ok(entries[0].findings.includes('Musicbed'));
    });

    it('should get entries by category', () => {
      addEntry(db, {
        topicId: 'revenue-diversification',
        category: 'revenue',
        findings: 'Sample pack sales can generate $500-2000/month for established producers.',
        relevance: 'medium',
        source: 'agent:researcher',
      });

      const entries = getEntries(db, { category: 'revenue' });
      assert.equal(entries.length, 2);
    });

    it('should get all entries without filters', () => {
      const entries = getEntries(db);
      assert.equal(entries.length, 2);
    });

    it('should respect limit', () => {
      const entries = getEntries(db, { limit: 1 });
      assert.equal(entries.length, 1);
    });
  });

  describe('getRecentEntries', () => {
    it('should return recent entries ordered by date descending', () => {
      const entries = getRecentEntries(db, 10);
      assert.equal(entries.length, 2);
      // Both entries exist — order by id desc (higher id = more recent insert)
      assert.ok(entries[0].id > entries[1].id);
    });
  });

  describe('pickNextTopic', () => {
    it('should pick a topic that has not been researched recently', () => {
      const topic = pickNextTopic(db);
      assert.ok(topic);
      assert.ok(topic.id);
      assert.ok(topic.topic);
      // Should not pick a topic we already have recent entries for
      assert.notEqual(topic.id, 'licensing-strategies');
      assert.notEqual(topic.id, 'revenue-diversification');
    });

    it('should eventually cycle through all topics', () => {
      const seen = new Set();
      for (let i = 0; i < 20; i++) {
        const t = pickNextTopic(db);
        if (t) seen.add(t.id);
      }
      // Should have picked at least a few different topics
      assert.ok(seen.size >= 3);
    });
  });
});
