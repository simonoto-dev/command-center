import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NODES_PATH = resolve(__dirname, '..', 'nodes.json');

/**
 * Load the node registry from nodes.json.
 * @returns {Record<string, object>} Map of nodeId → node config
 */
export function loadNodes() {
  return JSON.parse(readFileSync(NODES_PATH, 'utf8'));
}

/**
 * Check the health of a single service on a node.
 * @param {string} host - Hostname or IP
 * @param {number} port - Port number
 * @param {string} healthPath - Health endpoint path
 * @param {number} [timeoutMs=5000] - Request timeout
 * @returns {Promise<{reachable: boolean, latencyMs: number, error: string|null}>}
 */
export async function checkService(host, port, healthPath, timeoutMs = 5000) {
  const url = `http://${host}:${port}${healthPath}`;
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    return { reachable: res.ok, latencyMs, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { reachable: false, latencyMs: Date.now() - start, error: err.message };
  }
}

/**
 * Check the health of all services on all nodes.
 * @returns {Promise<Record<string, {name: string, role: string, services: Record<string, object>}>>}
 */
export async function checkAllNodes() {
  const nodes = loadNodes();
  const results = {};

  const checks = [];
  for (const [nodeId, node] of Object.entries(nodes)) {
    const host = node.host || node.directHost;
    results[nodeId] = { name: node.name, role: node.role, host, services: {} };

    if (!host) {
      // Node not yet configured — mark all services as unknown
      for (const svcId of Object.keys(node.services || {})) {
        results[nodeId].services[svcId] = { reachable: false, latencyMs: 0, error: 'host not configured' };
      }
      continue;
    }

    for (const [svcId, svc] of Object.entries(node.services || {})) {
      checks.push(
        checkService(host, svc.port, svc.healthPath).then((result) => {
          results[nodeId].services[svcId] = result;
        }),
      );
    }
  }

  await Promise.all(checks);
  return results;
}
