import { readFileSync } from 'node:fs';
import { getTopics, getReferences, getRecentEntries, pickNextTopic } from './dossier.js';

function loadProjects() {
  return JSON.parse(readFileSync(new URL('../projects.json', import.meta.url), 'utf-8'));
}

/**
 * Analyze health scan results and generate insights.
 * @param {string} domain - Project domain key
 * @param {object[]} scanResults - Results from health scanner
 * @returns {object} Task for dispatch()
 */
export function analyzeHealthTask(domain, scanResults) {
  const projects = loadProjects();
  const project = projects[domain];
  return {
    action: 'analyze',
    domain,
    agentName: 'agent:health-analyst',
    message: `You are a project health analyst for Team Simonoto. Analyze these health check results for "${project?.name || domain}" and provide a brief assessment. Note any concerns, trends, or actions needed.

Results:
${JSON.stringify(scanResults, null, 2)}

Respond with a JSON object: {"assessment": "...", "severity": "ok|warning|critical", "suggested_actions": ["..."]}`,
    options: { timeoutSeconds: 60, thinking: 'low' },
    _tier: 'fast',  // Cost routing: use cheapest model for health analysis
  };
}

/**
 * Research a topic related to music career or business.
 * @param {string} domain - Domain context
 * @param {string} topic - What to research
 * @param {string} [context] - Additional context
 * @returns {object} Task for dispatch()
 */
export function researchTask(domain, topic, context) {
  return {
    action: 'research',
    domain,
    agentName: 'agent:researcher',
    message: `You are a research analyst for Team Simonoto, an independent musician/producer's operations system. Research the following topic and provide concise, actionable findings.

Topic: ${topic}
Domain: ${domain}
${context ? `Context: ${context}` : ''}

Respond with a JSON object: {"findings": "...", "relevance": "high|medium|low", "suggested_proposal": {"title": "...", "body": "...", "effort": "small|medium|large"} | null}`,
    options: { timeoutSeconds: 120, thinking: 'medium' },
  };
}

/**
 * Draft a proposal based on findings or observations.
 * @param {string} domain - Domain context
 * @param {string} observation - What was observed
 * @param {string} [context] - Additional context
 * @returns {object} Task for dispatch()
 */
export function draftProposalTask(domain, observation, context) {
  return {
    action: 'draft',
    domain,
    agentName: 'agent:drafter',
    message: `You are a proposal drafter for Team Simonoto. Based on the following observation, draft a proposal for the human operator (Simon, an independent musician/producer).

Observation: ${observation}
Domain: ${domain}
${context ? `Context: ${context}` : ''}

Be concise and actionable. Include effort estimate and your recommendation.

Respond with a JSON object: {"title": "...", "body": "...", "effort": "small|medium|large", "recommendation": "greenlight|research-more|shelve"}`,
    options: { timeoutSeconds: 90, thinking: 'low' },
  };
}

/**
 * Career intelligence research task using topic rotation.
 * Picks a topic from the dossier that hasn't been researched recently,
 * and includes reference artists for context.
 * @param {import('better-sqlite3').Database} db - For topic rotation state
 * @param {object} [overrideTopic] - Override the auto-picked topic
 * @returns {object} Task for dispatch()
 */
export function careerResearchTask(db, overrideTopic) {
  const topic = overrideTopic || pickNextTopic(db);
  const refs = getReferences();
  const refList = refs.map(r => `- ${r.name} (${r.role}): ${r.note}`).join('\n');

  return {
    action: 'research',
    domain: 'career',
    agentName: 'agent:career-researcher',
    message: `You are a career intelligence researcher for Team Simonoto, an independent musician/producer's autonomous operations system. Your operator is Simon, an independent musician/producer building toward a career like Otis McDonald's.

Research Topic: ${topic.topic}
Category: ${topic.category}

Reference artists to study and compare:
${refList}

Research this topic with a focus on actionable insights for an independent producer/musician. Look for:
- What's working right now in this area
- Specific strategies or platforms worth investigating
- Opportunities that align with Simon's trajectory
- Things to avoid or watch out for

Respond with a JSON object:
{
  "topic_id": "${topic.id}",
  "findings": "Your detailed findings here (2-3 paragraphs)",
  "relevance": "high|medium|low",
  "key_insights": ["insight1", "insight2", "insight3"],
  "suggested_proposal": {"title": "...", "body": "...", "effort": "small|medium|large", "recommendation": "greenlight|research-more|shelve"} | null
}`,
    options: { timeoutSeconds: 120, thinking: 'medium', sessionId: `career-${topic.id}` },
    _topicId: topic.id,
    _category: topic.category,
  };
}

/**
 * Synthesize recent dossier findings into an actionable strategy memo.
 * Runs weekly — reviews all recent research and produces
 * a prioritized action plan for the operator.
 * @param {import('better-sqlite3').Database} db
 * @returns {object} Task for dispatch()
 */
