import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowed } from './allowlist.js';

describe('allowlist module', () => {

  describe('sleep mode', () => {
    const sleepAllowed = ['scan', 'research', 'draft', 'test', 'maintenance', 'analyze'];
    const sleepBlocked = ['deploy', 'message', 'spend', 'notify', 'commit', 'push', 'release'];

    for (const action of sleepAllowed) {
      it(`should allow "${action}" in sleep mode (any pace except stop)`, () => {
        assert.equal(isAllowed('sleep', action, 'full'), true);
        assert.equal(isAllowed('sleep', action, 'slow'), true);
        assert.equal(isAllowed('sleep', action, 'pause'), true);
      });
    }

    for (const action of sleepBlocked) {
      it(`should block "${action}" in sleep mode`, () => {
        assert.equal(isAllowed('sleep', action, 'full'), false);
        assert.equal(isAllowed('sleep', action, 'slow'), false);
        assert.equal(isAllowed('sleep', action, 'pause'), false);
      });
    }

    it('should block everything in sleep + stop', () => {
      for (const action of sleepAllowed) {
        assert.equal(isAllowed('sleep', action, 'stop'), false);
      }
      for (const action of sleepBlocked) {
        assert.equal(isAllowed('sleep', action, 'stop'), false);
      }
    });
  });

  describe('pause pace', () => {
    it('should allow scan in awake + pause', () => {
      assert.equal(isAllowed('awake', 'scan', 'pause'), true);
    });

    it('should block deploy in awake + pause', () => {
      assert.equal(isAllowed('awake', 'deploy', 'pause'), false);
    });

    it('should block message in awake + pause', () => {
      assert.equal(isAllowed('awake', 'message', 'pause'), false);
    });

    it('should block spend in awake + pause', () => {
      assert.equal(isAllowed('awake', 'spend', 'pause'), false);
    });

    it('should block notify in awake + pause', () => {
      assert.equal(isAllowed('awake', 'notify', 'pause'), false);
    });

    it('should block research in awake + pause', () => {
      assert.equal(isAllowed('awake', 'research', 'pause'), false);
    });

    it('should block draft in awake + pause', () => {
      assert.equal(isAllowed('awake', 'draft', 'pause'), false);
    });

    it('should block test in awake + pause', () => {
      assert.equal(isAllowed('awake', 'test', 'pause'), false);
    });
  });

  describe('stop pace', () => {
    it('should block everything in stop', () => {
      const actions = ['scan', 'research', 'draft', 'test', 'maintenance', 'analyze',
                        'deploy', 'message', 'spend', 'notify', 'commit'];
      for (const action of actions) {
        assert.equal(isAllowed('awake', action, 'stop'), false, `${action} should be blocked in stop`);
        assert.equal(isAllowed('sleep', action, 'stop'), false, `${action} should be blocked in stop+sleep`);
      }
    });
  });

  describe('awake + full pace', () => {
    it('should allow everything', () => {
      const actions = ['scan', 'research', 'draft', 'test', 'maintenance', 'analyze',
                        'deploy', 'message', 'spend', 'notify', 'commit', 'push',
                        'release', 'any-random-action'];
      for (const action of actions) {
        assert.equal(isAllowed('awake', action, 'full'), true, `${action} should be allowed in awake+full`);
      }
    });
  });

  describe('awake + slow pace', () => {
    it('should allow everything', () => {
      const actions = ['scan', 'research', 'draft', 'test', 'maintenance', 'analyze',
                        'deploy', 'message', 'spend', 'notify', 'commit'];
      for (const action of actions) {
        assert.equal(isAllowed('awake', action, 'slow'), true, `${action} should be allowed in awake+slow`);
      }
    });
  });
});
