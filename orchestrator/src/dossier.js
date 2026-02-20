/**
 * Career intelligence dossier module.
 *
 * Maintains the "living dossier" — a continuously updated understanding
 * of the producer/musician landscape. Stores research findings and
 * rotates through research topics for overnight agents.
 */

import { readFileSync } from 'node:fs';

let _careerData = null;

function loadCareerData() {
  if (!_careerData) {
    _careerData = JSON.parse(
      readFileSync(new URL('../career-topics.json', import.meta.url), 'utf-8'),
    );
  }
  return _careerData;
}

/**
 * Get all research topics.
 * @returns {Array<{id: string, category: string, topic: string, frequency: string}>}
 */
export function getTopics() {
  return loadCareerData().topics;
}

/**
 * Get reference artists/producers.
 * @returns {Array<{name: string, role: string, note: string}>}
 */
export function getReferences() {
  return loadCareerData().references;
}

/**
 * Add a research finding to the dossier.
 * @param {import('better-sqlite3').Database} db
 * @param {object} opts
 * @param {string} opts.topicId - Topic ID from career-topics.json
 * @param {string} opts.category - Category (revenue, distribution, growth, trends, project)
 * @param {string} opts.findings - The research findings text
 * @param {string} [opts.relevance] - Relevance: high, medium, low
 * @param {string} [opts.source] - Source agent/tool
 * @returns {object} The created entry
 */
export function addEntry(db, { topicId, category, findings, relevance, source }) {
  const result = db.prepare(`
    INSERT INTO dossier_entries (topic_id, category, findings, relevance, source)
    VALUES (?, ?, ?, ?, ?)
  `).run(topicId, category, findings, relevance || 'medium', source || 'agent');
  return db.prepare('SELECT * FROM dossier_entries WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * Get dossier entries, optionally filtered.
 * @param {import('better-sqlite3').Database} db
 * @param {object} [opts]
 * @param {string} [opts.topicId] - Filter by topic ID
 * @param {string} [opts.category] - Filter by category
 * @param {number} [opts.limit] - Max entries to return
 * @returns {object[]}
 */
export function getEntries(db, opts = {}) {
  let sql = 'SELECT * FROM dossier_entries WHERE 1=1';
  const params = [];
  if (opts.topicId) { sql += ' AND topic_id = ?'; params.push(opts.topicId); }
  if (opts.category) { sql += ' AND category = ?'; params.push(opts.category); }
  sql += ' ORDER BY created_at DESC';
  if (opts.limit) { sql += ' LIMIT ?'; params.push(opts.limit); }
  return db.prepare(sql).all(...params);
}

/**
 * Get the most recent dossier entries.
 * @param {import('better-sqlite3').Database} db
 * @param {number} [limit=20]
 * @returns {object[]}
 */
export function getRecentEntries(db, limit = 20) {
  return db.prepare('SELECT * FROM dossier_entries ORDER BY created_at DESC, id DESC LIMIT ?').all(limit);
}

/**
 * Pick the next research topic to investigate.
 * Favors topics that haven't been researched recently.
 * @param {import('better-sqlite3').Database} db
 * @returns {object|null} A topic from career-topics.json, or null if all recently covered
 */
export function pickNextTopic(db) {
  const topics = getTopics();

  // Get the most recent entry per topic (last 7 days)
  const recentByTopic = db.prepare(`
    SELECT topic_id, MAX(created_at) AS last_researched
    FROM dossier_entries
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY topic_id
  `).all();

  const recentSet = new Set(recentByTopic.map(r => r.topic_id));

  // First pass: find topics not researched in the last 7 days
  const unresearched = topics.filter(t => !recentSet.has(t.id));
  if (unresearched.length > 0) {
    // Pick a random one from the unresearched set
    return unresearched[Math.floor(Math.random() * unresearched.length)];
  }

  // All topics researched recently — pick the one researched longest ago
  const oldest = recentByTopic.sort((a, b) => a.last_researched.localeCompare(b.last_researched));
  if (oldest.length > 0) {
    return topics.find(t => t.id === oldest[0].topic_id) || topics[0];
  }

  // Fallback: random topic
  return topics[Math.floor(Math.random() * topics.length)];
}
