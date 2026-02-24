/**
 * Revenue and gig tracking module.
 *
 * Tracks income streams: lessons, gigs, licensing, streaming, merch.
 * Also manages gig calendar and sync licensing opportunities.
 */

// --- Revenue ---

/**
 * Log a revenue entry.
 * @param {import('better-sqlite3').Database} db
 * @param {object} opts
 * @param {string} opts.type - Revenue type: lessons, gigs, licensing, streaming, merch, other
 * @param {number} opts.amount - Amount in dollars
 * @param {string} opts.description - What this is for
 * @param {string} opts.date - Date of revenue (YYYY-MM-DD)
 * @param {boolean} [opts.recurring] - Is this recurring?
 * @param {string} [opts.source] - Source: manual, api, agent
 */
export function addRevenue(db, { type, amount, description, date, recurring, source }) {
  const result = db.prepare(`
    INSERT INTO revenue (type, amount, description, date, recurring, source)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(type, amount, description, date, recurring ? 1 : 0, source || 'manual');
  return db.prepare('SELECT * FROM revenue WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * Get revenue summary for a period.
 * @param {import('better-sqlite3').Database} db
 * @param {string} [since] - Start date (YYYY-MM-DD), defaults to start of current month
 * @returns {{ total: number, byType: object, entries: object[] }}
 */
export function getRevenueSummary(db, since) {
  if (!since) {
    const now = new Date();
    since = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }

  const entries = db.prepare(`
    SELECT * FROM revenue WHERE date >= ? ORDER BY date DESC
  `).all(since);

  const byType = {};
  let total = 0;
  for (const e of entries) {
    total += e.amount;
    byType[e.type] = (byType[e.type] || 0) + e.amount;
  }

  return { total, byType, entries, since };
}

/**
 * Get monthly revenue totals for trending.
 * @param {import('better-sqlite3').Database} db
 * @param {number} [months=6]
 */
export function getMonthlyTrend(db, months = 6) {
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', date) AS month,
           SUM(amount) AS total,
           COUNT(*) AS entries
    FROM revenue
    WHERE date >= date('now', '-' || ? || ' months')
    GROUP BY strftime('%Y-%m', date)
    ORDER BY month
  `).all(months);
  return rows;
}

// --- Gigs ---

/**
 * Add a gig to the calendar.
 * @param {import('better-sqlite3').Database} db
 * @param {object} opts
 */
export function addGig(db, { title, venue, date, pay, status, notes }) {
  const result = db.prepare(`
    INSERT INTO gigs (title, venue, date, pay, status, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, venue || null, date, pay || null, status || 'upcoming', notes || null);
  return db.prepare('SELECT * FROM gigs WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * List gigs, optionally filtered by status.
 * @param {import('better-sqlite3').Database} db
 * @param {object} [opts]
 */
export function listGigs(db, { status, limit } = {}) {
  let sql = 'SELECT * FROM gigs';
  const params = [];
  if (status) { sql += ' WHERE status = ?'; params.push(status); }
  sql += ' ORDER BY date DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(limit); }
  return db.prepare(sql).all(...params);
}

/**
 * Update gig status (upcoming -> completed/cancelled).
 */
export function updateGig(db, id, updates) {
  const gig = db.prepare('SELECT * FROM gigs WHERE id = ?').get(id);
  if (!gig) return null;
  const fields = [];
  const params = [];
  for (const [k, v] of Object.entries(updates)) {
    if (['title', 'venue', 'date', 'pay', 'status', 'notes'].includes(k)) {
      fields.push(`${k} = ?`);
      params.push(v);
    }
  }
  if (fields.length === 0) return gig;
  params.push(id);
  db.prepare(`UPDATE gigs SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return db.prepare('SELECT * FROM gigs WHERE id = ?').get(id);
}

// --- Opportunities (sync licensing, grants, etc.) ---

/**
 * Add an opportunity (from agent scanning or manual entry).
 */
export function addOpportunity(db, { type, title, platform, url, deadline, details, source }) {
  const result = db.prepare(`
    INSERT INTO opportunities (type, title, platform, url, deadline, details, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(type, title, platform || null, url || null, deadline || null, details || null, source || 'agent');
  return db.prepare('SELECT * FROM opportunities WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * List opportunities, newest first.
 */
export function listOpportunities(db, { type, status, limit } = {}) {
  let sql = 'SELECT * FROM opportunities WHERE 1=1';
  const params = [];
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(limit); }
  return db.prepare(sql).all(...params);
}

/**
 * Update opportunity status (new -> applied/passed/expired).
 */
export function updateOpportunity(db, id, updates) {
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);
  if (!opp) return null;
  const fields = [];
  const params = [];
  for (const [k, v] of Object.entries(updates)) {
    if (['status', 'details', 'notes'].includes(k)) {
      fields.push(`${k} = ?`);
      params.push(v);
    }
  }
  if (fields.length === 0) return opp;
  params.push(id);
  db.prepare(`UPDATE opportunities SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);
}

/**
 * Get upcoming deadlines across gigs and opportunities.
 */
export function getUpcomingDeadlines(db, days = 14) {
  const cutoff = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const gigs = db.prepare(`
    SELECT 'gig' AS source_type, title, date, venue AS detail
    FROM gigs WHERE date >= ? AND date <= ? AND status = 'upcoming'
    ORDER BY date
  `).all(today, cutoff);

  const opps = db.prepare(`
    SELECT 'opportunity' AS source_type, title, deadline AS date, platform AS detail
    FROM opportunities WHERE deadline >= ? AND deadline <= ? AND status = 'new'
    ORDER BY deadline
  `).all(today, cutoff);

  return [...gigs, ...opps].sort((a, b) => a.date.localeCompare(b.date));
}
