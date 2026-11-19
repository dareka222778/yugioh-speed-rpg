const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-id-m384-'));
process.env.DATABASE_PATH = path.join(temp, 'isolated.sqlite');

const database = require('../dist/database');
const { deckMessage } = require('../dist/deckUI');
const { parseDeckInteractionId } = require('../dist/deckInteractionId');

const owner = 'm384-isolated-ui-owner';
database.createPlayer(owner, 'Deck interaction payload test');

test('real Deck editor payload emits only canonical IDs accepted by the strict parser', () => {
  const message = deckMessage(owner, 1);
  const components = message.components.flatMap(row => row.toJSON().components);

  assert.equal(components.length, 9);
  for (const component of components) {
    assert.ok(component.custom_id);
    assert.ok(component.custom_id.length <= 100);
    const parsed = parseDeckInteractionId(component.custom_id);
    assert.ok(parsed, component.custom_id);
    assert.equal(parsed.owner, owner);
    assert.equal(parsed.slot, 1);
    assert.ok(Number.isSafeInteger(parsed.revision));
    assert.ok(Number.isSafeInteger(parsed.page));
  }

  // The fixture has no starter choice and creates no collection rows.
  assert.equal(database.getPlayer(owner).starter_deck, null);
  assert.deepEqual(database.getCollection(owner), []);
});

after(() => {
  database.db.close();
  fs.rmSync(temp, { recursive: true, force: true });
});
