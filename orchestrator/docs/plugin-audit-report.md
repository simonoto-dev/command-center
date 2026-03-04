# Claude Code Plugin Audit Report

**Date:** 2026-03-04
**For:** Simon Keyser-Petty
**Context:** Musician/producer running Team Simonoto orchestrator (Node.js/Express/SQLite on Pi cluster), personal websites (GitHub Pages, Firebase), Flipper Zero firmware, and various creative projects.

---

## Executive Summary

You have **15 plugins enabled** producing **~50 agents, ~30 commands, ~35 skills, 4 MCP servers, and 6 hooks**. That's a lot of context injected into every session. Several plugins are enterprise/Rails-focused and irrelevant to your workflow. Others overlap significantly. Trimming the fat will reduce noise, speed up session startup, and make Claude Code more focused on what you actually do.

**Recommendation:** Remove 5 plugins, keep 10. Net result: cleaner context, faster sessions, no lost functionality you'd actually use.

---

## Plugin-by-Plugin Assessment

### 1. superpowers (v4.3.1) — KEEP

**What it does:** Core skills library — TDD, debugging, brainstorming, plan writing/execution, code review, git worktrees. Injects itself into every session via SessionStart hook.

**Provides:** 14 skills, 3 commands, 1 agent, 1 hook

**Why keep:** This is the backbone. The brainstorming, planning, and debugging workflows are universally useful. The SessionStart hook ensures structured approaches to problems. The TDD and verification skills catch mistakes before they land. Even as a non-enterprise dev, systematic debugging and planning save you hours.

**Config notes:** Already working well. No changes needed.

---

### 2. compound-engineering (v2.34.0) — KEEP (with awareness)

**What it does:** Full autonomous engineering pipeline from Every Inc. Brainstorm → Plan → Deepen → Work → Review → Triage → Resolve. 29 agents, 22 commands, 19 skills, Context7 MCP.

**Provides:** 29 agents, 22 commands, 19 skills, 1 MCP server (Context7)

**Why keep:** The most feature-rich plugin by far. The workflow pipeline (`/workflows:brainstorm` → `/workflows:plan` → `/workflows:work`) is genuinely useful for your projects. Context7 MCP gives live documentation lookup for any framework. The `agent-native-architecture` skill is directly relevant since Team Simonoto IS an agent-native system. `security-sentinel`, `performance-oracle`, and `architecture-strategist` are framework-agnostic and valuable.

**What's irrelevant:**
- Rails-specific agents: `dhh-rails-reviewer`, `kieran-rails-reviewer`, `schema-drift-detector`, `ankane-readme-writer` — you don't write Rails
- Ruby skills: `andrew-kane-gem-writer`, `dhh-rails-style`, `dspy-ruby` — not your stack
- Design/Figma agents: `design-implementation-reviewer`, `design-iterator`, `figma-design-sync` — you don't use Figma
- `every-style-editor` — Every.to editorial style, not relevant
- `lint` agent — Ruby/ERB linting only

**These irrelevant pieces don't hurt much** — they only activate when explicitly invoked or when matched by the review workflow. They add some noise to the skills list but don't consume resources passively.

**Config action:** Create `compound-engineering.local.md` in your project roots with a focused `review_agents` list so `/workflows:review` only runs agents relevant to your stack:
```yaml
---
review_agents:
  - kieran-typescript-reviewer
  - security-sentinel
  - performance-oracle
  - architecture-strategist
  - code-simplicity-reviewer
  - pattern-recognition-specialist
---
```

---

### 3. commit-commands — KEEP

**What it does:** Git workflow shortcuts — `/commit`, `/commit-push-pr`, `/clean_gone`.

**Provides:** 3 commands

**Why keep:** You use git constantly. `/commit` is faster than typing out git commands. `/commit-push-pr` is a one-shot commit-push-PR-create. `/clean_gone` cleans stale branches. Small plugin, high utility, zero overhead.

---

### 4. code-review — KEEP

**What it does:** Multi-agent PR review with confidence scoring. 5 parallel agents score issues, filters below 80/100 confidence.

**Provides:** 1 command (`/code-review`)

**Why keep:** When you want a second opinion on a PR before merging, this gives structured feedback. The confidence scoring means it won't waste your time with nitpicks. Useful for catching bugs in orchestrator changes before they hit the Pi cluster.

---

### 5. hookify — KEEP

**What it does:** Dynamic hook system — create rules from conversation patterns or explicit instructions. Rules live in `.claude/hookify.*.local.md` files, enforced without restart.

**Provides:** 4 hooks, 4 commands, 1 agent, 1 skill

**Why keep:** Safety net for your workflow. You can create rules like "never delete the SQLite database", "always use --project with firebase deploy", "warn before force-pushing". The rules persist across sessions and can be toggled without restarting. Low overhead, high protection.

**Config action:** Consider creating a few rules for your known gotchas (from CLAUDE.md):
- Block `scp -r src/` (causes nested src/src/)
- Warn on `firebase deploy` without `--project`
- Block clearing Ed25519 keypair in Eeveelution

