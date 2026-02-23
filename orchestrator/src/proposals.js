const VALID_RESOLUTIONS = ['greenlit', 'modified', 'rejected', 'shelved', 'expired', 'shipped'];

/**
 * Check if a similar proposal already exists (pending or greenlit) for the same domain.
 * Uses case-insensitive title comparison to catch duplicates like
 * "Add favicon" vs "Add Favicon" or exact repeats across scan cycles.
 * @param {import('better-sqlite3').Database} db
 * @param {string} domain
 * @param {string} title
 * @returns {object|null} The existing proposal, or null
 */
export function findDuplicate(db, domain, title) {
  return db.prepare(`
    SELECT * FROM proposals
    WHERE domain = ? AND LOWER(title) = LOWER(?) AND status IN ('pending', 'greenlit')
    ORDER BY created_at DESC
    LIMIT 1
  `).get(domain, title) || null;
}

/**
 * Create a new proposal. Returns the existing proposal if a duplicate
 * (same domain + title, still pending/greenlit) already exists.
 * @param {import('better-sqlite3').Database} db
 * @param {object} opts
 * @param {string} opts.domain
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} opts.effort
 * @param {string} opts.recommendation
 * @param {string} opts.source
 * @returns {{ proposal: object, deduplicated: boolean }|object} The proposal row (with deduplicated flag if caller checks, or just the row for backwards compat)
 */
export function createProposal(db, { domain, title, body, effort, recommendation, source }) {
  // Dedup: skip insert if a pending/greenlit proposal with the same domain+title exists
  const existing = findDuplicate(db, domain, title);
  if (existing) {
    existing._deduplicated = true;
    return existing;
  }

  const stmt = db.prepare(`
    INSERT INTO proposals (domain, title, body, effort, recommendation, source)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(domain, title, body, effort, recommendation, source);
  return db.prepare('SELECT * FROM proposals WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * List proposals with optional filters.
 * @param {import('better-sqlite3').Database} db
 * @param {object} opts
 * @param {string} [opts.status] - Filter by status
 * @param {string} [opts.domain] - Filter by domain
 * @param {number} [opts.limit] - Max results to return
 * @returns {object[]} Array of proposal rows, DESC by created_at
 */
export function listProposals(db, { status, domain, limit } = {}) {
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (domain) {
    conditions.push('domain = ?');
    params.push(domain);
  }

  let sql = 'SELECT * FROM proposals';
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY created_at DESC';
  if (limit) {
    sql += ' LIMIT ?';
    params.push(limit);
  }

  return db.prepare(sql).all(...params);
}

/**
 * Resolve a proposal with a status and optional note.
 * @param {import('better-sqlite3').Database} db
 * @param {number} id - Proposal ID
 * @param {string} status - One of: greenlit, modified, rejected, shelved, expired
 * @param {string} note - Resolution note
 * @returns {object} The updated proposal row
 */
export function resolveProposal(db, id, status, note) {
  if (!VALID_RESOLUTIONS.includes(status)) {
    throw new Error(
      `Invalid resolution status: "${status}". Must be one of: ${VALID_RESOLUTIONS.join(', ')}`
    );
  }

  db.prepare(`
    UPDATE proposals
    SET status = ?, resolution_note = ?, resolved_at = datetime('now')
    WHERE id = ?
  `).run(status, note, id);

  return db.prepare('SELECT * FROM proposals WHERE id = ?').get(id);
}
