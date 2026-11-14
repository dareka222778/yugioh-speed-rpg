'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const MAHA_VAILO='93013676';
const BOOK_OF_SECRET_ARTS='91595718';

assert.equal(getPlayableCard(MAHA_VAILO)?.englishName,'Maha Vailo');
assert.equal(getPlayableCard(MAHA_VAILO)?.atk,1550);
assert.equal(getPlayableCard(MAHA_VAILO)?.defense,1400);
assert.equal(getEffect(BOOK_OF_SECRET_ARTS)?.kind,'equip');
assert.equal(getEffect(BOOK_OF_SECRET_ARTS)?.races[0],'Spellcaster');
assert.equal(getEffect(BOOK_OF_SECRET_ARTS)?.atk,300);
assert.equal(getEffect(BOOK_OF_SECRET_ARTS)?.def,300);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the Maha Vailo fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm188-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M188 Seat '+seat,
    cards:deck([MAHA_VAILO,BOOK_OF_SECRET_ARTS])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m188-maha-vailo-cross-team-equips'});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  return state;
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function takeCard(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M188 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'all physical UIDs must be unique');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Maha Vailo equips must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Maha Vailo equips must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Equip Spell response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function equip(state,actorSeat,spell,monster){
  const action=tag.tagActions(state,member(actorSeat)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===spell.uid&&candidate.target===monster.uid
  );
  assert.ok(action,'the active player must receive the Equip Spell action for the eligible shared-field monster');
  const inactive=actorSeat===0?2:3;
  assert.deepEqual(tag.tagActions(state,member(inactive)),[],
    'the inactive physical partner cannot execute the Equip Spell action');
  return settle(tag.stepTagDuel(state,member(actorSeat),action));
}
function endTurn(state,seat){
  assert.equal(tag.tagDecisionMember(state).id,member(seat));
  return tag.stepTagDuel(state,member(seat),{kind:'end'});
}

test('Maha Vailo counts Equip Spells attached by both teams, including an opponent-owned Equip Spell',()=>{
  let state=game();
  const before=inventorySnapshot(state);
  const maha=deploy(state,2,MAHA_VAILO);
  assert.match(maha.uid,/^m2:/,'Maha Vailo must retain inactive teammate physical ownership');
  const ownEquip=takeCard(state,0,BOOK_OF_SECRET_ARTS);
  holder(state,0).hand.push(ownEquip);
  const opponentEquip=takeCard(state,1,BOOK_OF_SECRET_ARTS);
  holder(state,1).hand.push(opponentEquip);
  assert.match(ownEquip.uid,/^m0:/,'the first Equip Spell must retain seat 0 physical ownership');
  assert.match(opponentEquip.uid,/^m1:/,'the second Equip Spell must retain opposing seat 1 physical ownership');

  state=equip(state,0,ownEquip,maha);
  const firstAttached=state.core.players[0].backrow.find(card=>card.uid===ownEquip.uid);
  assert.ok(firstAttached);
  assert.equal(firstAttached.equippedTo,maha.uid);
  assert.equal(engine.atk(state.core.players[0].monsters.find(card=>card.uid===maha.uid),state.core),2350,
    'one Book of Secret Arts gives +300 and Maha Vailo gives +500 for one Equip Spell');

  state=endTurn(state,0);
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the opposing team must receive its own active physical seat after the turn changes');
  state=equip(state,1,opponentEquip,maha);
  const secondAttached=state.core.players[1].backrow.find(card=>card.uid===opponentEquip.uid);
  assert.ok(secondAttached,'the opponent-owned Equip Spell remains in its physical controller backrow');
  assert.equal(secondAttached.equippedTo,maha.uid,
    'an Equip Spell may attach to an eligible monster on the opposing shared field');

  const liveMaha=state.core.players[0].monsters.find(card=>card.uid===maha.uid);
  assert.ok(liveMaha,'Maha Vailo remains on its original team shared field');
  assert.equal(engine.atk(liveMaha,state.core),3150,
    'Maha Vailo counts both team-owned Equip Spells: 1550 + 600 Book bonuses + 1000 count bonus');
  assert.equal(engine.def(liveMaha,state.core),2000,
    'both Book of Secret Arts cards contribute their DEF bonus to the equipped Spellcaster');
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===ownEquip.uid&&card.equippedTo===maha.uid));
  assert.ok(state.core.players[1].backrow.some(card=>card.uid===opponentEquip.uid&&card.equippedTo===maha.uid));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