---

### 6. claude-md-management — KEEP

**What it does:** Audit and improve CLAUDE.md files, capture session learnings.

**Provides:** 1 command, 1 skill

**Why keep:** You have CLAUDE.md files in multiple projects. This plugin audits them for quality and helps capture learnings. Keeps your project memory accurate as things evolve. Small footprint.

---

### 7. frontend-design — KEEP

**What it does:** Guides distinctive UI/UX creation — avoids generic "AI slop" aesthetics.

**Provides:** 1 skill

**Why keep:** You build simonoto.com, Glory Jams, Professor of Funk, Eeveelution PWA. When you're doing frontend work, this skill pushes toward creative, distinctive designs rather than cookie-cutter Bootstrap/Tailwind output. Perfect for a musician's personal brand. Tiny footprint.

**Note:** compound-engineering has its own `frontend-design` skill too. They complement each other — the standalone plugin triggers more reliably since it's a dedicated skill.

---

### 8. firebase — KEEP

**What it does:** MCP server connecting Firebase tools (Firestore, auth, hosting, storage, functions).

**Provides:** 1 MCP server

**Why keep:** You have 4 Firebase projects (simonoto-828c0, eeveelution-3a390, professor-of-funk, glory-jams). This gives Claude direct access to manage them. Essential for your deploy workflow.

---

### 9. github — KEEP

**What it does:** MCP server for GitHub API (issues, PRs, code search, repository management).

**Provides:** 1 MCP server

**Why keep:** You have 7+ GitHub repos. This lets Claude manage issues, PRs, and repository operations directly. The `gh` CLI already works, but the MCP server provides richer integration.

**Config check:** Requires `GITHUB_PERSONAL_ACCESS_TOKEN` environment variable. Verify this is set.

---

### 10. claude-code-setup — KEEP (low priority)

**What it does:** Analyzes codebases and recommends Claude Code automations (hooks, skills, MCP servers).

**Provides:** 1 skill

**Why keep:** Useful when setting up Claude Code for a new project. You could run it on each of your projects to get tailored recommendations. Very small footprint — it's just one skill that activates on demand.

---

### 11. code-simplifier — REMOVE

**What it does:** Agent that simplifies recently modified code for clarity and maintainability.

**Provides:** 1 agent (runs on Opus)

**Why remove:** Overlaps heavily with compound-engineering's `code-simplicity-reviewer` agent which does the same thing as part of the review pipeline. Having both means duplicate simplification passes. The compound-engineering version is better integrated into your workflow.

**Overlap with:** `compound-engineering:review:code-simplicity-reviewer`

---

### 12. clangd-lsp — REMOVE

**What it does:** C/C++ language server for code intelligence.

**Provides:** 1 LSP server

**Why remove:** Only activates for `.c`, `.cpp`, `.h`, `.hpp` files. Your Flipper Zero firmware work is the only C code you touch, and that's done in the Flipper Build Tool / PlatformIO, not in Claude Code. This plugin does nothing for Node.js, web, or music projects. Zero utility, adds LSP overhead.

---

### 13. gitlab — REMOVE

**What it does:** MCP server for GitLab (repos, merge requests, CI/CD, issues).

**Provides:** 1 MCP server

**Why remove:** You use GitHub exclusively. All your repos are on GitHub (simonoto-dev). You have zero GitLab repositories. This MCP server connects to gitlab.com and provides no value. Pure dead weight.

---

### 14. agent-sdk-dev — REMOVE

**What it does:** Scaffolds and verifies Claude Agent SDK applications (TypeScript/Python).

**Provides:** 1 command, 2 agents

**Why remove:** This is for building applications on the Claude Agent SDK specifically. Your AI agent system (Team Simonoto + OpenClaw) uses its own architecture, not the Agent SDK. If you ever want to build an Agent SDK app, you can re-enable this. Until then, it's noise.

---

### 15. plugin-dev — REMOVE

**What it does:** Comprehensive toolkit for developing Claude Code plugins — creation, validation, testing.

**Provides:** 1 command, 3 agents, 7 skills

**Why remove:** This is for people building Claude Code plugins. You're a plugin *user*, not a plugin *developer*. The 7 skills and 3 agents all focus on plugin authoring (agent-development, command-development, hook-development, skill-development, etc.). If you ever decide to create a custom plugin, re-enable it. Until then, it contributes 11 components of pure overhead.

---

## MCP Server Assessment

### Currently Active

| Server | Source | Verdict |
|--------|--------|---------|
| **Context7** | compound-engineering | **KEEP** — Live docs lookup for any framework. Actively useful for Node.js, Express, SQLite, Firebase, etc. |
| **Firebase** | firebase plugin | **KEEP** — Direct Firebase project management. Essential for your 4 Firebase projects. |
| **GitHub** | github plugin | **KEEP** — GitHub API access for your 7+ repos. Complements `gh` CLI. |
| **GitLab** | gitlab plugin | **REMOVE** — You don't use GitLab. |

