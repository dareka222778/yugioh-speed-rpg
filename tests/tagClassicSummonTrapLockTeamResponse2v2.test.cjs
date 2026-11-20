const {test} = require('node:test');
const assert = require('node:assert/strict');
const {tag,createGame,addToHand,setBackrow,act,passAll} = require('./helpers/tagClassic2v2.cjs');

test('Eagle Eye suppresses the summon response window for both teams, including partner-set Traps', () => {
  let control = createGame(0, 'm418-summon-control');
  control.core.turn = 3;
  const ordinary = addToHand(control, 0, tag.tagNormalCardIds[0], 'ordinary-monster');
  const controlHole = setBackrow(control, 3, '04206964', 'control-trap-hole');
  control = act(control, 0, 'summon', a => a.card === ordinary.uid && a.position === 'atk');
  assert.equal(control.core.phase, 'response');
  assert.ok(tag.tagActions(control, 'p1').some(a => a.kind === 'trap' && a.card === controlHole.uid));

  let s = createGame(0, 'm418-summon-lock');
  s.core.turn = 3;
  const eagle = addToHand(s, 0, '53693416', 'eagle-eye');
  const ownTorrent = setBackrow(s, 2, '53582587', 'own-torrential');
  const partnerHole = setBackrow(s, 3, '04206964', 'partner-trap-hole');
  s = act(s, 0, 'summon', a => a.card === eagle.uid && a.position === 'atk');

  assert.equal(s.core.phase, 'main', 'the lock prevents either team from opening a Trap response');
  assert.ok(s.core.players[0].monsters.some(m => m.uid === eagle.uid));
  assert.ok(s.core.players[0].backrow.some(c => c.uid === ownTorrent.uid));
  assert.ok(s.core.players[1].backrow.some(c => c.uid === partnerHole.uid));
});
