import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { createDb } from './db.js';
import { getPace, setPace, getMode, setMode } from './pace.js';
import { createProposal, listProposals, resolveProposal } from './proposals.js';
import { logAction, getRecentLogs } from './audit.js';
import { isAllowed } from './allowlist.js';

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
    res.json({
      pace: getPace(db),
      mode: getMode(db),
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

  // --- GET /heartbeat ---
  app.get('/heartbeat', (_req, res) => {
    res.json({
      alive: true,
      pace: getPace(db),
      mode: getMode(db),
      timestamp: new Date().toISOString(),
    });
  });

  const server = http.createServer(app);
  return { app, server, db };
}
