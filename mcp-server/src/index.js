#!/usr/bin/env node

/**
 * Team Simonoto MCP Server
 *
 * Bridges Claude Code to the Simonoto orchestrator running on Pi 1.
 * Communicates over stdio using the Model Context Protocol.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const ORCHESTRATOR_URL =
  process.env.SIMONOTO_ORCHESTRATOR_URL || 'https://bones.professoroffunk.com';

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

/**
 * Call the orchestrator REST API.
 * @param {string} path - URL path (e.g. "/status")
 * @param {object} [options]
 * @param {string} [options.method] - HTTP method (default GET)
 * @param {object} [options.body]   - JSON body to send
 * @param {Record<string,string>} [options.query] - Query-string params
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 */
async function callApi(path, options = {}) {
  const { method = 'GET', body, query } = options;

  let url = `${ORCHESTRATOR_URL}${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const qsStr = qs.toString();
    if (qsStr) url += `?${qsStr}`;
  }

  const fetchOpts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) fetchOpts.body = JSON.stringify(body);

  try {
    const res = await fetch(url, fetchOpts);
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err.message } };
  }
}

/**
 * Format an API result as MCP tool content.
 * Returns { content: [{ type: 'text', text }] } with optional isError flag.
 */
function result(res) {
  const text = JSON.stringify(res.data, null, 2);
  if (!res.ok) {
    return { content: [{ type: 'text', text }], isError: true };
  }
  return { content: [{ type: 'text', text }] };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer(
  { name: 'simonoto', version: '0.1.0' },
  {
    instructions:
      'Team Simonoto orchestrator bridge. Controls pace, mode, proposals, and action gating for the autonomous agent fleet.',
  },
);

// 1. simonoto_status — GET /status
server.tool(
  'simonoto_status',
  'Get current orchestrator state (pace, mode, timestamp)',
  async () => result(await callApi('/status')),
);

// 2. simonoto_set_pace — POST /pace
server.tool(
  'simonoto_set_pace',
  'Set the orchestrator pace (full, slow, pause, stop)',
  { pace: z.enum(['full', 'slow', 'pause', 'stop']).describe('Desired pace level') },
  async ({ pace }) => result(await callApi('/pace', { method: 'POST', body: { pace } })),
);

// 3. simonoto_set_mode — POST /mode
server.tool(
  'simonoto_set_mode',
  'Set the orchestrator mode (awake or sleep)',
  { mode: z.enum(['awake', 'sleep']).describe('Desired mode') },
  async ({ mode }) => result(await callApi('/mode', { method: 'POST', body: { mode } })),
);

// 4. simonoto_list_proposals — GET /proposals
server.tool(
  'simonoto_list_proposals',
  'List proposals, optionally filtered by status or domain',
  {
    status: z.string().optional().describe('Filter by status (pending, approved, rejected, deferred)'),
    domain: z.string().optional().describe('Filter by domain'),
    limit: z.number().optional().describe('Max number of proposals to return'),
  },
  async ({ status, domain, limit }) =>
    result(await callApi('/proposals', { query: { status, domain, limit: limit?.toString() } })),
);

// 5. simonoto_create_proposal — POST /proposals
server.tool(
  'simonoto_create_proposal',
  'Create a new proposal for human review',
  {
    domain: z.string().describe('Domain this proposal belongs to'),
    title: z.string().describe('Short title for the proposal'),
    body: z.string().describe('Full proposal description'),
    effort: z.string().optional().describe('Estimated effort (small, medium, large, unknown)'),
    recommendation: z.string().optional().describe('Agent recommendation (approve, reject, defer, none)'),
  },
  async ({ domain, title, body, effort, recommendation }) =>
    result(
      await callApi('/proposals', {
        method: 'POST',
        body: { domain, title, body, effort, recommendation },
      }),
    ),
);

// 6. simonoto_resolve_proposal — POST /proposals/:id/resolve
server.tool(
  'simonoto_resolve_proposal',
  'Resolve a proposal (approve, reject, or defer)',
  {
    id: z.number().describe('Proposal ID to resolve'),
    status: z.string().describe('Resolution status (approved, rejected, deferred)'),
    note: z.string().optional().describe('Optional note about the resolution'),
  },
  async ({ id, status, note }) =>
    result(
      await callApi(`/proposals/${id}/resolve`, {
        method: 'POST',
        body: { status, note },
      }),
    ),
);

// 7. simonoto_check_action — POST /action/check
server.tool(
  'simonoto_check_action',
  'Check whether an action is currently allowed by the orchestrator',
  {
    action: z.string().describe('The action to check (e.g. write_file, deploy, git_push)'),
    agent: z.string().optional().describe('Agent requesting the action'),
    domain: z.string().optional().describe('Domain context for the action'),
  },
  async ({ action, agent, domain }) =>
    result(
      await callApi('/action/check', {
        method: 'POST',
        body: { action, agent, domain },
      }),
    ),
);

// 8. simonoto_audit_log — GET /audit
server.tool(
  'simonoto_audit_log',
  'Retrieve recent audit log entries',
  {
    limit: z.number().optional().describe('Max entries to return (default 50)'),
  },
  async ({ limit }) =>
    result(await callApi('/audit', { query: { limit: limit?.toString() } })),
);

// 9. simonoto_morning_brief — GET /brief
server.tool(
  'simonoto_morning_brief',
  'Get the morning brief summary (may not be available yet)',
  async () => result(await callApi('/brief')),
);

// 10. simonoto_run_scan — POST /scan/health
server.tool(
  'simonoto_run_scan',
  'Trigger a health scan of the system (may not be available yet)',
  async () =>
    result(await callApi('/scan/health', { method: 'POST' })),
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is now listening on stdin/stdout — nothing else to do.
}

main().catch((err) => {
  process.stderr.write(`simonoto-mcp fatal: ${err.message}\n`);
  process.exit(1);
});
