# Team Simonoto — Strategy & Business Models

*Generated 2026-02-23. This document captures the strategic analysis and 3 proposed business models for evolving Team Simonoto from a monitoring/proposal system into a revenue-generating autonomous music business engine.*

## Current State Assessment

### What Works Well
- Solid orchestrator architecture with proper safety controls (budget, anomaly detection, allowlist)
- Multi-node compute with Pi cluster + Mac Mini
- Proposal pipeline (generate → review → execute) is a sound pattern
- Career intelligence dossier with topic rotation
- MCP server gives Claude Code full access to the system

### What's Underperforming
- **OpenClaw is used at ~2% capacity** — stateless CLI calls only, no skills/sessions/proactive agents
- **Proposals are generated but action is bottlenecked on human review** — system suggests but rarely executes
- **No revenue generation** — the system monitors projects but doesn't create value
- **Career research is collected but never synthesized** — dossier entries accumulate without strategy output
- **Content pipeline is nonexistent** — no social media, no email, no blog automation
- **Morning brief is informational, not actionable** — tells you what happened, not what to do

---

## Model 1: "NIGHT SHIFT" — The Autonomous Music Business Manager

> Team Simonoto works the business while you make the music.

### Core Idea
Transform from a monitoring system into an active business manager that handles marketing, distribution, licensing, and fan engagement autonomously. You wake up to progress, not proposals.

### New Agent Task Types
- `content-draft` — Generate social media posts, newsletter copy, blog articles
- `licensing-submit` — Prepare and track sync licensing submissions
- `distribution-check` — Monitor streaming stats, playlist placements, revenue
- `fan-engage` — Draft personalized responses, manage email sequences
- `strategy-synthesize` — Weekly synthesis of dossier findings into actionable strategy memos

### Revenue Streams
1. Sync licensing (passive catalog income from existing and new tracks)
2. Streaming optimization (data-driven playlist submission, release timing)
3. Sample pack creation and sales
4. Automated content marketing driving fan/follower growth

### OpenClaw Upgrades Required
- Agent skills: web scraping, email, social media posting
- Session continuity for multi-night research threads
- Proactive agent heartbeat for continuous monitoring
- Messaging integration (Telegram/Discord) for real-time alerts

### Operator Time: ~30 min/day reviewing and approving

---

## Model 2: "PROFESSOR FUNK EMPIRE" — Education-First Revenue Machine

> Your knowledge IS the product.

### Core Idea
Professor of Funk becomes the primary revenue engine. Eeveelution becomes an AI teaching companion. Glory Jams becomes the community funnel. The dossier feeds content creation. Everything funnels toward monetizing your musical knowledge.

### New Agent Task Types
- `course-outline` — Generate course curricula based on trending topics
- `lesson-content` — Draft lesson plans, practice exercises, theory explainers
- `student-engage` — Handle FAQs via Eeveelution chatbot
- `community-manage` — Moderate Discord, organize jam sessions, track engagement
- `content-seo` — Generate SEO-optimized blog posts from dossier insights

### Revenue Streams
1. Online courses (Teachable/Gumroad, auto-promoted by agents)
2. Subscription community (Discord with AI moderation)
3. Sample packs and production templates
4. 1-on-1 coaching (AI handles scheduling and follow-up)
5. Affiliate income (gear reviews, software recommendations)

### OpenClaw Upgrades Required
- Eeveelution integration (already an OpenClaw chat wrapper — expand its knowledge base)
- Content generation skills
- Community moderation capabilities
- Automated email/newsletter sequences

### Operator Time: ~1 hr recording content, 15 min approving agent output

---

## Model 3: "THE COLLECTIVE" — Artist Incubator & Micro-Label

> Scale beyond one artist.

### Core Idea
Team Simonoto becomes infrastructure for a collective of independent artists. Multi-tenant architecture manages operations for multiple artists. The system itself becomes a product. You're the hub of a network with more leverage for deals, press, and bookings.

### New Agent Task Types
- `collab-match` — Find compatible artists based on genre, location, goals
- `release-coordinate` — Manage cross-artist release calendars and promo
- `split-sheet` — Auto-generate and track revenue splits for collaborations
- `collective-promote` — Cross-promote collective artists to each other's audiences
- `deal-research` — Research distribution deals, brand partnerships, booking opportunities

### Revenue Streams
1. Percentage on collaborative releases
2. System-as-a-service for other indie artists
3. Event booking and ticket sales (Glory Jams → paid events)
4. Collective merchandise and brand deals
5. Better distribution deal negotiation (collective leverage)

### OpenClaw Upgrades Required
- Multi-agent workspaces per artist
- Multi-tenant proposal/dossier system
- Automated split sheet generation
- Cross-artist release calendar management

### Operator Time: ~45 min on community/collaboration decisions

---

## OpenClaw Optimization Plan (Applies to All Models)

### Current Pattern (wasteful)
```
openclaw agent --message "one-shot prompt" --json --timeout 120
```

### Recommended Upgrades

#### 1. Session Continuity
Use `--session-id` for multi-call research threads. Currently wired in code but never used by cron.
```js
// In careerResearchTask, pass a persistent session per topic
options: { sessionId: `career-${topic.id}`, timeoutSeconds: 120 }
```

#### 2. Agent Skills Installation
Install relevant skills from ClawHub:
- Web scraping (streaming stats, licensing platforms)
- Email automation
- Social media management
- File management (sample pack organization)
- Calendar management

#### 3. Proactive Agent Mode
Instead of cron → curl → dispatch → openclaw, run OpenClaw in proactive mode with heartbeat:
```
openclaw agent --proactive --heartbeat 3600 --agent career-researcher
```

#### 4. Messaging Integration
Connect OpenClaw to Telegram/Discord so the system can:
- Send you real-time alerts (not just morning briefs)
- Let you approve proposals from your phone
- Forward fan inquiries for quick response

#### 5. Workspace-per-Project Architecture
Each project gets its own OpenClaw workspace with context files:
```
workspaces/
  simonoto-com/IDENTITY.md
  professor-of-funk/IDENTITY.md
  career/IDENTITY.md
```

#### 6. The "Soul" Architecture
OpenClaw natively supports what the orchestrator hand-builds:
- IDENTITY.md for persistent persona
- Hooks and cron for proactive behavior
- Memory across sessions

Consider migrating orchestrator scheduling to native OpenClaw capabilities where it reduces complexity.

---

## Recommended Path

**Start with Model 1 (Night Shift)** as the foundation — it delivers immediate value regardless of which direction you grow. Models 2 and 3 can layer on top once the core business automation is running.

Priority order:
1. Fix OpenClaw session continuity (5 min code change, massive impact)
2. Add content generation pipeline (new agent task types)
3. Connect messaging for mobile approval flow
4. Add revenue tracking dashboard
5. Then specialize toward Model 2 or 3 based on what resonates
