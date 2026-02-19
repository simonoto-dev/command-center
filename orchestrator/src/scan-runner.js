import { readFileSync } from 'node:fs';
import { checkUrl } from './scanners/health.js';
import { getPace, getMode } from './pace.js';
import { isAllowed } from './allowlist.js';
import { logAction } from './audit.js';

export async function runHealthScan(db) {
  const pace = getPace(db);
  const mode = getMode(db);

  if (!isAllowed(mode, 'scan', pace)) {
    logAction(db, { agent: 'scan-runner', action: 'scan', detail: 'Blocked by allowlist', blocked: true });
    return [];
  }

  const projects = JSON.parse(readFileSync(new URL('../projects.json', import.meta.url), 'utf-8'));
  const results = [];

  for (const [domain, project] of Object.entries(projects)) {
    for (const url of project.urls) {
      const result = await checkUrl(url);
      results.push({ domain, ...result });

      db.prepare(`
        INSERT INTO scan_results (scanner, domain, finding, severity)
        VALUES (?, ?, ?, ?)
      `).run('health', domain, JSON.stringify(result), result.status === 'ok' ? 'info' : 'warning');

      logAction(db, {
        agent: 'scan:health',
        action: 'scan',
        domain,
        detail: `${url} — ${result.status} (${result.http_status || result.error})`
      });
    }
  }

  return results;
}
