import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { createDb } from './db.js';
import { analyzeHealthTask, researchTask, draftProposalTask, overnightScanTask, careerResearchTask, strategySynthesisTask, contentDraftTask } from './agent-tasks.js';

const TEST_DB = 'test-agent-tasks.db';

describe('Agent task templates', () => {
  let db;

  before(() => {
    db = createDb(TEST_DB);
  });

  after(() => {
    if (db) db.close();
    try { unlinkSync(TEST_DB); } catch {}
    try { unlinkSync(TEST_DB + '-wal'); } catch {}
    try { unlinkSync(TEST_DB + '-shm'); } catch {}
  });

  it('analyzeHealthTask returns valid task shape', () => {
    const task = analyzeHealthTask('simonoto-com', [{ url: 'https://simonoto.com', status: 'ok' }]);
    assert.equal(task.action, 'analyze');
    assert.equal(task.domain, 'simonoto-com');
    assert.ok(task.message.includes('Simonoto.com'));
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
    const task = draftProposalTask('simonoto-com', 'Traffic spike from Portland');
    assert.equal(task.action, 'draft');
    assert.equal(task.domain, 'simonoto-com');
    assert.ok(task.message.includes('Portland'));
  });

  it('overnightScanTask returns valid task shape', () => {
    const task = overnightScanTask('eeveelution');
    assert.equal(task.action, 'scan');
    assert.equal(task.domain, 'eeveelution');
    assert.ok(task.message.includes('Eeveelution'));
  });

  it('researchTask without context omits context line', () => {
    const task = researchTask('career', 'test topic');
    assert.ok(!task.message.includes('Context:'));
  });

  it('careerResearchTask uses session continuity', () => {
    const task = careerResearchTask(db);
    assert.equal(task.action, 'research');
    assert.equal(task.domain, 'career');
    assert.ok(task.options.sessionId, 'should have a sessionId for continuity');
    assert.ok(task.options.sessionId.startsWith('career-'), 'sessionId should be topic-scoped');
    assert.ok(task._topicId, 'should expose _topicId');
    assert.ok(task._category, 'should expose _category');
  });

  it('strategySynthesisTask returns valid task shape', async () => {
    const task = await strategySynthesisTask(db);
    assert.equal(task.action, 'research');
    assert.equal(task.domain, 'career');
    assert.equal(task.agentName, 'agent:strategy-synthesizer');
    assert.ok(task.message.includes('strategy memo'));
    assert.ok(task.message.includes('priorities'));
    assert.equal(task.options.sessionId, 'strategy-weekly');
  });

  it('contentDraftTask returns valid task shape with default platform', async () => {
    const task = await contentDraftTask(db);
    assert.equal(task.action, 'draft');
    assert.equal(task.domain, 'content');
    assert.equal(task.agentName, 'agent:content-drafter');
    assert.ok(task.message.includes('general'));
    assert.ok(task.message.includes('social media'));
  });

  it('contentDraftTask respects platform parameter', async () => {
    const task = await contentDraftTask(db, 'instagram');
    assert.ok(task.message.includes('instagram'));
    assert.ok(task.message.includes('Optimize for instagram'));
  });
});
