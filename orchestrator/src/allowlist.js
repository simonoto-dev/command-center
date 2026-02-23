const SLEEP_ALLOWED = new Set(['scan', 'research', 'draft', 'test', 'maintenance', 'analyze', 'sandbox']);
const PAUSE_ALLOWED = new Set(['scan']);

/**
 * Check whether an action is allowed given the current mode and pace.
 *
 * Rules:
 * - stop: nothing is allowed (regardless of mode)
 * - awake + full/slow: everything is allowed
 * - awake + pause: only scan is allowed
 * - sleep + full/slow/pause: only sleep-safe actions are allowed
 *
 * @param {string} mode - Current mode: 'awake' or 'sleep'
 * @param {string} action - The action to check
 * @param {string} pace - Current pace: 'full', 'slow', 'pause', 'stop'
 * @returns {boolean} Whether the action is allowed
 */
export function isAllowed(mode, action, pace) {
  // Stop blocks everything
  if (pace === 'stop') return false;

  // Sleep mode: only sleep-safe actions, regardless of pace
  if (mode === 'sleep') {
    return SLEEP_ALLOWED.has(action);
  }

  // Awake mode
  if (pace === 'pause') {
    return PAUSE_ALLOWED.has(action);
  }

  // Awake + full or slow: everything allowed
  return true;
}
