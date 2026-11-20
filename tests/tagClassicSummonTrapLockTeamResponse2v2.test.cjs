const {test} = require('node:test');
const assert = require('node:assert/strict');
const {tag,createGame,addToHand,setBackrow,act,actCurrent,passAll} = require('./helpers/tagClassic2v2.cjs');

test('Eagle Eye blocks both teams from responding with Traps to its Normal Summon', () => {
  let s = createGame(0);
  s.core.turn = 3;
  const eagle = addToHand(s, 0, '53693416', 'eagle-eye');
  const ownTorrent = setBackrow(s, 2, '53582587', 'own-torrential');
  const partnerHole = setBackrow(s, 3, '04206964', 'partner-trap-hole');

  s = act(s, 0, 'summon', a => a.card === eagle.uid && a.position === 'atk');
  assert.equal(s.core.phase, 'response');
  assert.equal(tag.tagDecisionMember(s).id, 'p1');
  assert.equal(tag.tagActions(s, 'p1').some(a => a.kind === 'trap' && a.card === partnerHole.uid), false);

  s = actCurrent(s, 'pass');
  if (s.core.phase === 'response') {
    assert.equal(tag.tagDecisionMember(s).id, 'p0');
    assert.equal(tag.tagActions(s, 'p0').some(a => a.kind === 'trap' && a.card === ownTorrent.uid), false);
  }
  s = passAll(s);
  assert.ok(s.core.players[0].monsters.some(m => m.uid === eagle.uid));
  assert.ok(s.core.players[0].backrow.some(c => c.uid === ownTorrent.uid));
  assert.ok(s.core.players[1].backrow.some(c => c.uid === partnerHole.uid));
});