### MCP Servers Worth Adding

| Server | What it does | Why it helps Simon |
|--------|-------------|-------------------|
| **Playwright** | Browser automation and testing | Available in marketplace. Useful for testing your web projects (simonoto.com, Glory Jams, Professor of Funk, Eeveelution). Would let Claude visually verify deploys and catch UI issues. |
| **Slack** | Slack messaging integration | Available in marketplace. If you use Slack for any music collaboration or community management, this could integrate with the orchestrator's notification system. Only add if you actively use Slack. |

**Not recommended:**
- Supabase, Stripe, Linear, Asana, Greptile, Laravel Boost, Serena — all available in marketplace but irrelevant to your stack/workflow.

---

## Overlap Analysis

| Capability | Plugin A | Plugin B | Resolution |
|-----------|----------|----------|------------|
| Code simplification | code-simplifier | compound-engineering (code-simplicity-reviewer) | Remove code-simplifier, keep compound-engineering's version |
| Frontend design | frontend-design | compound-engineering (frontend-design skill) | Keep both — standalone triggers more reliably, compound version integrates with review pipeline |
| Brainstorming | superpowers (brainstorming) | compound-engineering (brainstorming) | Keep both — superpowers version is process-focused, compound version is content-focused |
| Git worktrees | superpowers (using-git-worktrees) | compound-engineering (git-worktree) | Keep both — superpowers is conceptual, compound has a management script |
| Code review | code-review | compound-engineering (/workflows:review) | Keep both — code-review is quick PR checks, compound is exhaustive multi-agent review |
| Plan writing | superpowers (writing-plans) | compound-engineering (/workflows:plan) | Keep both — superpowers is the process skill, compound adds research agents |

---

## Summary Table

| # | Plugin | Verdict | Reason |
|---|--------|---------|--------|
| 1 | superpowers | **KEEP** | Core workflow backbone |
| 2 | compound-engineering | **KEEP** | Powerful pipeline + Context7 MCP |
| 3 | commit-commands | **KEEP** | Essential git shortcuts |
| 4 | code-review | **KEEP** | Quick PR quality checks |
| 5 | hookify | **KEEP** | Safety rules for known gotchas |
| 6 | claude-md-management | **KEEP** | Project memory maintenance |
| 7 | frontend-design | **KEEP** | Distinctive UI for your sites |
| 8 | firebase | **KEEP** | Essential for 4 Firebase projects |
| 9 | github | **KEEP** | Essential for 7+ GitHub repos |
| 10 | claude-code-setup | **KEEP** | Lightweight, useful for new projects |
| 11 | code-simplifier | **REMOVE** | Redundant with compound-engineering |
| 12 | clangd-lsp | **REMOVE** | No C/C++ work in Claude Code |
| 13 | gitlab | **REMOVE** | No GitLab repos |
| 14 | agent-sdk-dev | **REMOVE** | Not building Agent SDK apps |
| 15 | plugin-dev | **REMOVE** | Not developing plugins |

---

## Recommended Actions

### Immediate (remove 5 plugins)

In Claude Code, run:
```
/plugins
```
Then disable: `code-simplifier`, `clangd-lsp`, `gitlab`, `agent-sdk-dev`, `plugin-dev`

Or edit `~/.claude/settings.json` and set those to `false`:
```json
{
  "enabledPlugins": {
    "agent-sdk-dev@claude-plugins-official": false,
    "clangd-lsp@claude-plugins-official": false,
    "code-simplifier@claude-plugins-official": false,
    "gitlab@claude-plugins-official": false,
    "plugin-dev@claude-plugins-official": false
  }
}
```

### Configure (optimize what you keep)

1. **compound-engineering:** Create `compound-engineering.local.md` in your key project roots with a focused `review_agents` list (TypeScript-focused, not Rails).

2. **hookify:** Create rules for your known gotchas:
   - Block `scp -r src/` pattern
   - Warn on `firebase deploy` without `--project`
   - Block clearing Ed25519 keypair

3. **github MCP:** Verify `GITHUB_PERSONAL_ACCESS_TOKEN` is set in your environment.

### Consider Adding

1. **Playwright MCP** — browser automation for testing your web projects after deploys.

---

## Context Budget Impact

Rough estimate of context tokens consumed at session start:

| Component | Before cleanup | After cleanup |
|-----------|---------------|---------------|
| Plugin skills/descriptions in system prompt | ~15,000 tokens | ~11,000 tokens |
| Active hooks (hookify + superpowers) | ~2,000 tokens | ~2,000 tokens (unchanged) |
| MCP server registrations | ~800 tokens | ~600 tokens |
| **Total overhead** | **~17,800 tokens** | **~13,600 tokens** |

**Savings: ~4,200 tokens per session** — that's context space freed up for your actual conversation.

---

*Report generated by Team Simonoto overnight executor, proposal #51.*
