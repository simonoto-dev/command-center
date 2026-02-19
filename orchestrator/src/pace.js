const VALID_PACES = ['full', 'slow', 'pause', 'stop'];
const VALID_MODES = ['awake', 'sleep'];

/**
 * Get the current pace from the database.
 * @param {import('better-sqlite3').Database} db
 * @returns {string}
 */
export function getPace(db) {
  const row = db.prepare("SELECT value FROM system_state WHERE key = 'pace'").get();
  return row.value;
}

/**
 * Set the pace in the database.
 * @param {import('better-sqlite3').Database} db
 * @param {string} pace - One of: full, slow, pause, stop
 */
export function setPace(db, pace) {
  if (!VALID_PACES.includes(pace)) {
    throw new Error(`Invalid pace: "${pace}". Must be one of: ${VALID_PACES.join(', ')}`);
  }
  db.prepare("UPDATE system_state SET value = ? WHERE key = 'pace'").run(pace);
}

/**
 * Get the current mode from the database.
 * @param {import('better-sqlite3').Database} db
 * @returns {string}
 */
export function getMode(db) {
  const row = db.prepare("SELECT value FROM system_state WHERE key = 'mode'").get();
  return row.value;
}

/**
 * Set the mode in the database.
 * @param {import('better-sqlite3').Database} db
 * @param {string} mode - One of: awake, sleep
 */
export function setMode(db, mode) {
  if (!VALID_MODES.includes(mode)) {
    throw new Error(`Invalid mode: "${mode}". Must be one of: ${VALID_MODES.join(', ')}`);
  }
  db.prepare("UPDATE system_state SET value = ? WHERE key = 'mode'").run(mode);
}
