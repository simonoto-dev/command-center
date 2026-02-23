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
import { analyzeHealthTask, researchTask, draftProposalTask, overnightScanTask, careerResearchTask, sandboxExecuteTask, strategySynthesisTask, contentDraftTask } from './agent-tasks.js';
import { installCron, uninstallCron, listCron } from './cron-setup.js';
import { checkAllNodes, loadNodes } from './nodes.js';
import { getSchedule, setSchedule, startScheduler } from './sleep-scheduler.js';
import { getBudgetStatus, setCeiling, setCostPerCall } from './budget.js';
import { checkAnomalies, getAnomalyThresholds, setAnomalyThreshold } from './anomaly.js';
import { getRecentEntries, getEntries, getTopics, getReferences, addEntry } from './dossier.js';

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
        task = overnightScanTask(domain);
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
            createProposal(db, {
              domain,
              title: p.title,
              body: p.body,
              effort: p.effort || 'unknown',
              recommendation: p.recommendation || 'none',
              source: `openclaw:${taskType}@${result.node || 'pi1'}`,
            });
          }
        }
      } catch {
        // Response wasn't parseable JSON with proposals — that's fine
      }
    }

    res.json(result);
  });

  // --- POST /sandbox/run ---
  // Auto-executes the next greenlit proposal in the sandbox
  app.post('/sandbox/run', async (_req, res) => {
    const greenlit = listProposals(db, { status: 'greenlit' });
    if (greenlit.length === 0) {
      return res.json({ ok: true, message: 'No greenlit proposals to execute', executed: 0 });
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

  // --- POST /cron/install ---
  app.post('/cron/install', async (_req, res) => {
    try {
      const result = await installCron();
      logAction(db, { agent: 'api', action: 'maintenance', domain: 'system', detail: `Installed ${result.installed} cron jobs` });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- POST /cron/uninstall ---
  app.post('/cron/uninstall', async (_req, res) => {
    try {
      const result = await uninstallCron();
      logAction(db, { agent: 'api', action: 'maintenance', domain: 'system', detail: 'Uninstalled cron jobs' });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- GET /cron/status ---
  app.get('/cron/status', async (_req, res) => {
    try {
      const result = await listCron();
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
  server.on('close', () => clearInterval(schedulerInterval));

  return { app, server, db };
}
