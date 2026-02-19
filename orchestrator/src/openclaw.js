import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';
const DEFAULT_TIMEOUT = 120; // seconds

/**
 * Send a message to the OpenClaw agent and get a response.
 * @param {string} message - The prompt/task for the agent
 * @param {object} [options]
 * @param {string} [options.agent] - Agent ID (default: uses OpenClaw's default)
 * @param {number} [options.timeoutSeconds] - Timeout in seconds
 * @param {string} [options.model] - Model override (e.g. 'minimax/MiniMax-M2.5')
 * @param {string} [options.thinking] - Thinking level (off|minimal|low|medium|high)
 * @param {string} [options.sessionId] - Session ID for continuity
 * @returns {Promise<{ok: boolean, response: string|null, error: string|null, durationMs: number}>}
 */
export async function callAgent(message, options = {}) {
  const {
    agent,
    timeoutSeconds = DEFAULT_TIMEOUT,
    model,
    thinking,
    sessionId,
  } = options;

  const args = ['agent', '--message', message, '--json'];
  if (agent) args.push('--agent', agent);
  if (model) args.push('--model', model);
  if (thinking) args.push('--thinking', thinking);
  if (sessionId) args.push('--session-id', sessionId);
  args.push('--timeout-seconds', String(timeoutSeconds));

  const start = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(OPENCLAW_BIN, args, {
      timeout: (timeoutSeconds + 10) * 1000, // node timeout slightly longer
      maxBuffer: 1024 * 1024, // 1MB
    });

    const durationMs = Date.now() - start;

    // Try to parse JSON response
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      // If not valid JSON, return raw stdout
      return { ok: true, response: stdout.trim(), error: null, durationMs };
    }

    // OpenClaw JSON output typically has a response/reply field
    const response = parsed.reply || parsed.response || parsed.text || parsed.content || stdout.trim();
    return { ok: true, response, error: null, durationMs, raw: parsed };
  } catch (err) {
    const durationMs = Date.now() - start;
    return {
      ok: false,
      response: null,
      error: err.message || String(err),
      durationMs,
    };
  }
}

/**
 * Dispatch a task through the orchestrator's allowlist and audit system.
 * @param {import('better-sqlite3').Database} db
 * @param {object} task
 * @param {string} task.action - Action type for allowlist check (e.g. 'scan', 'research', 'draft')
 * @param {string} task.domain - Domain context (e.g. 'glory-jams', 'career')
 * @param {string} task.message - The prompt for the agent
 * @param {string} [task.agentName] - Name for audit logging
 * @param {object} [task.options] - Options passed to callAgent
 * @returns {Promise<{ok: boolean, allowed: boolean, response: string|null, error: string|null}>}
 */
export async function dispatch(db, task) {
  const { getPace, getMode } = await import('./pace.js');
  const { isAllowed } = await import('./allowlist.js');
  const { logAction } = await import('./audit.js');

  const pace = getPace(db);
  const mode = getMode(db);
  const agentName = task.agentName || `openclaw:${task.action}`;

  if (!isAllowed(mode, task.action, pace)) {
    logAction(db, {
      agent: agentName,
      action: task.action,
      domain: task.domain,
      detail: `Blocked by allowlist (mode=${mode}, pace=${pace})`,
      blocked: true,
    });
    return { ok: false, allowed: false, response: null, error: 'Blocked by allowlist' };
  }

  logAction(db, {
    agent: agentName,
    action: task.action,
    domain: task.domain,
    detail: `Dispatching: ${task.message.slice(0, 100)}...`,
  });

  const result = await callAgent(task.message, task.options);

  logAction(db, {
    agent: agentName,
    action: task.action,
    domain: task.domain,
    detail: result.ok
      ? `Completed in ${result.durationMs}ms`
      : `Failed: ${result.error}`,
    blocked: false,
  });

  return { ...result, allowed: true };
}
