import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { createDb } from './db.js';
import { getPace, setPace, getMode, setMode } from './pace.js';
import { createProposal, listProposals, resolveProposal } from './proposals.js';
import { logAction, getRecentLogs } from './audit.js';
import { isAllowed } from './allowlist.js';
import { generateBrief } from './brief.js';
import { sendNotification } from './notify.js';
import { runHealthScan } from './scan-runner.js';
import { dispatch } from './openclaw.js';
import { analyzeHealthTask, researchTask, draftProposalTask, overnightScanTask, careerResearchTask, sandboxExecuteTask, strategySynthesisTask, contentDraftTask, socialPostTask, syncLicensingScanTask, revenueAuditTask } from './agent-tasks.js';
import { installCron, uninstallCron, listCron } from './cron-setup.js';
import { checkAllNodes, loadNodes } from './nodes.js';
import { getSchedule, setSchedule, startScheduler } from './sleep-scheduler.js';
import { getBudgetStatus, setCeiling, setCostPerCall } from './budget.js';
import { checkAnomalies, getAnomalyThresholds, setAnomalyThreshold } from './anomaly.js';
import { getRecentEntries, getEntries, getTopics, getReferences, addEntry } from './dossier.js';
import { addRevenue, getRevenueSummary, getMonthlyTrend, addGig, listGigs, updateGig, addOpportunity, listOpportunities, updateOpportunity, getUpcomingDeadlines, upsertStream, listStreams, updateStream, analyzeStreams } from './revenue.js';

/**
 * Create and configure the Express API server.
 * @param {object} opts
 * @param {string} opts.dbPath - Path to the SQLite database file
 * @returns {{ app: express.Application, server: http.Server, db: import('better-sqlite3').Database }}
 */
