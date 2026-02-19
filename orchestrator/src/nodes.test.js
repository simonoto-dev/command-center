import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { loadNodes, checkService, checkAllNodes } from './nodes.js';

describe('loadNodes', () => {
  it('returns an object with node IDs as keys', () => {
    const nodes = loadNodes();
    assert.equal(typeof nodes, 'object');
    assert.ok('pi1' in nodes);
    assert.ok('pi2' in nodes);
    assert.ok('mac-mini' in nodes);
  });

  it('each node has required fields', () => {
    const nodes = loadNodes();
    for (const [id, node] of Object.entries(nodes)) {
      assert.ok(node.name, `${id} missing name`);
      assert.ok(node.role, `${id} missing role`);
      assert.ok(node.services, `${id} missing services`);
    }
  });

  it('each service has port and healthPath', () => {
    const nodes = loadNodes();
    for (const [id, node] of Object.entries(nodes)) {
      for (const [svcId, svc] of Object.entries(node.services)) {
        assert.equal(typeof svc.port, 'number', `${id}.${svcId} missing port`);
        assert.equal(typeof svc.healthPath, 'string', `${id}.${svcId} missing healthPath`);
      }
    }
  });
});

describe('checkService', () => {
  it('returns reachable: false for unreachable host', async () => {
    const result = await checkService('192.0.2.1', 9999, '/health', 1000);
    assert.equal(result.reachable, false);
    assert.ok(result.error);
    assert.equal(typeof result.latencyMs, 'number');
  });
});

describe('checkAllNodes', () => {
  it('returns results for every node in the registry', async () => {
    const results = await checkAllNodes();
    const nodes = loadNodes();
    for (const nodeId of Object.keys(nodes)) {
      assert.ok(nodeId in results, `missing result for ${nodeId}`);
      assert.ok('services' in results[nodeId]);
      assert.ok('name' in results[nodeId]);
      assert.ok('role' in results[nodeId]);
    }
  });

  it('marks unconfigured nodes with host-not-configured error', async () => {
    const results = await checkAllNodes();
    // pi2 and mac-mini have no host set
    if (!loadNodes()['pi2'].host && !loadNodes()['pi2'].directHost) {
      for (const svc of Object.values(results['pi2'].services)) {
        assert.equal(svc.error, 'host not configured');
      }
    }
  });
});
