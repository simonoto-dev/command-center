import Database from 'better-sqlite3';

/**
 * Create and initialize the orchestrator SQLite database.
 * @param {string} path - File path for the SQLite database
 * @returns {import('better-sqlite3').Database} The initialized database instance
 */
export function createDb(path) {
  const db = new Database(path);

  // Enable WAL mode and foreign keys
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS proposals (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      domain          TEXT NOT NULL,
      title           TEXT NOT NULL,
      body            TEXT NOT NULL,
      effort          TEXT NOT NULL,
      recommendation  TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      source          TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at     TEXT,
      resolution_note TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      agent     TEXT NOT NULL,
      action    TEXT NOT NULL,
      domain    TEXT NOT NULL,
      detail    TEXT,
      blocked   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS scan_results (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      scanner    TEXT NOT NULL,
      domain     TEXT NOT NULL,
      finding    TEXT NOT NULL,
      severity   TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      consumed   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS api_usage (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      agent      TEXT NOT NULL,
      domain     TEXT NOT NULL,
      node       TEXT NOT NULL DEFAULT 'pi1',
      cost       REAL NOT NULL DEFAULT 0.0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Insert default system_state values (only if not already present)
  const insertDefault = db.prepare(
    'INSERT OR IGNORE INTO system_state (key, value) VALUES (?, ?)'
  );

  const defaults = db.transaction(() => {
    insertDefault.run('pace', 'pause');
    insertDefault.run('mode', 'awake');
    insertDefault.run('sleep_start', '23:00');
    insertDefault.run('sleep_end', '08:00');
    insertDefault.run('budget_ceiling', '50');
    insertDefault.run('budget_cost_per_call', '0.01');
  });

  defaults();

  return db;
}
