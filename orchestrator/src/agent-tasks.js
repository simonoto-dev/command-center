import { readFileSync } from 'node:fs';

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

Respond with a JSON object: {"status": "ok|needs-attention", "findings": ["..."], "proposals": [{"title": "...", "body": "...", "effort": "small|medium|large", "recommendation": "greenlight|research-more|shelve"}]}`,
    options: { timeoutSeconds: 120, thinking: 'medium' },
  };
}
