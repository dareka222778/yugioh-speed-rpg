const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  DECK_INTERACTION_ACTIONS,
  buildDeckInteractionId,
  parseDeckInteractionId
} = require('../dist/deckInteractionId');

test('every supported action round-trips through the canonical custom ID', () => {
  for (const action of DECK_INTERACTION_ACTIONS) {
    const value = buildDeckInteractionId(action, 'discord-user_123', 2, 17, 0, '89631139');
    assert.ok(value.length <= 100);
    assert.deepEqual(parseDeckInteractionId(value), {
      action,
      owner: 'discord-user_123',
      slot: 2,
      revision: 17,
      page: 0,
      cardId: '89631139'
    });
  }
});

test('empty card selection and zero-based page are valid for navigation', () => {
  const value = buildDeckInteractionId('view', 'discord-user_123', 1, 0, 0);
  assert.deepEqual(parseDeckInteractionId(value), {
    action: 'view',
    owner: 'discord-user_123',
    slot: 1,
    revision: 0,
    page: 0,
    cardId: ''
  });
});

test('parser rejects malformed, ambiguous, and non-canonical values', () => {
  const invalid = [
    null,
    undefined,
    17,
    '',
    'duel:view:discord-user_123:1:0:1:',
    'deck:view:discord-user_123:1:0:1',
    'deck:view:discord-user_123:1:0:1::extra',
    'deck:unknown:discord-user_123:1:0:1:',
    'deck:view::1:0:1:',
    'deck:view:discord-user_123:01:0:1:',
    'deck:view:discord-user_123:+1:0:1:',
    'deck:view:discord-user_123:4:0:1:',
    'deck:view:discord-user_123:1:-1:1:',
    'deck:view:discord-user_123:1:9007199254740992:1:',
    'deck:view:discord-user_123:1:0:-1:',
    'deck:view:discord-user_123:1:0:1:89631139:tail',
    'deck:view:discord user:1:0:1:',
    'deck:view:discord:user:1:0:1:',
    'x'.repeat(101)
  ];

  for (const value of invalid) {
    assert.equal(parseDeckInteractionId(value), null, String(value));
  }
});

test('builder rejects invalid action, owner, slot, revision, page, and card token', () => {
  const valid = {
    action: 'view',
    owner: 'discord-user_123',
    slot: 1,
    revision: 0,
    page: 0,
    cardId: ''
  };

  const invalid = [
    { action: 'unknown' },
    { owner: '' },
    { owner: 'owner:forged' },
    { owner: 'owner with spaces' },
    { slot: 0 },
    { slot: 4 },
    { slot: 1.5 },
    { revision: -1 },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { page: -1 },
    { page: 1.5 },
    { cardId: 'id:forged' },
    { cardId: 'card id' },
    { cardId: null }
  ];

  for (const patch of invalid) {
    assert.throws(() => buildDeckInteractionId(
      patch.action ?? valid.action,
      patch.owner ?? valid.owner,
      patch.slot ?? valid.slot,
      patch.revision ?? valid.revision,
      patch.page ?? valid.page,
      patch.cardId ?? valid.cardId
    ));
  }
});

test('builder rejects non-string owner and card values with a domain error', () => {
  assert.throws(
    () => buildDeckInteractionId('view', undefined, 1, 0, 0, ''),
    /Identificador/
  );
  assert.throws(
    () => buildDeckInteractionId('view', 'discord-user_123', 1, 0, 0, null),
    /Identificador/
  );
});

test('builder refuses IDs that exceed Discord 100-character limit', () => {
  assert.throws(
    () => buildDeckInteractionId('view', 'o'.repeat(64), 1, Number.MAX_SAFE_INTEGER, 0, 'c'.repeat(20)),
    /100 caracteres/
  );
});

test('parser returns no partial object when a segment is invalid', () => {
  const valid = buildDeckInteractionId('card', 'discord-user_123', 3, 42, 4, '89631139');
  const invalid = valid.replace(':42:', ':042:');
  assert.equal(parseDeckInteractionId(invalid), null);
});
