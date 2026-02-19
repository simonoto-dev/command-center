import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHealthTask, researchTask, draftProposalTask, overnightScanTask } from './agent-tasks.js';

describe('Agent task templates', () => {
  it('analyzeHealthTask returns valid task shape', () => {
    const task = analyzeHealthTask('glory-jams', [{ url: 'https://gloryjams.com', status: 'ok' }]);
    assert.equal(task.action, 'analyze');
    assert.equal(task.domain, 'glory-jams');
    assert.ok(task.message.includes('Glory Jams'));
    assert.ok(task.agentName);
    assert.ok(task.options.timeoutSeconds);
  });

  it('researchTask returns valid task shape', () => {
    const task = researchTask('career', 'sync licensing platforms', 'Looking for indie-friendly options');
    assert.equal(task.action, 'research');
    assert.equal(task.domain, 'career');
    assert.ok(task.message.includes('sync licensing'));
    assert.ok(task.message.includes('indie-friendly'));
  });

  it('draftProposalTask returns valid task shape', () => {
    const task = draftProposalTask('glory-jams', 'Traffic spike from Portland');
    assert.equal(task.action, 'draft');
    assert.equal(task.domain, 'glory-jams');
    assert.ok(task.message.includes('Portland'));
  });

  it('overnightScanTask returns valid task shape', () => {
    const task = overnightScanTask('the-familiar');
    assert.equal(task.action, 'scan');
    assert.equal(task.domain, 'the-familiar');
    assert.ok(task.message.includes('The Familiar'));
  });

  it('researchTask without context omits context line', () => {
    const task = researchTask('career', 'test topic');
    assert.ok(!task.message.includes('Context:'));
  });
});
