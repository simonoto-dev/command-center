import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { createServer } from './server.js';

const TEST_DB = 'test-server.db';

describe('Express API server', () => {
  let app, server, db, baseUrl;

  before(async () => {
    const result = createServer({ dbPath: TEST_DB });
    app = result.app;
    server = result.server;
    db = result.db;

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (db) db.close();
    try { unlinkSync(TEST_DB); } catch {}
    try { unlinkSync(TEST_DB + '-wal'); } catch {}
    try { unlinkSync(TEST_DB + '-shm'); } catch {}
  });

  // --- GET /health ---
  describe('GET /health', () => {
    it('should return status ok with a timestamp', async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'ok');
      assert.ok(body.timestamp, 'should have a timestamp');
    });
  });

  // --- GET /status ---
  describe('GET /status', () => {
    it('should return pace, mode, and timestamp', async () => {
      const res = await fetch(`${baseUrl}/status`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.pace, 'pause');
      assert.equal(body.mode, 'awake');
      assert.ok(body.timestamp);
    });
  });

  // --- POST /pace ---
  describe('POST /pace', () => {
    it('should set pace to full', async () => {
      const res = await fetch(`${baseUrl}/pace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pace: 'full' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.pace, 'full');
    });

    it('should reject invalid pace', async () => {
      const res = await fetch(`${baseUrl}/pace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pace: 'turbo' }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.ok(body.error, 'should have error message');
    });

    it('should reject missing pace', async () => {
      const res = await fetch(`${baseUrl}/pace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
    });

    it('should log pace change to audit', async () => {
      // Set pace to slow so we have a known audit entry
      await fetch(`${baseUrl}/pace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pace: 'slow' }),
      });
      const res = await fetch(`${baseUrl}/audit`);
      const logs = await res.json();
      const paceLog = logs.find((l) => l.action === 'set_pace' && l.detail?.includes('slow'));
      assert.ok(paceLog, 'should have an audit entry for pace change');
    });
  });

  // --- POST /mode ---
  describe('POST /mode', () => {
    it('should set mode to sleep', async () => {
      const res = await fetch(`${baseUrl}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'sleep' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.mode, 'sleep');
    });

    it('should set mode back to awake', async () => {
      const res = await fetch(`${baseUrl}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'awake' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.mode, 'awake');
    });

    it('should reject invalid mode', async () => {
      const res = await fetch(`${baseUrl}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'nap' }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.ok(body.error);
    });

    it('should reject missing mode', async () => {
      const res = await fetch(`${baseUrl}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
    });

    it('should log mode change to audit', async () => {
      await fetch(`${baseUrl}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'sleep' }),
      });
      const res = await fetch(`${baseUrl}/audit`);
      const logs = await res.json();
      const modeLog = logs.find((l) => l.action === 'set_mode' && l.detail?.includes('sleep'));
      assert.ok(modeLog, 'should have an audit entry for mode change');
      // Reset mode for subsequent tests
      await fetch(`${baseUrl}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'awake' }),
      });
    });
  });

  // --- POST /proposals and GET /proposals ---
  describe('proposals CRUD', () => {
    let createdId;

    it('POST /proposals should create a proposal', async () => {
      const res = await fetch(`${baseUrl}/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'infra',
          title: 'Upgrade Node.js',
          body: 'Upgrade to Node 22 LTS',
          effort: 'medium',
          recommendation: 'greenlit',
          source: 'agent-scout',
        }),
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.ok(body.id);
      assert.equal(body.domain, 'infra');
      assert.equal(body.title, 'Upgrade Node.js');
      assert.equal(body.status, 'pending');
      createdId = body.id;
    });

    it('POST /proposals should require domain and title', async () => {
      const res = await fetch(`${baseUrl}/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'infra' }),
      });
      assert.equal(res.status, 400);
    });

    it('GET /proposals should list proposals', async () => {
      const res = await fetch(`${baseUrl}/proposals`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body));
      assert.ok(body.length >= 1);
    });

    it('GET /proposals?status=pending should filter', async () => {
      const res = await fetch(`${baseUrl}/proposals?status=pending`);
      const body = await res.json();
      assert.ok(body.every((p) => p.status === 'pending'));
    });

    it('GET /proposals?domain=infra should filter', async () => {
      const res = await fetch(`${baseUrl}/proposals?domain=infra`);
      const body = await res.json();
      assert.ok(body.every((p) => p.domain === 'infra'));
    });

    it('GET /proposals?limit=1 should limit results', async () => {
      // Create a second proposal
      await fetch(`${baseUrl}/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'code',
          title: 'Second proposal',
          body: 'Test body',
          effort: 'low',
          recommendation: 'greenlit',
          source: 'test',
        }),
      });
      const res = await fetch(`${baseUrl}/proposals?limit=1`);
      const body = await res.json();
      assert.equal(body.length, 1);
    });

    it('POST /proposals/:id/resolve should resolve a proposal', async () => {
      const res = await fetch(`${baseUrl}/proposals/${createdId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'greenlit', note: 'Approved by human' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'greenlit');
      assert.equal(body.resolution_note, 'Approved by human');
      assert.ok(body.resolved_at);
    });

    it('POST /proposals/:id/resolve should reject invalid status', async () => {
      const res = await fetch(`${baseUrl}/proposals/${createdId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'yolo' }),
      });
      assert.equal(res.status, 400);
    });

    it('POST /proposals/:id/resolve should reject missing status', async () => {
      const res = await fetch(`${baseUrl}/proposals/${createdId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
    });

    it('POST /proposals should log to audit', async () => {
      const res = await fetch(`${baseUrl}/audit`);
      const logs = await res.json();
      const proposalLog = logs.find((l) => l.action === 'create_proposal');
      assert.ok(proposalLog, 'should have audit entry for proposal creation');
    });
  });

  // --- GET /audit ---
  describe('GET /audit', () => {
    it('should return an array of audit entries', async () => {
      const res = await fetch(`${baseUrl}/audit`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body));
      assert.ok(body.length > 0, 'should have audit entries from previous tests');
    });

    it('should respect limit query param', async () => {
      const res = await fetch(`${baseUrl}/audit?limit=2`);
      const body = await res.json();
      assert.ok(body.length <= 2);
    });
  });

  // --- POST /action/check ---
  describe('POST /action/check', () => {
    it('should allow scan in pause mode', async () => {
      // Ensure we are in awake + pause (set pace to pause first)
      await fetch(`${baseUrl}/pace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pace: 'pause' }),
      });
      const res = await fetch(`${baseUrl}/action/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan', agent: 'agent-scout', domain: 'infra' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.allowed, true);
      assert.equal(body.pace, 'pause');
      assert.equal(body.mode, 'awake');
    });

    it('should block deploy in sleep mode', async () => {
      // Switch to sleep + full
      await fetch(`${baseUrl}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'sleep' }),
      });
      await fetch(`${baseUrl}/pace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pace: 'full' }),
      });

      const res = await fetch(`${baseUrl}/action/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deploy', agent: 'agent-deploy', domain: 'infra' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.allowed, false);
      assert.equal(body.mode, 'sleep');
    });

    it('should log blocked actions to audit', async () => {
      const res = await fetch(`${baseUrl}/audit`);
      const logs = await res.json();
      const blockedLog = logs.find((l) => l.blocked === 1 && l.action === 'deploy');
      assert.ok(blockedLog, 'should have a blocked audit entry for deploy');
    });

    it('should block everything in stop pace', async () => {
      await fetch(`${baseUrl}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'awake' }),
      });
      await fetch(`${baseUrl}/pace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pace: 'stop' }),
      });

      const res = await fetch(`${baseUrl}/action/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan', agent: 'agent-scout', domain: 'infra' }),
      });
      const body = await res.json();
      assert.equal(body.allowed, false);
      assert.equal(body.pace, 'stop');
    });

    it('should require action field', async () => {
      const res = await fetch(`${baseUrl}/action/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: 'test' }),
      });
      assert.equal(res.status, 400);
    });

    // Reset pace for further tests
    it('should allow everything in awake + full', async () => {
      await fetch(`${baseUrl}/pace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pace: 'full' }),
      });
      const res = await fetch(`${baseUrl}/action/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deploy', agent: 'agent-deploy', domain: 'infra' }),
      });
      const body = await res.json();
      assert.equal(body.allowed, true);
    });
  });

  // --- GET /heartbeat ---
  describe('GET /heartbeat', () => {
    it('should return alive with pace and mode', async () => {
      const res = await fetch(`${baseUrl}/heartbeat`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.alive, true);
      assert.ok(body.pace);
      assert.ok(body.mode);
      assert.ok(body.timestamp);
    });
  });
});
