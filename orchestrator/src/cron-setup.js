/**
 * Cron management for Team Simonoto overnight operations.
 *
 * Installs/removes crontab entries that curl the orchestrator's endpoints
 * on a schedule.  The orchestrator remains the single gatekeeper — every
 * cron-triggered action flows through the allowlist, pace, and audit system.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';

const execFileAsync = promisify(execFile);

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:7070';
const CRON_TAG = '# team-simonoto-cron';

function loadProjects() {
  return JSON.parse(readFileSync(new URL('../projects.json', import.meta.url), 'utf-8'));
}

/**
 * Build crontab lines for overnight operations.
 * Runs every 2 hours — the orchestrator's allowlist handles mode/pace gating.
 */
export function buildCronLines() {
  const projects = loadProjects();
  const lines = [];

  // Health scans every 2 hours for each project
  for (const domain of Object.keys(projects)) {
    lines.push(
      `0 */2 * * * curl -sf -X POST ${ORCHESTRATOR_URL}/dispatch -H 'Content-Type: application/json' -d '{"taskType":"overnight-scan","domain":"${domain}"}' >> /tmp/simonoto-cron.log 2>&1 ${CRON_TAG}`,
    );
  }

  // Career intelligence research — rotates topics automatically
  // Runs at 1am and 4am to cover two different topics per night
  lines.push(
    `0 1 * * * curl -sf -X POST ${ORCHESTRATOR_URL}/dispatch -H 'Content-Type: application/json' -d '{"taskType":"career-research","domain":"career"}' >> /tmp/simonoto-cron.log 2>&1 ${CRON_TAG}`,
  );
  lines.push(
    `0 4 * * * curl -sf -X POST ${ORCHESTRATOR_URL}/dispatch -H 'Content-Type: application/json' -d '{"taskType":"career-research","domain":"career"}' >> /tmp/simonoto-cron.log 2>&1 ${CRON_TAG}`,
  );

  // Morning brief trigger at 7:30am (prepares brief before wake)
  lines.push(
    `30 7 * * * curl -sf ${ORCHESTRATOR_URL}/brief >> /tmp/simonoto-cron.log 2>&1 ${CRON_TAG}`,
  );

  return lines;
}

/**
 * Get current crontab, filtering out our managed lines.
 */
async function getCurrentCrontab() {
  try {
    const { stdout } = await execFileAsync('crontab', ['-l']);
    return stdout;
  } catch {
    return '';
  }
}

/**
 * Install the simonoto cron jobs into the user's crontab.
 * Replaces any existing simonoto lines.
 */
export async function installCron() {
  const current = await getCurrentCrontab();
  const existingLines = current.split('\n').filter(l => !l.includes(CRON_TAG));
  const newLines = buildCronLines();
  const combined = [...existingLines.filter(Boolean), ...newLines, ''].join('\n');

  await execFileAsync('bash', ['-c', `echo "${combined.replace(/"/g, '\\"')}" | crontab -`]);
  return { installed: newLines.length, lines: newLines };
}

/**
 * Remove all simonoto cron jobs.
 */
export async function uninstallCron() {
  const current = await getCurrentCrontab();
  const remaining = current.split('\n').filter(l => !l.includes(CRON_TAG));
  await execFileAsync('bash', ['-c', `echo "${remaining.join('\n').replace(/"/g, '\\"')}" | crontab -`]);
  return { removed: true };
}

/**
 * List currently installed simonoto cron jobs.
 */
export async function listCron() {
  const current = await getCurrentCrontab();
  const ours = current.split('\n').filter(l => l.includes(CRON_TAG));
  return { count: ours.length, jobs: ours };
}
