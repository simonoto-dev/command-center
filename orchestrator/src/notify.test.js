import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sendNotification } from './notify.js';

describe('Notify module', () => {
  it('exports sendNotification function', () => {
    assert.equal(typeof sendNotification, 'function');
  });
});
