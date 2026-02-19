import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';
const DEFAULT_TIMEOUT = 120; // seconds

/**
 * Node definitions for remote dispatch via SSH.
 * Local node (pi1) runs openclaw directly.
 * Remote nodes are reached via SSH.
 */
const NODES = {
  pi1: { type: 'local' },
  'mac-mini': {
    type: 'ssh',
    user: 'simonegage',
    host: '192.168.4.28',
    openclawBin: '/opt/homebrew/bin/openclaw',
    shell: 'bash -lc',
  },
  pi2: {
    type: 'ssh',
    user: 'simonoto',
    host: '10.0.0.2',
    openclawBin: 'openclaw',
    shell: 'bash -c',
  },
};

/**
 * Send a message to the OpenClaw agent and get a response.
 * @param {string} message - The prompt/task for the agent
 * @param {object} [options]
 * @param {string} [options.agent] - Agent ID (default: 'main')
 * @param {number} [options.timeoutSeconds] - Timeout in seconds
 * @param {string} [options.model] - Model override
 * @param {string} [options.thinking] - Thinking level
 * @param {string} [options.sessionId] - Session ID for continuity
 * @param {string} [options.node] - Target node ('pi1', 'mac-mini', 'pi2')
 * @returns {Promise<{ok: boolean, response: string|null, error: string|null, durationMs: number, raw: object|undefined, node: string}>}
 */
export async function callAgent(message, options = {}) {
  const {
    agent,
    timeoutSeconds = DEFAULT_TIMEOUT,
    model,
    thinking,
    sessionId,
    node = 'pi1',
  } = options;

  const nodeDef = NODES[node] || NODES.pi1;
  const start = Date.now();

  try {
    let stdout;
    if (nodeDef.type === 'local') {
      // Run openclaw locally on pi1
      const args = ['agent', '--message', message, '--json'];
      args.push('--agent', agent || 'main');
      if (model) args.push('--model', model);
      if (thinking) args.push('--thinking', thinking);
      if (sessionId) args.push('--session-id', sessionId);
      args.push('--timeout', String(timeoutSeconds));

      const result = await execFileAsync(OPENCLAW_BIN, args, {
        timeout: (timeoutSeconds + 10) * 1000,
        maxBuffer: 1024 * 1024,
      });
      stdout = result.stdout;
    } else {
      // Run openclaw on a remote node via SSH
      const bin = nodeDef.openclawBin || 'openclaw';
      const ocArgs = [
        bin, 'agent',
        '--agent', agent || 'main',
        '--message', `"${message.replace(/"/g, '\\"')}"`,
        '--json',
        '--timeout', String(timeoutSeconds),
      ];
      if (model) ocArgs.push('--model', model);
      if (thinking) ocArgs.push('--thinking', thinking);

      const sshCmd = `${nodeDef.shell} '${ocArgs.join(' ')} 2>/dev/null'`;
      const result = await execFileAsync('ssh', [
        '-o', 'ConnectTimeout=10',
        '-o', 'StrictHostKeyChecking=no',
        `${nodeDef.user}@${nodeDef.host}`,
        sshCmd,
      ], {
        timeout: (timeoutSeconds + 30) * 1000,
        maxBuffer: 1024 * 1024,
      });
      stdout = result.stdout;
    }

    const durationMs = Date.now() - start;

    // Try to parse JSON response
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return { ok: true, response: stdout.trim(), error: null, durationMs, node };
    }

    // Normalize response — handle both old (wrapped in result) and new (flat payloads) formats
    const agentText =
      parsed.result?.payloads?.[0]?.text ||  // pi1 format (v2026.2.17)
      parsed.payloads?.[0]?.text ||           // mac-mini format (v2026.2.19)
      parsed.reply || parsed.response || parsed.text || parsed.content ||
      stdout.trim();

    return { ok: true, response: agentText, error: null, durationMs, raw: parsed, node };
  } catch (err) {
    const durationMs = Date.now() - start;
    return {
      ok: false,
      response: null,
      error: err.message || String(err),
      durationMs,
      node,
    };
  }
}

/**
 * Dispatch a task through the orchestrator's allowlist and audit system.
 * @param {import('better-sqlite3').Database} db
 * @param {object} task
 * @param {string} task.action - Action type for allowlist check
 * @param {string} task.domain - Domain context
 * @param {string} task.message - The prompt for the agent
 * @param {string} [task.agentName] - Name for audit logging
 * @param {object} [task.options] - Options passed to callAgent (including node)
 * @returns {Promise<{ok: boolean, allowed: boolean, response: string|null, error: string|null}>}
 */
export async function dispatch(db, task) {
  const { getPace, getMode } = await import('./pace.js');
  const { isAllowed } = await import('./allowlist.js');
  const { logAction } = await import('./audit.js');

  const pace = getPace(db);
  const mode = getMode(db);
  const targetNode = task.options?.node || 'pi1';
  const agentName = task.agentName || `openclaw:${task.action}@${targetNode}`;

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
    detail: `Dispatching to ${targetNode}: ${task.message.slice(0, 100)}...`,
  });

  const result = await callAgent(task.message, task.options);

  logAction(db, {
    agent: agentName,
    action: task.action,
    domain: task.domain,
    detail: result.ok
      ? `Completed on ${result.node} in ${result.durationMs}ms`
      : `Failed on ${result.node}: ${result.error}`,
    blocked: false,
  });

  return { ...result, allowed: true };
}
