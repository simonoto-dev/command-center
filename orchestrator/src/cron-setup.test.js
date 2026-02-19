import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCronLines, listCron } from './cron-setup.js';

describe('Cron setup', () => {
  it('buildCronLines returns an array of cron entries', () => {
    const lines = buildCronLines();
    assert.ok(Array.isArray(lines));
    assert.ok(lines.length >= 3); // at least: 2 project scans + 1 research + 1 brief
  });

  it('each cron line has the simonoto tag', () => {
    const lines = buildCronLines();
    for (const line of lines) {
      assert.ok(line.includes('team-simonoto-cron'), `Missing tag in: ${line}`);
    }
  });

  it('includes overnight-scan for each project', () => {
    const lines = buildCronLines();
    const scanLines = lines.filter(l => l.includes('overnight-scan'));
    assert.ok(scanLines.length >= 2); // glory-jams + the-familiar
  });

  it('includes career research job', () => {
    const lines = buildCronLines();
    const research = lines.filter(l => l.includes('research'));
    assert.ok(research.length >= 1);
  });

  it('includes morning brief trigger', () => {
    const lines = buildCronLines();
    const brief = lines.filter(l => l.includes('/brief'));
    assert.ok(brief.length >= 1);
  });

  it('listCron returns count and jobs', async () => {
    const result = await listCron();
    assert.equal(typeof result.count, 'number');
    assert.ok(Array.isArray(result.jobs));
  });
});
