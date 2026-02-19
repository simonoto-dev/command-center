import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkUrl } from './health.js';

describe('Health scanner', () => {
  it('returns unreachable for a non-existent server', async () => {
    const result = await checkUrl('http://localhost:19999', 2000);
    assert.equal(result.status, 'unreachable');
    assert.equal(result.url, 'http://localhost:19999');
    assert.ok(result.error);
    assert.ok(result.checked_at);
    assert.equal(typeof result.response_time_ms, 'number');
  });
});
