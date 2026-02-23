# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Team Simonoto is an autonomous operations orchestrator for an independent musician/producer. It runs on a Raspberry Pi cluster and manages AI agent tasks, project monitoring, career intelligence research, and a proposal-review-execute pipeline — all designed to minimize the operator's time on business tasks so they can focus on making music.

## Architecture

**Three-layer system:**
1. **Orchestrator** (`orchestrator/`) — Express.js API server (port 7070) with SQLite (better-sqlite3). The brain. Runs on Pi 1.
2. **MCP Server** (`mcp-server/`) — Model Context Protocol bridge that lets Claude Code interact with the orchestrator. Connects via stdio.
3. **Watchdog** (`watchdog/`) — Bash script on Pi 2 that monitors Pi 1 health and sends kill signals if unresponsive.

**Compute nodes** (defined in `orchestrator/nodes.json`):
- Pi 1 (192.168.4.29) — Orchestrator + OpenClaw, tunneled via `bones.professoroffunk.com`
- Pi 2 (192.168.4.32) — Sandbox execution node, runs OpenClaw
- Mac Mini (192.168.4.28) — Heavy compute, runs OpenClaw

**OpenClaw** is the AI agent engine. The orchestrator dispatches tasks to it via CLI (`openclaw agent --message ... --json`). Can run locally on Pi 1 or remotely on Pi 2/Mac Mini via SSH.

## Key Concepts

- **Pace** (full/slow/pause/stop) — Controls how aggressively the system operates
- **Mode** (awake/sleep) — Auto-transitions via sleep scheduler; limits which actions run overnight
- **Allowlist** — Maps (mode, action, pace) → allowed/blocked. Sleep mode only permits: scan, research, draft, test, maintenance, analyze, sandbox
- **Proposals** — AI generates proposals → human reviews → greenlit proposals execute in sandbox on Pi 2
- **Dossier** — Career intelligence database with rotating research topics (licensing, distribution, audience building, etc.)
- **Budget** — 24h rolling spend ceiling, configurable cost-per-call
- **Anomaly detection** — Auto-pauses on excessive calls or consecutive failures

## Projects Monitored

Defined in `orchestrator/projects.json`: simonoto.com, Eeveelution (PWA), Professor of Funk, Bonito Express, Pork Radio.

## Commands

```bash
# Development
cd orchestrator && npm run dev          # Start with --watch
cd orchestrator && npm start            # Production start
cd orchestrator && npm test             # Run all tests (node --test)

# Run a single test file
node --test orchestrator/src/proposals.test.js

# MCP server
cd mcp-server && npm start
```

## Code Conventions

- ES modules throughout (`"type": "module"`)
- Node.js built-in test runner (no Jest/Mocha), using `node:test` and `node:assert`
- Each module has a co-located `.test.js` file
- SQLite via better-sqlite3 with WAL mode
- Express 5 (async error handling built-in)
- All agent tasks return structured JSON prompts for OpenClaw
- `dispatch()` in `openclaw.js` is the single gateway — every agent call flows through allowlist → budget check → audit log → OpenClaw → anomaly check

## Database Schema (SQLite)

Tables: `system_state` (key-value config), `proposals`, `audit_log`, `scan_results`, `api_usage`, `dossier_entries`. Created in `db.js`.

## File Layout

```
orchestrator/
  src/
    server.js        — Express routes (the main API surface)
    openclaw.js      — OpenClaw dispatch + multi-node SSH routing
    agent-tasks.js   — Prompt templates for each agent task type
    proposals.js     — Proposal CRUD with deduplication
    allowlist.js     — Mode/pace/action permission matrix
    dossier.js       — Career intelligence research storage + topic rotation
    brief.js         — Morning brief generator
    budget.js        — 24h rolling spend tracking
    anomaly.js       — Anomaly detection + auto-pause
    pace.js          — Pace/mode getters and setters
    sleep-scheduler.js — Auto mode transitions by time
    cron-setup.js    — Crontab management for overnight operations
    nodes.js         — Node registry + health checks
    scan-runner.js   — Health scan orchestration
    audit.js         — Audit logging
    notify.js        — Notification dispatch
    scanners/health.js — URL health checker
  projects.json      — Project definitions (repos, URLs, deploy config)
  nodes.json         — Compute node registry
  career-topics.json — Research topic rotation config + reference artists
mcp-server/
  src/index.js       — 24 MCP tools bridging Claude Code → orchestrator API
watchdog/
  watchdog.sh        — Pi 1 health monitor (runs on Pi 2)
```
