const {test} = require('node:test');
const assert = require('node:assert/strict');
const {tag,createGame,addToHand,setBackrow,passAll} = require('./helpers/tagClassic2v2.cjs');

test('Field Zone is separate from the three shared Spell/Trap Zones', () => {
  let s = createGame(2);
  s.core.turn = 3;
  setBackrow(s, 0, '04206964', 'blue-hole-1');
  setBackrow(s, 2, '53582587', 'blue-torrent');
  setBackrow(s, 0, '77414722', 'blue-jammer');
  const field = addToHand(s, 2, '86318356', 'blue-field-spell');

  assert.equal(s.core.players[0].backrow.length, 3);
  const action = tag.tagActions(s, 'p2').find(a => (a.kind === 'field' || a.kind === 'setField') && a.card === field.uid);
  assert.ok(action, 'the active teammate can still use the separate Field Zone');
  s = tag.stepTagDuel(s, 'p2', action);
  s = passAll(s);

  assert.equal(s.core.players[0].field.uid, field.uid);
  assert.equal(s.core.players[0].backrow.length, 3);
});