export function createServer({ dbPath }) {
  const db = createDb(dbPath);
  const app = express();

  app.use(cors());
  app.use(express.json());

  // --- GET /health ---
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // --- GET /status ---
  app.get('/status', (_req, res) => {
    const schedule = getSchedule(db);
    const budget = getBudgetStatus(db);
    res.json({
      pace: getPace(db),
      mode: getMode(db),
      schedule,
      budget,
      timestamp: new Date().toISOString(),
    });
  });

  // --- POST /pace ---
  app.post('/pace', (req, res) => {
    const { pace } = req.body;
    if (!pace) {
      return res.status(400).json({ error: 'pace is required' });
    }
    try {
      setPace(db, pace);
      logAction(db, {
        agent: 'api',
        action: 'set_pace',
        domain: 'system',
        detail: `pace set to ${pace}`,
      });
      res.json({ pace });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- POST /mode ---
  app.post('/mode', (req, res) => {
    const { mode } = req.body;
    if (!mode) {
      return res.status(400).json({ error: 'mode is required' });
    }
    try {
      setMode(db, mode);
      logAction(db, {
        agent: 'api',
        action: 'set_mode',
        domain: 'system',
        detail: `mode set to ${mode}`,
      });
      res.json({ mode });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- GET /proposals ---
  app.get('/proposals', (req, res) => {
    const { status, domain, limit } = req.query;
    const opts = {};
    if (status) opts.status = status;
    if (domain) opts.domain = domain;
    if (limit) opts.limit = Number(limit);
    res.json(listProposals(db, opts));
  });

  // --- POST /proposals ---
  app.post('/proposals', (req, res) => {
    const { domain, title, body, effort, recommendation, source } = req.body;
    if (!domain || !title || !body) {
      return res.status(400).json({ error: 'domain, title, and body are required' });
    }
    try {
      const proposal = createProposal(db, {
        domain,
        title,
        body,
        effort: effort || 'unknown',
        recommendation: recommendation || 'none',
        source: source || 'api',
      });
      logAction(db, {
        agent: source || 'api',
        action: 'create_proposal',
        domain,
        detail: `proposal "${title}" created`,
      });
      res.status(201).json(proposal);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- POST /proposals/:id/resolve ---
  app.post('/proposals/:id/resolve', (req, res) => {
    const { id } = req.params;
    const { status, note } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }
    try {
      const proposal = resolveProposal(db, Number(id), status, note || null);
      if (!proposal) {
        return res.status(404).json({ error: 'proposal not found' });
      }
      logAction(db, {
        agent: 'api',
        action: 'resolve_proposal',
        domain: proposal.domain,
        detail: `proposal #${id} resolved as ${status}`,
      });
      res.json(proposal);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- GET /audit ---
  app.get('/audit', (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    res.json(getRecentLogs(db, limit));
  });

  // --- POST /action/check ---
  app.post('/action/check', (req, res) => {
    const { action, agent, domain } = req.body;
    if (!action) {
      return res.status(400).json({ error: 'action is required' });
    }
    const pace = getPace(db);
    const mode = getMode(db);
    const allowed = isAllowed(mode, action, pace);

    if (!allowed) {
      logAction(db, {
        agent: agent || 'unknown',
        action,
        domain: domain || 'unknown',
        detail: `blocked: mode=${mode}, pace=${pace}`,
        blocked: true,
      });
    }

    res.json({ allowed, mode, pace });
  });

  // --- GET /brief ---
  app.get('/brief', (_req, res) => {
    res.json(generateBrief(db));
  });

  // --- POST /notify ---
  app.post('/notify', async (req, res) => {
    const pace = getPace(db);
    const mode = getMode(db);
    if (!isAllowed(mode, 'notify', pace)) {
      logAction(db, { agent: 'api', action: 'notify', domain: 'system', detail: 'Blocked: notifications not allowed', blocked: true });
      return res.status(403).json({ error: 'Notifications blocked in current mode' });
    }
    try {
      const result = await sendNotification(req.body);
      logAction(db, { agent: 'api', action: 'notify', domain: 'system', detail: req.body.title });
      res.json({ sent: true, result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- POST /scan/health ---
  app.post('/scan/health', async (req, res) => {
    const results = await runHealthScan(db);
    res.json(results);
  });

  // --- POST /dispatch ---
  app.post('/dispatch', async (req, res) => {
    const { taskType, domain, topic, context, scanResults, observation, node } = req.body;

    if (!taskType || !domain) {
      return res.status(400).json({ error: 'taskType and domain are required' });
    }

    let task;
    switch (taskType) {
      case 'analyze-health':
        task = analyzeHealthTask(domain, scanResults || []);
        break;
      case 'research':
        if (!topic) return res.status(400).json({ error: 'topic is required for research tasks' });
        task = researchTask(domain, topic, context);
        break;
      case 'draft-proposal':
        if (!observation) return res.status(400).json({ error: 'observation is required for draft tasks' });
        task = draftProposalTask(domain, observation, context);
        break;
      case 'overnight-scan':
        task = overnightScanTask(domain, db);
        break;
      case 'career-research':
        task = careerResearchTask(db);
        break;
      case 'strategy-synthesis':
        task = strategySynthesisTask(db);
        break;
      case 'content-draft':
        task = contentDraftTask(db, req.body.platform);
        break;
      case 'social-post':
        task = socialPostTask({
          filePath: req.body.filePath,
          caption: req.body.caption,
          platforms: req.body.platforms,
          hashtags: req.body.hashtags,
          proposalId: req.body.proposalId,
        });
        break;
      case 'sync-licensing-scan':
        task = syncLicensingScanTask(db);
        break;
      case 'revenue-audit':
        task = revenueAuditTask(db);
        break;
      case 'sandbox-execute': {
        const proposalId = req.body.proposalId;
        if (!proposalId) return res.status(400).json({ error: 'proposalId is required for sandbox-execute' });
        const proposals = listProposals(db, { status: 'greenlit' });
        const proposal = proposals.find(p => p.id === Number(proposalId));
        if (!proposal) return res.status(404).json({ error: `No greenlit proposal with id ${proposalId}` });
        const projects = JSON.parse((await import('node:fs')).readFileSync(new URL('../projects.json', import.meta.url), 'utf-8'));
        const project = projects[domain] || null;
        task = sandboxExecuteTask(proposal, project);
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown taskType: ${taskType}` });
    }

    // Route to specific node if requested
    if (node) {
      task.options = { ...task.options, node };
    }

    const result = await dispatch(db, task);

    // If the agent returned a proposal suggestion, auto-create it
    // callAgent now normalizes response to agent text directly
    if (result.ok && result.response) {
      try {
        let agentText = result.response;
        // Strip markdown code fences if present
        const jsonMatch = agentText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) agentText = jsonMatch[1];

        const parsed = JSON.parse(agentText.trim());

        // Store career research findings in the dossier
        if (taskType === 'career-research' && parsed.findings) {
          addEntry(db, {
            topicId: parsed.topic_id || task._topicId || 'unknown',
            category: task._category || 'general',
            findings: parsed.findings,
            relevance: parsed.relevance || 'medium',
            source: `openclaw:career-research@${result.node || 'pi1'}`,
          });
        }

        // Store strategy synthesis as a dossier entry
        if (taskType === 'strategy-synthesis' && parsed.summary) {
          addEntry(db, {
            topicId: 'strategy-memo',
            category: 'strategy',
            findings: parsed.summary + '\n\nPriorities: ' + (parsed.priorities || []).map(p => p.title).join(', '),
            relevance: 'high',
            source: `openclaw:strategy-synthesis@${result.node || 'pi1'}`,
          });
        }

        // Store sync licensing opportunities
        if (taskType === 'sync-licensing-scan' && parsed.opportunities?.length > 0) {
          for (const opp of parsed.opportunities) {
            addOpportunity(db, {
              type: opp.type || 'sync-licensing',
              title: opp.title,
              platform: opp.platform,
              url: opp.url,
              deadline: opp.deadline,
              details: opp.details + (opp.estimated_payout ? ` | Payout: ${opp.estimated_payout}` : ''),
              source: `openclaw:sync-licensing-scan@${result.node || 'pi1'}`,
            });
          }
          // Also store market insights in the dossier
          if (parsed.market_insights) {
            addEntry(db, {
              topicId: 'sync-licensing',
              category: 'revenue',
              findings: parsed.market_insights,
              relevance: 'high',
              source: `openclaw:sync-licensing-scan@${result.node || 'pi1'}`,
            });
          }
        }

        // Auto-create proposals from content drafts
        if (taskType === 'content-draft' && parsed.drafts?.length > 0) {
          createProposal(db, {
            domain: 'content',
            title: `Content batch: ${parsed.drafts.length} ${parsed.platform || 'general'} posts ready`,
            body: parsed.drafts.map(d => `[${d.type}] ${d.hook}`).join('\n'),
            effort: 'small',
            recommendation: 'greenlight',
            source: `openclaw:content-draft@${result.node || 'pi1'}`,
          });
        }

        const proposals = parsed.proposals || (parsed.suggested_proposal ? [parsed.suggested_proposal] : []);
        if (parsed.title && parsed.body) proposals.push(parsed);
        for (const p of proposals) {
          if (p && p.title && p.body) {
            const created = createProposal(db, {
              domain,
              title: p.title,
              body: p.body,
              effort: p.effort || 'unknown',
              recommendation: p.recommendation || 'none',
              source: `openclaw:${taskType}@${result.node || 'pi1'}`,
            });

            // Auto-greenlight: if the proposal is new (not deduped), the recommendation
            // is greenlight, and effort is small/medium, auto-approve for overnight execution.
            // The executor daemon will pick it up and work on a branch.
            if (created && !created._deduplicated
                && p.recommendation === 'greenlight'
                && ['small', 'medium'].includes(p.effort)) {
              resolveProposal(db, created.id, 'greenlit', 'Auto-greenlighted for overnight execution');
              logAction(db, {
                agent: 'auto-greenlight',
                action: 'auto_greenlight',
                domain,
                detail: `Proposal #${created.id} "${p.title}" auto-greenlighted (${p.effort}, recommended)`,
              });
            }
          }
        }
      } catch {
        // Response wasn't parseable JSON with proposals — that's fine
      }
    }

    res.json(result);
  });

  // --- POST /sandbox/run ---
  // Auto-executes the next greenlit proposal in the sandbox.
  // If Claude Code executor is connected and preferred, skips OpenClaw sandbox.
  app.post('/sandbox/run', async (_req, res) => {
    const greenlit = listProposals(db, { status: 'greenlit' });
    if (greenlit.length === 0) {
      return res.json({ ok: true, message: 'No greenlit proposals to execute', executed: 0 });
    }

    // Check if executor daemon is available
    const pref = db.prepare('SELECT value FROM system_state WHERE key = ?').get('executor_preference');
    const lastPoll = db.prepare('SELECT value FROM system_state WHERE key = ?').get('executor_last_poll');
    const preference = pref?.value || 'auto';
    const executorConnected = lastPoll?.value && (Date.now() - new Date(lastPoll.value).getTime()) < 5 * 60 * 1000;

    // If executor is connected and preferred, let the executor daemon handle it
    if ((preference === 'claude-code' || (preference === 'auto' && executorConnected))) {
      return res.json({
        ok: true,
        message: 'Claude Code executor is active — proposal will be picked up by executor daemon',
        executorConnected: true,
        greenlitCount: greenlit.length,
      });
    }

    const proposal = greenlit[0]; // oldest first
    const projects = JSON.parse((await import('node:fs')).readFileSync(new URL('../projects.json', import.meta.url), 'utf-8'));
    const project = projects[proposal.domain] || null;

    if (!project?.repo) {
      return res.json({ ok: false, message: `No repo configured for domain "${proposal.domain}"`, proposalId: proposal.id });
    }

    const task = sandboxExecuteTask(proposal, project);
    const result = await dispatch(db, task);

    // Parse result and update proposal status
    if (result.ok && result.response) {
      try {
        // Try to find JSON in the response — might be in first payload, later payload, or wrapped in code fences
        let text = result.response;
        let parsed;

        // Try all payloads from the raw response
        const payloads = result.raw?.result?.payloads || result.raw?.payloads || [];
        for (const p of payloads) {
          if (!p?.text) continue;
          let candidate = p.text;
          const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fenceMatch) candidate = fenceMatch[1];
          try { parsed = JSON.parse(candidate.trim()); break; } catch {}
        }

        // Fallback: try the normalized response text
        if (!parsed) {
          const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fenceMatch) text = fenceMatch[1];
          parsed = JSON.parse(text.trim());
        }

        if (parsed.status === 'success') {
          resolveProposal(db, proposal.id, 'shipped', `Sandbox: ${parsed.summary || 'Implemented successfully'}. Branch: ${parsed.branch || 'unknown'}`);
          logAction(db, { agent: 'sandbox', action: 'sandbox', domain: proposal.domain, detail: `Proposal #${proposal.id} executed successfully` });
        } else if (parsed.status === 'failed') {
          resolveProposal(db, proposal.id, 'shelved', `Sandbox failed: ${parsed.summary || 'see logs'}`);
          logAction(db, { agent: 'sandbox', action: 'sandbox', domain: proposal.domain, detail: `Proposal #${proposal.id} sandbox failed — shelved: ${parsed.summary || 'unknown'}` });
        } else {
          logAction(db, { agent: 'sandbox', action: 'sandbox', domain: proposal.domain, detail: `Proposal #${proposal.id} sandbox result: ${parsed.status} — ${parsed.summary || 'see logs'}` });
        }

        res.json({ ok: true, proposalId: proposal.id, sandboxResult: parsed, durationMs: result.durationMs });
      } catch {
        logAction(db, { agent: 'sandbox', action: 'sandbox', domain: proposal.domain, detail: `Proposal #${proposal.id} sandbox completed but response unparseable` });
        res.json({ ok: true, proposalId: proposal.id, rawResponse: result.response?.slice(0, 500), durationMs: result.durationMs });
      }
    } else {
      res.json({ ok: false, proposalId: proposal.id, error: result.error, durationMs: result.durationMs });
    }
  });

  // ==========================================================================
  // Executor endpoints (Claude Code executor daemon on Desktop)
  // ==========================================================================

  // --- GET /executor/next ---
  // Returns the oldest greenlit proposal ready for Claude Code execution.
  app.get('/executor/next', async (_req, res) => {
    // Update last poll timestamp
    db.prepare('INSERT OR REPLACE INTO system_state (key, value) VALUES (?, ?)')
      .run('executor_last_poll', new Date().toISOString());

    const pref = db.prepare('SELECT value FROM system_state WHERE key = ?').get('executor_preference');
    const preference = pref?.value || 'auto';

    // If preference is 'openclaw', don't give tasks to the executor
    if (preference === 'openclaw') {
      return res.json({ task: null, message: 'Executor preference is openclaw — no tasks for claude-code' });
    }

    const greenlit = listProposals(db, { status: 'greenlit' });
    if (greenlit.length === 0) {
      return res.json({ task: null, message: 'No greenlit proposals' });
    }

    const proposal = greenlit[0]; // oldest first

    // Load project info for context
    let project = null;
    try {
      const { readFileSync } = await import('node:fs');
      const projects = JSON.parse(readFileSync(new URL('../projects.json', import.meta.url), 'utf-8'));
      project = projects[proposal.domain] || null;
    } catch {}

    // Build the prompt for claude -p
    const branchName = `gift/proposal-${proposal.id}`;
    const prompt = [
      `You are the Team Simonoto executor. You build things overnight as gifts for Simon (musician/producer). Do the work, commit it on a branch, and report what you built.`,
      '',
      `## Proposal #${proposal.id}: ${proposal.title}`,
      '',
      proposal.body,
      '',
      `## Project: ${project?.name || proposal.domain}`,
      project?.localPath ? `## Working directory: ${project.localPath}` : '',
      project?.notes ? `## Context: ${project.notes}` : '',
      project?.buildCmd ? `## Build command: ${project.buildCmd}` : '',
      project?.testCmd ? `## Test command: ${project.testCmd}` : '',
      '',
      '## Instructions',
      project?.localPath ? `1. cd to "${project.localPath}"` : '1. Clone the repo if needed',
      `2. Create branch: git checkout -b ${branchName}`,
      '3. Implement the changes described above. Be precise and minimal.',
      project?.testCmd ? `4. Run tests: ${project.testCmd}` : '4. Verify your changes work.',
      project?.buildCmd ? `5. Run build: ${project.buildCmd}` : '',
      `5. Commit your work with a clear message.`,
      '6. Do NOT push. Do NOT merge to main. Do NOT deploy. Just commit on the branch.',
      '',
      '## Response',
      'Respond with JSON:',
      `{ "status": "success"|"partial"|"failed", "summary": "What you built (2-3 sentences for Simon to read in the morning)", "branch": "${branchName}", "files_changed": ["path/to/file1", "path/to/file2"] }`,
    ].filter(Boolean).join('\n');

    logAction(db, {
      agent: 'executor-daemon',
      action: 'executor_pickup',
      domain: proposal.domain,
      detail: `Proposal #${proposal.id} picked up by Claude Code executor`,
    });

    res.json({
      task: {
        proposalId: proposal.id,
        domain: proposal.domain,
        title: proposal.title,
        prompt,
      },
    });
  });

  // --- POST /executor/result ---
  // Receives execution results from the Desktop executor daemon.
  app.post('/executor/result', (req, res) => {
    const { proposalId, output, success } = req.body;
    if (!proposalId) {
      return res.status(400).json({ error: 'proposalId is required' });
    }

    const proposals = listProposals(db, {});
    const proposal = proposals.find(p => p.id === Number(proposalId));
    if (!proposal) {
      return res.status(404).json({ error: `Proposal #${proposalId} not found` });
    }

    if (success) {
      resolveProposal(db, proposal.id, 'shipped', `Claude Code executor: ${(output || '').slice(0, 500)}`);
      logAction(db, {
        agent: 'executor-daemon',
        action: 'executor_complete',
        domain: proposal.domain,
        detail: `Proposal #${proposal.id} shipped by Claude Code executor`,
      });
    } else {
      resolveProposal(db, proposal.id, 'shelved', `Claude Code executor failed: ${(output || '').slice(0, 500)}`);
      logAction(db, {
        agent: 'executor-daemon',
        action: 'executor_failed',
        domain: proposal.domain,
        detail: `Proposal #${proposal.id} failed in Claude Code executor`,
      });
    }

    res.json({ ok: true, proposalId: proposal.id, status: success ? 'shipped' : 'shelved' });
  });

  // --- GET /executor/status ---
  // Shows executor daemon health info.
  app.get('/executor/status', (_req, res) => {
    const lastPoll = db.prepare('SELECT value FROM system_state WHERE key = ?').get('executor_last_poll');
    const pref = db.prepare('SELECT value FROM system_state WHERE key = ?').get('executor_preference');

    const lastPollTime = lastPoll?.value || null;
    let connected = false;
    if (lastPollTime) {
      const elapsed = Date.now() - new Date(lastPollTime).getTime();
      connected = elapsed < 5 * 60 * 1000; // polled within last 5 minutes
    }

    res.json({
      connected,
      lastPoll: lastPollTime,
      preference: pref?.value || 'auto',
    });
  });

  // --- POST /executor/preference ---
  // Set executor preference (claude-code, openclaw, auto)
  app.post('/executor/preference', (req, res) => {
    const { preference } = req.body;
    const valid = ['claude-code', 'openclaw', 'auto'];
    if (!preference || !valid.includes(preference)) {
      return res.status(400).json({ error: `preference must be one of: ${valid.join(', ')}` });
    }
    db.prepare('INSERT OR REPLACE INTO system_state (key, value) VALUES (?, ?)')
      .run('executor_preference', preference);
    logAction(db, {
      agent: 'api',
      action: 'set_executor_preference',
      domain: 'system',
      detail: `Executor preference set to ${preference}`,
    });
    res.json({ preference });
  });

  // --- POST /cron/install ---
  app.post('/cron/install', (_req, res) => {
    try {
      const result = installCron();
      logAction(db, { agent: 'api', action: 'maintenance', domain: 'system', detail: `Installed ${result.installed} in-process cron jobs` });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- POST /cron/uninstall ---
  app.post('/cron/uninstall', (_req, res) => {
    try {
      const result = uninstallCron();
      logAction(db, { agent: 'api', action: 'maintenance', domain: 'system', detail: 'Uninstalled in-process cron jobs' });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- GET /cron/status ---
  app.get('/cron/status', (_req, res) => {
    try {
      const result = listCron();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- GET /heartbeat ---
  app.get('/heartbeat', (_req, res) => {
    res.json({
      alive: true,
      pace: getPace(db),
      mode: getMode(db),
      timestamp: new Date().toISOString(),
    });
  });

  // --- GET /nodes ---
  app.get('/nodes', async (_req, res) => {
    try {
      const results = await checkAllNodes();
      res.json(results);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- GET /nodes/registry ---
  app.get('/nodes/registry', (_req, res) => {
    res.json(loadNodes());
  });

  // --- GET /schedule ---
  app.get('/schedule', (_req, res) => {
    const schedule = getSchedule(db);
    res.json(schedule);
  });

  // --- POST /schedule ---
  app.post('/schedule', (req, res) => {
    const { sleepStart, sleepEnd } = req.body;
    if (!sleepStart || !sleepEnd) {
      return res.status(400).json({ error: 'sleepStart and sleepEnd are required (HH:MM format)' });
    }
    try {
      setSchedule(db, sleepStart, sleepEnd);
      logAction(db, {
        agent: 'api',
        action: 'set_schedule',
        domain: 'system',
        detail: `Sleep schedule set to ${sleepStart}-${sleepEnd}`,
      });
      res.json(getSchedule(db));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- GET /budget ---
  app.get('/budget', (_req, res) => {
    res.json(getBudgetStatus(db));
  });

  // --- POST /budget/ceiling ---
  app.post('/budget/ceiling', (req, res) => {
    const { ceiling } = req.body;
    if (ceiling === undefined || ceiling === null) {
      return res.status(400).json({ error: 'ceiling is required (positive number, dollars per 24h)' });
    }
    try {
      setCeiling(db, Number(ceiling));
      logAction(db, {
        agent: 'api',
        action: 'set_budget_ceiling',
        domain: 'system',
        detail: `Budget ceiling set to $${ceiling}/24h`,
      });
      res.json(getBudgetStatus(db));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- POST /budget/cost-per-call ---
  app.post('/budget/cost-per-call', (req, res) => {
    const { cost } = req.body;
    if (cost === undefined || cost === null) {
      return res.status(400).json({ error: 'cost is required (non-negative number, dollars per call)' });
    }
    try {
      setCostPerCall(db, Number(cost));
      logAction(db, {
        agent: 'api',
        action: 'set_cost_per_call',
        domain: 'system',
        detail: `Cost per call set to $${cost}`,
      });
      res.json(getBudgetStatus(db));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- GET /progress ---
  // Business progress report: proposal throughput, research velocity,
  // content output, and system health over rolling windows.
  app.get('/progress', (_req, res) => {
    // Proposal throughput
    const allProposals = listProposals(db, {});
    const now = new Date();
    const weekAgo = new Date(now - 7 * 86400000).toISOString();
    const monthAgo = new Date(now - 30 * 86400000).toISOString();

    const thisWeek = allProposals.filter(p => p.created_at >= weekAgo);
    const thisMonth = allProposals.filter(p => p.created_at >= monthAgo);
    const shipped = allProposals.filter(p => p.status === 'shipped');
    const shippedThisMonth = shipped.filter(p => p.resolved_at && p.resolved_at >= monthAgo);
    const greenlit = allProposals.filter(p => p.status === 'greenlit');
    const pending = allProposals.filter(p => p.status === 'pending');
    const rejected = allProposals.filter(p => p.status === 'rejected' || p.status === 'shelved');

    // Research velocity — dossier entries over time
    const recentResearch = getRecentEntries(db, 100);
    const researchThisWeek = recentResearch.filter(e => e.created_at >= weekAgo);
    const researchThisMonth = recentResearch.filter(e => e.created_at >= monthAgo);
    const topicsCovered = new Set(researchThisMonth.map(e => e.topic_id));

    // Content output
    const contentProposals = allProposals.filter(p => p.domain === 'content');
    const contentThisWeek = contentProposals.filter(p => p.created_at >= weekAgo);

    // API usage
    const budget = getBudgetStatus(db);
    const usageRows = db.prepare(`
      SELECT DATE(created_at) as day, COUNT(*) as calls, SUM(cost) as cost
      FROM api_usage WHERE created_at >= ? GROUP BY DATE(created_at) ORDER BY day
    `).all(monthAgo);

    // Proposal pipeline funnel
    const funnel = {
      total: allProposals.length,
      pending: pending.length,
      greenlit: greenlit.length,
      shipped: shipped.length,
      rejected: rejected.length,
      shelved: allProposals.filter(p => p.status === 'shelved').length,
    };

    // Per-domain breakdown
    const domains = {};
    for (const p of allProposals) {
      if (!domains[p.domain]) domains[p.domain] = { total: 0, shipped: 0, pending: 0 };
      domains[p.domain].total++;
      if (p.status === 'shipped') domains[p.domain].shipped++;
      if (p.status === 'pending') domains[p.domain].pending++;
    }

    res.json({
      generated_at: now.toISOString(),
      proposals: {
        this_week: thisWeek.length,
        this_month: thisMonth.length,
        shipped_this_month: shippedThisMonth.length,
        funnel,
        by_domain: domains,
      },
      research: {
        entries_this_week: researchThisWeek.length,
        entries_this_month: researchThisMonth.length,
        topics_covered_this_month: topicsCovered.size,
        total_topics: getTopics().length,
      },
      content: {
        drafts_this_week: contentThisWeek.length,
        total_drafts: contentProposals.length,
      },
      budget,
      daily_usage: usageRows,
    });
  });

  // --- GET /anomalies ---
  app.get('/anomalies', (_req, res) => {
    const result = checkAnomalies(db);
    const thresholds = getAnomalyThresholds(db);
    res.json({ ...result, thresholds });
  });

  // --- GET /dossier ---
  app.get('/dossier', (req, res) => {
    const { topicId, category, limit } = req.query;
    const opts = {};
    if (topicId) opts.topicId = topicId;
    if (category) opts.category = category;
    if (limit) opts.limit = Number(limit);
    res.json(getEntries(db, opts));
  });

  // --- GET /dossier/topics ---
  app.get('/dossier/topics', (_req, res) => {
    res.json({ topics: getTopics(), references: getReferences() });
  });

  // --- GET /dossier/recent ---
  app.get('/dossier/recent', (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    res.json(getRecentEntries(db, limit));
  });

  // --- Revenue endpoints ---

  // GET /revenue — summary for current month (or ?since=YYYY-MM-DD)
  app.get('/revenue', (req, res) => {
    res.json(getRevenueSummary(db, req.query.since));
  });

  // POST /revenue — log a revenue entry
  app.post('/revenue', (req, res) => {
    const { type, amount, description, date, recurring, source } = req.body;
    if (!type || amount === undefined || !description || !date) {
      return res.status(400).json({ error: 'type, amount, description, and date are required' });
    }
    const entry = addRevenue(db, { type, amount: Number(amount), description, date, recurring, source });
    logAction(db, { agent: source || 'api', action: 'log_revenue', domain: 'revenue', detail: `${type}: $${amount} — ${description}` });
    res.status(201).json(entry);
  });

  // GET /revenue/trend — monthly revenue trend
  app.get('/revenue/trend', (req, res) => {
    const months = req.query.months ? Number(req.query.months) : 6;
    res.json(getMonthlyTrend(db, months));
  });

  // --- Gig endpoints ---

  // GET /gigs
  app.get('/gigs', (req, res) => {
    res.json(listGigs(db, { status: req.query.status, limit: req.query.limit ? Number(req.query.limit) : undefined }));
  });

  // POST /gigs
  app.post('/gigs', (req, res) => {
    const { title, venue, date, pay, notes } = req.body;
    if (!title || !date) {
      return res.status(400).json({ error: 'title and date are required' });
    }
    const gig = addGig(db, { title, venue, date, pay: pay ? Number(pay) : null, notes });
    logAction(db, { agent: 'api', action: 'add_gig', domain: 'gigs', detail: `${title} at ${venue || 'TBD'} on ${date}` });
    res.status(201).json(gig);
  });

  // POST /gigs/:id
  app.post('/gigs/:id', (req, res) => {
    const gig = updateGig(db, Number(req.params.id), req.body);
    if (!gig) return res.status(404).json({ error: 'gig not found' });
    res.json(gig);
  });

  // --- Opportunity endpoints ---

  // GET /opportunities
  app.get('/opportunities', (req, res) => {
    res.json(listOpportunities(db, {
      type: req.query.type,
      status: req.query.status,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    }));
  });

  // POST /opportunities
  app.post('/opportunities', (req, res) => {
    const { type, title, platform, url, deadline, details, source } = req.body;
    if (!type || !title) {
      return res.status(400).json({ error: 'type and title are required' });
    }
    const opp = addOpportunity(db, { type, title, platform, url, deadline, details, source });
    logAction(db, { agent: source || 'api', action: 'add_opportunity', domain: 'opportunities', detail: `${type}: ${title}` });
    res.status(201).json(opp);
  });

  // POST /opportunities/:id
  app.post('/opportunities/:id', (req, res) => {
    const opp = updateOpportunity(db, Number(req.params.id), req.body);
    if (!opp) return res.status(404).json({ error: 'opportunity not found' });
    res.json(opp);
  });

  // --- Deadlines ---

  // GET /deadlines — upcoming deadlines across gigs and opportunities
  app.get('/deadlines', (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 14;
    res.json(getUpcomingDeadlines(db, days));
  });

  // --- Revenue Streams ---

  // GET /revenue/streams — list all revenue streams
  app.get('/revenue/streams', (req, res) => {
    res.json(listStreams(db, { status: req.query.status }));
  });

  // POST /revenue/streams — create or update a revenue stream
  app.post('/revenue/streams', (req, res) => {
    const { name, type } = req.body;
    if (!name || !type) {
      return res.status(400).json({ error: 'name and type are required' });
    }
    const stream = upsertStream(db, req.body);
    logAction(db, { agent: req.body.source || 'api', action: 'upsert_stream', domain: 'revenue', detail: `${type}: ${name}` });
    res.status(201).json(stream);
  });

  // POST /revenue/streams/:id — update a revenue stream
  app.post('/revenue/streams/:id', (req, res) => {
    const stream = updateStream(db, Number(req.params.id), req.body);
    if (!stream) return res.status(404).json({ error: 'stream not found' });
    res.json(stream);
  });

  // GET /revenue/streams/analysis — gap analysis report
  app.get('/revenue/streams/analysis', (req, res) => {
    res.json(analyzeStreams(db));
  });

  // POST /revenue/streams/seed — seed Simon's known revenue streams
  app.post('/revenue/streams/seed', (_req, res) => {
    const seeds = [
      // Active streams
      { name: 'Private Lessons', type: 'lessons', status: 'active', monthly_estimate: 0, monthly_goal: 2000, frequency: 'monthly', notes: 'Guitar/bass/production lessons. Core income stream. Track per-student rate and retention.', priority: 10 },
      { name: 'Streaming (Spotify/Apple/etc)', type: 'streaming', status: 'active', monthly_estimate: 0, monthly_goal: 200, frequency: 'monthly', notes: 'Distributor royalties via DistroKid. Low per-stream but compounds.', priority: 5 },
      { name: 'Live Gigs', type: 'gigs', status: 'active', monthly_estimate: 0, monthly_goal: 500, frequency: 'per-event', notes: 'Solo and band performances. Variable — depends on booking cadence.', priority: 7 },
      { name: 'Sync Licensing', type: 'licensing', status: 'active', monthly_estimate: 0, monthly_goal: 500, frequency: 'per-event', notes: 'TV/film/ad placements via Songtradr, Musicbed, etc. High leverage — one placement can equal months of lessons.', priority: 9 },
      // Potential new streams
      { name: 'Sample Pack (Original Tracks)', type: 'merch', status: 'potential', monthly_estimate: 0, monthly_goal: 300, frequency: 'monthly', notes: 'Curate loops, one-shots, stems from original productions. Sell on Splice, Gumroad, or Bandcamp. Passive income once created.', priority: 6 },
      { name: 'Patreon / Membership', type: 'other', status: 'potential', monthly_estimate: 0, monthly_goal: 500, frequency: 'monthly', notes: 'Behind-the-scenes studio content, production tips, early releases. Builds superfan community. Consider tiered: $5 BTS / $15 stems+tips / $25 monthly lesson.', priority: 8 },
      { name: 'Tiered Teaching (Group Classes)', type: 'lessons', status: 'potential', monthly_estimate: 0, monthly_goal: 800, frequency: 'monthly', notes: 'Group workshops (funk guitar, production basics). Higher $/hr than 1-on-1. Could run via Professor of Funk platform.', priority: 7 },
      { name: 'YouTube Ad Revenue', type: 'streaming', status: 'potential', monthly_estimate: 0, monthly_goal: 150, frequency: 'monthly', notes: 'Monetize tutorial/performance content. Requires 1K subs + 4K watch hours. Compounds with teaching brand.', priority: 4 },
    ];

    const results = seeds.map(s => upsertStream(db, s));
    logAction(db, { agent: 'api', action: 'seed_streams', domain: 'revenue', detail: `Seeded ${results.length} revenue streams` });
    res.json({ seeded: results.length, streams: results });
  });

  // ==========================================================================
  // Memory notes (cross-session context bridge)
  // ==========================================================================

  // --- GET /memory ---
  // Returns memory notes. ?unread=true for only unread notes.
  app.get('/memory', (req, res) => {
    const unreadOnly = req.query.unread === 'true';
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const rows = unreadOnly
      ? db.prepare('SELECT * FROM memory_notes WHERE read = 0 ORDER BY created_at DESC LIMIT ?').all(limit)
      : db.prepare('SELECT * FROM memory_notes ORDER BY created_at DESC LIMIT ?').all(limit);
    res.json(rows);
  });

  // --- POST /memory ---
  // Save a memory note. { title, body, source }
  app.post('/memory', (req, res) => {
    const { title, body, source } = req.body;
    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required' });
    }
    const result = db.prepare(
      'INSERT INTO memory_notes (title, body, source) VALUES (?, ?, ?)'
    ).run(title, body, source || 'api');

    logAction(db, {
      agent: source || 'api',
      action: 'save_memory',
      domain: 'system',
      detail: `Memory note: ${title}`,
    });

    res.status(201).json({
      id: result.lastInsertRowid,
      title,
      body,
      source: source || 'api',
      read: 0,
      created_at: new Date().toISOString(),
    });
  });

  // --- POST /memory/:id/read ---
  // Mark a memory note as read.
  app.post('/memory/:id/read', (req, res) => {
    const { id } = req.params;
    const result = db.prepare('UPDATE memory_notes SET read = 1 WHERE id = ?').run(Number(id));
    if (result.changes === 0) {
      return res.status(404).json({ error: 'note not found' });
    }
    res.json({ ok: true, id: Number(id) });
  });

  // --- POST /memory/read-all ---
  // Mark all memory notes as read.
  app.post('/memory/read-all', (_req, res) => {
    db.prepare('UPDATE memory_notes SET read = 1 WHERE read = 0').run();
    res.json({ ok: true });
  });

  // --- Social Media Posts ---

  app.get('/social-posts', (_req, res) => {
    const { platform, status, limit } = _req.query;
    let sql = 'SELECT * FROM social_posts WHERE 1=1';
    const params = [];
    if (platform) { sql += ' AND platform = ?'; params.push(platform); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC';
    if (limit) { sql += ' LIMIT ?'; params.push(Number(limit)); }
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  });

  app.post('/social-posts', (req, res) => {
    const { proposal_id, platform, post_url, caption, file_path, status, error } = req.body;
    if (!platform) return res.status(400).json({ error: 'platform is required' });

    const result = db.prepare(`
      INSERT INTO social_posts (proposal_id, platform, post_url, caption, file_path, status, error, posted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      proposal_id || null,
      platform,
      post_url || null,
      caption || null,
      file_path || null,
      status || 'pending',
      error || null,
      status === 'posted' ? new Date().toISOString() : null
    );

    res.json({ id: Number(result.lastInsertRowid), status: status || 'pending' });
  });

  // --- POST /anomalies/threshold ---
  app.post('/anomalies/threshold', (req, res) => {
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key and value are required' });
    }
    try {
      setAnomalyThreshold(db, key, Number(value));
      logAction(db, {
        agent: 'api',
        action: 'set_anomaly_threshold',
        domain: 'system',
        detail: `${key} set to ${value}`,
      });
      res.json(getAnomalyThresholds(db));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  const server = http.createServer(app);

  // Start the sleep scheduler (auto-transitions mode based on time)
  const schedulerInterval = startScheduler(db);

  // Auto-install in-process cron jobs on startup
  try {
    const cronResult = installCron();
    console.log(`[startup] ${cronResult.installed} cron jobs installed`);
  } catch (e) {
    console.error(`[startup] Failed to install cron jobs: ${e.message}`);
  }

  // Clean up on server close
  server.on('close', () => {
    clearInterval(schedulerInterval);
    uninstallCron();
  });

  return { app, server, db };
}
