import { getMode, setMode } from './pace.js';
import { logAction } from './audit.js';

/**
 * Get the configured sleep schedule from the database.
 * @param {import('better-sqlite3').Database} db
 * @returns {{ sleepStart: string, sleepEnd: string }}
 */
export function getSchedule(db) {
  const start = db.prepare("SELECT value FROM system_state WHERE key = 'sleep_start'").get();
  const end = db.prepare("SELECT value FROM system_state WHERE key = 'sleep_end'").get();
  return { sleepStart: start.value, sleepEnd: end.value };
}

/**
 * Set the sleep schedule in the database.
 * @param {import('better-sqlite3').Database} db
 * @param {string} sleepStart - HH:MM format
 * @param {string} sleepEnd - HH:MM format
 */
export function setSchedule(db, sleepStart, sleepEnd) {
  if (!isValidTime(sleepStart)) throw new Error(`Invalid sleep_start: "${sleepStart}". Use HH:MM format.`);
  if (!isValidTime(sleepEnd)) throw new Error(`Invalid sleep_end: "${sleepEnd}". Use HH:MM format.`);
  db.prepare("UPDATE system_state SET value = ? WHERE key = 'sleep_start'").run(sleepStart);
  db.prepare("UPDATE system_state SET value = ? WHERE key = 'sleep_end'").run(sleepEnd);
}

/**
 * Check if a given HH:MM time falls within the sleep window.
 * Handles overnight windows (e.g., 23:00 - 08:00).
 * @param {string} timeStr - HH:MM format
 * @param {string} sleepStart - HH:MM format
 * @param {string} sleepEnd - HH:MM format
 * @returns {boolean}
 */
export function isInSleepWindow(timeStr, sleepStart, sleepEnd) {
  const t = toMinutes(timeStr);
  const start = toMinutes(sleepStart);
  const end = toMinutes(sleepEnd);

  if (start <= end) {
    // Same-day window (e.g., 01:00 - 06:00)
    return t >= start && t < end;
  }
  // Overnight window (e.g., 23:00 - 08:00)
  return t >= start || t < end;
}

/**
 * Evaluate the current time and transition mode if needed.
 * Returns true if a transition occurred.
 * @param {import('better-sqlite3').Database} db
 * @param {Date} [now] - Override current time (for testing)
 * @returns {boolean}
 */
export function tick(db, now) {
  const { sleepStart, sleepEnd } = getSchedule(db);
  const d = now || new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const timeStr = `${hh}:${mm}`;

  const currentMode = getMode(db);
  const shouldSleep = isInSleepWindow(timeStr, sleepStart, sleepEnd);

  if (shouldSleep && currentMode === 'awake') {
    setMode(db, 'sleep');
    logAction(db, {
      agent: 'sleep-scheduler',
      action: 'set_mode',
      domain: 'system',
      detail: `Auto-transition to sleep at ${timeStr} (window ${sleepStart}-${sleepEnd})`,
    });
    return true;
  }

  if (!shouldSleep && currentMode === 'sleep') {
    setMode(db, 'awake');
    logAction(db, {
      agent: 'sleep-scheduler',
      action: 'set_mode',
      domain: 'system',
      detail: `Auto-transition to awake at ${timeStr} (window ${sleepStart}-${sleepEnd})`,
    });
    return true;
  }

  return false;
}

/**
 * Start the sleep scheduler interval.
 * Checks every 60 seconds and transitions mode when appropriate.
 * @param {import('better-sqlite3').Database} db
 * @returns {NodeJS.Timeout} The interval handle (call clearInterval to stop)
 */
export function startScheduler(db) {
  // Run immediately on start
  tick(db);
  // Then check every 60 seconds
  return setInterval(() => tick(db), 60_000);
}

function isValidTime(str) {
  return /^\d{2}:\d{2}$/.test(str) && toMinutes(str) >= 0 && toMinutes(str) < 1440;
}

function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}