export function strategySynthesisTask(db) {
  const recentEntries = getRecentEntries(db, 30);
  const refs = getReferences();
  const refList = refs.map(r => `- ${r.name} (${r.role}): ${r.note}`).join('\n');

  const entrySummaries = recentEntries.map(e =>
    `[${e.topic_id}/${e.category}] (${e.relevance}): ${e.findings.slice(0, 200)}...`
  ).join('\n');

  return {
    action: 'research',
    domain: 'career',
    agentName: 'agent:strategy-synthesizer',
    message: `You are a strategic advisor for Team Simonoto, an independent musician/producer's autonomous operations system. Your operator is Simon, building toward a career like Otis McDonald's.

Review the following recent career intelligence findings and synthesize them into an actionable weekly strategy memo.

Reference artists:
${refList}

Recent research findings (last 7 days):
${entrySummaries || '(No recent entries — recommend running career-research tasks first)'}

Produce a strategy memo with:
1. Top 3 priorities for this week (specific, actionable)
2. Quick wins (things that can be done in < 30 min)
3. Emerging opportunities worth investigating
4. Warnings or risks to monitor

Respond with a JSON object:
{
  "memo_type": "weekly-strategy",
  "priorities": [{"title": "...", "why": "...", "action": "..."}],
  "quick_wins": [{"title": "...", "action": "..."}],
  "opportunities": [{"title": "...", "detail": "..."}],
  "warnings": [{"title": "...", "detail": "..."}],
  "summary": "2-3 sentence executive summary"
}`,
    options: { timeoutSeconds: 120, thinking: 'medium', sessionId: 'strategy-weekly' },
  };
}

/**
 * Generate social media content drafts based on recent activity and research.
 * @param {import('better-sqlite3').Database} db
 * @param {string} [platform] - Target platform (instagram, twitter, youtube, general)
 * @returns {object} Task for dispatch()
 */
export function contentDraftTask(db, platform = 'general') {
  const recentEntries = getRecentEntries(db, 10);

  const context = recentEntries.map(e =>
    `[${e.category}] ${e.findings.slice(0, 150)}`
  ).join('\n');

  return {
    action: 'draft',
    domain: 'content',
    agentName: 'agent:content-drafter',
    message: `You are a content strategist for Team Simonoto. Simon is an independent musician/producer building his brand and audience. Generate social media content drafts.

Platform focus: ${platform}
${platform === 'general' ? 'Create content suitable for multiple platforms.' : `Optimize for ${platform} format, length, and style.`}

Recent career intelligence for inspiration:
${context || '(No recent research available)'}

Generate 3-5 content ideas. Each should be authentic to an independent musician's voice — not corporate, not generic. Think studio updates, behind-the-scenes, music insights, community engagement.

Respond with a JSON object:
{
  "platform": "${platform}",
  "drafts": [
    {
      "type": "post|story|reel|thread|video-idea",
      "hook": "The opening line or concept",
      "body": "Full draft text",
      "hashtags": ["relevant", "hashtags"],
      "notes": "Any production notes (e.g. needs photo, record quick clip)"
    }
  ],
  "posting_schedule": "Suggested posting cadence for this batch"
}`,
    options: { timeoutSeconds: 90, thinking: 'low' },
  };
}

/**
 * Scan sync licensing platforms for open briefs matching Simon's style.
 * This is the highest-leverage revenue activity: one sync placement can
 * equal months of lesson income.
 * @param {import('better-sqlite3').Database} db
 * @returns {object} Task for dispatch()
 */
export function syncLicensingScanTask(db) {
  const refs = getReferences();
  const styleContext = refs.map(r => `- ${r.name}: ${r.note}`).join('\n');

  return {
    action: 'research',
    domain: 'career',
    agentName: 'agent:sync-licensing-scanner',
    message: `You are a sync licensing opportunity scanner for Team Simonoto. Simon is an independent musician/producer who creates funk, soul, and groove-based music.

ARTIST STYLE REFERENCES:
${styleContext}

TASK: Search for current sync licensing opportunities that match Simon's musical style. Focus on:

1. **Music libraries accepting submissions**: Songtradr, Musicbed, Artlist, Epidemic Sound, Marmoset, Music Vine, Audiosocket
2. **Open briefs**: TV/film/advertising briefs looking for funk, soul, R&B, groove, instrumental, or similar genres
3. **Playlist/curator opportunities**: Spotify editorial pitching windows, YouTube audio library submissions
4. **Grants and competitions**: Music grants, production competitions, artist development programs

For each opportunity found, provide:
- Platform name
- Brief/opportunity title
- Genre/style match (how well it fits Simon's sound)
- Deadline (if applicable)
- Submission requirements
- Estimated payout range

Respond with a JSON object:
{
  "scan_date": "${new Date().toISOString().slice(0, 10)}",
  "opportunities": [
    {
      "type": "sync-licensing|library-submission|playlist|grant|competition",
      "title": "Brief/opportunity title",
      "platform": "Platform name",
      "url": "URL if available",
      "deadline": "YYYY-MM-DD or null",
      "genre_match": "high|medium|low",
      "details": "What they're looking for + submission requirements",
      "estimated_payout": "$X-$Y range or 'varies'"
    }
  ],
  "market_insights": "Brief market observations relevant to Simon's positioning",
  "recommended_actions": ["Specific next steps Simon should take"]
}`,
    options: { timeoutSeconds: 180, thinking: 'medium', sessionId: 'sync-licensing' },
    _tier: 'medium',
  };
}

/**
 * Execute a greenlit proposal in the sandbox.
 * Dispatches to Pi2 to clone the repo, create a branch, implement the change, test, and report.
 * @param {object} proposal - The proposal to execute
 * @param {object} project - Project config from projects.json
 * @returns {object} Task for dispatch()
 */
export function sandboxExecuteTask(proposal, project) {
  const sandboxDir = `/home/simonoto/sandbox/${proposal.domain}`;
  const repoClause = project?.repo
    ? `Clone or update the repo:
  cd /home/simonoto/sandbox
  if [ -d "${proposal.domain}" ]; then
    cd ${proposal.domain} && git fetch origin && git checkout ${project.branch || 'main'} && git pull
  else
    git clone ${project.repo} ${proposal.domain} && cd ${proposal.domain}
  fi
  git checkout -b sandbox/proposal-${proposal.id}`
    : `The project has no git repo. Work in /home/simonoto/sandbox/${proposal.domain}/ — create it if needed.`;

  const testClause = project?.testCmd
    ? `Run the test suite: ${project.testCmd}
If tests fail, try to fix them. Report test results.`
    : 'No test suite configured. Verify your changes manually by reviewing them.';

  const buildClause = project?.buildCmd
    ? `Run the build: ${project.buildCmd}
Report whether it succeeds.`
    : '';

  return {
    action: 'sandbox',
    domain: proposal.domain,
    agentName: 'agent:sandbox-executor',
    message: `You are a sandbox executor for Team Simonoto. Your job is to implement a proposal in an isolated sandbox environment and report the results.

PROPOSAL #${proposal.id}: ${proposal.title}
Domain: ${proposal.domain}
Effort: ${proposal.effort}
Description: ${proposal.body}

INSTRUCTIONS:
1. ${repoClause}

2. Implement the changes described in the proposal. Be precise and minimal — do exactly what the proposal says, nothing more.

3. ${testClause}

4. ${buildClause}

5. Create a summary of what you did.

Respond with a JSON object:
{
  "proposalId": ${proposal.id},
  "status": "success|partial|failed",
  "branch": "sandbox/proposal-${proposal.id}",
  "filesChanged": ["path/to/file1", "path/to/file2"],
  "testsPassed": true|false|null,
  "buildPassed": true|false|null,
  "summary": "What you did and any issues encountered",
  "diff": "Brief description of key changes"
}`,
    options: { timeoutSeconds: 300, thinking: 'medium' },
  };
}

/**
 * Run an overnight scan cycle — health check + analysis + draft proposals.
 * @param {string} domain - Project domain key
 * @returns {object} Task for dispatch()
 */
export function overnightScanTask(domain) {
  const projects = loadProjects();
  const project = projects[domain];
  return {
    action: 'scan',
    domain,
    agentName: 'agent:overnight-scan',
    message: `You are an overnight operations agent for Team Simonoto. Run a comprehensive check on "${project?.name || domain}".

Project: ${project?.name || domain}
URLs: ${JSON.stringify(project?.urls || [])}
Type: ${project?.type || 'unknown'}

Check for:
1. Any issues you can identify from the project description
2. Opportunities for improvement
3. Maintenance tasks that might be needed
4. Deprecation risks — if the project has a "deploy" config with "deprecationRisk": true, check whether the auth method (e.g. FIREBASE_TOKEN) has been removed or broken in the latest version of the deploy tool (e.g. firebase-tools). Flag this as HIGH PRIORITY if the deprecation has become a breaking change.
${project?.deploy ? `\nDEPLOY CONFIG: ${JSON.stringify(project.deploy)}\nThis project uses ${project.deploy.auth} for deployment auth. Firebase has warned this will be removed in a future major version. Monitor firebase-tools releases for breaking changes.` : ''}

Respond with a JSON object: {"status": "ok|needs-attention", "findings": ["..."], "proposals": [{"title": "...", "body": "...", "effort": "small|medium|large", "recommendation": "greenlight|research-more|shelve"}]}`,
    options: { timeoutSeconds: 120, thinking: 'medium' },
  };
}
