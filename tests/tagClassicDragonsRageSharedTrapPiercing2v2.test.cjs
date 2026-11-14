'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const DRAGONS_RAGE='54178050';
const BLUE_EYES='89631139';
const AXE_RAIDER='48305365';
const CELTIC_GUARDIAN='91152256';

assert.equal(getPlayableCard(DRAGONS_RAGE)?.kind,'trap');
assert.equal(getEffect(DRAGONS_RAGE)?.kind,'continuous');
assert.equal(getEffect(DRAGONS_RAGE)?.activation?.speed,2);
assert.equal(getEffect(DRAGONS_RAGE)?.rules[0]?.kind,'combat');
assert.equal(getEffect(DRAGONS_RAGE)?.rules[0]?.filter?.controller,'source');
assert.deepEqual(getEffect(DRAGONS_RAGE)?.rules[0]?.filter?.races,['Dragon']);
assert.equal(getEffect(DRAGONS_RAGE)?.rules[0]?.rule?.kind,'piercing');
assert.equal(getPlayableCard(BLUE_EYES)?.race,'Dragon');
assert.equal(getPlayableCard(BLUE_EYES)?.atk,3000);
assert.equal(getPlayableCard(AXE_RAIDER)?.race,'Warrior');
assert.equal(getPlayableCard(AXE_RAIDER)?.atk,1700);
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.defense,1200);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the Dragon Rage fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm191-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M191 Seat '+seat,
    cards:deck([DRAGONS_RAGE,BLUE_EYES,AXE_RAIDER,CELTIC_GUARDIAN])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m191-dragons-rage-shared-trap'});
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
  throw new Error('M191 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position='atk'){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp:true,
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
  assert.equal(cards.length,before.size,'Dragon Rage must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Dragon Rage must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function pass(state,seat){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='pass');
  assert.ok(action,'the current physical responder must receive a pass action');
  return tag.stepTagDuel(state,member(seat),action);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<30,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    state=pass(state,Number(actor.slice('m191-seat-'.length)));
  }
  return state;
}
function endTurn(state,seat){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='end');
  assert.ok(action,'the active physical seat must be able to end its turn');
  return settle(tag.stepTagDuel(state,member(seat),action));
}
function startBattle(state,seat){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active teammate must be able to enter the Battle Phase');
  return settle(tag.stepTagDuel(state,member(seat),action));
}
function declareAttack(state,seat,attacker,target){
  const action=tag.tagActions(state,member(seat)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===target.uid
  );
  assert.ok(action,'the active teammate must receive the partner-owned shared attack');
  return tag.stepTagDuel(state,member(seat),action);
}

test('Dragon\\'s Rage can be activated by the new active teammate and grants piercing only to Dragons',()=>{
  let state=game();
  const before=inventorySnapshot(state);
  const trap=takeCard(state,0,DRAGONS_RAGE);
  holder(state,0).hand.push(trap);
  const dragon=deploy(state,2,BLUE_EYES,'atk');
  const warrior=deploy(state,0,AXE_RAIDER,'atk');
  const firstTarget=deploy(state,3,CELTIC_GUARDIAN,'def');
  const secondTarget=deploy(state,1,CELTIC_GUARDIAN,'def');
  assert.match(trap.uid,/^m0:/,'Dragon\\'s Rage retains physical owner seat 0');
  assert.match(dragon.uid,/^m2:/,'Blue-Eyes retains inactive partner physical owner seat 2');
  assert.match(warrior.uid,/^m0:/,'Axe Raider retains active teammate physical owner seat 0');

  const setAction=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='set'&&candidate.card===trap.uid
  );
  assert.ok(setAction,'the active physical owner can set Dragon\\'s Rage from their own hand');
  state=settle(tag.stepTagDuel(state,member(0),setAction));
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===trap.uid&&!card.faceUp),
    'Dragon\\'s Rage remains set in the shared team backrow');

  state=endTurn(state,0);
  assert.equal(tag.tagDecisionMember(state).id,member(1),'team 1 receives its active physical seat');
  state=endTurn(state,1);
  assert.equal(tag.tagDecisionMember(state).id,member(2),
    'the next turn returns to team 0 with its partner as the active physical seat');
  assert.ok(state.core.turn>state.core.players[0].backrow.find(card=>card.uid===trap.uid).setTurn,
    'the shared Trap has waited through the full turn before activation');

  state=startBattle(state,2);
  state=declareAttack(state,2,dragon,firstTarget);
  assert.equal(state.core.phase,'response','the attack declaration opens the response window');
  state=pass(state,1);
  const activation=tag.tagActions(state,member(2)).find(candidate=>
    candidate.kind==='trap'&&candidate.card===trap.uid
  );
  assert.ok(activation,
    'the new active teammate can activate the partner-owned set Trap from the shared backrow');
  state=tag.stepTagDuel(state,member(2),activation);
  state=settle(state);
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===trap.uid&&card.faceUp),
    'Dragon\\'s Rage resolves face-up in the shared backrow');

  assert.equal(state.core.players[1].lp,4000-1800,
    'Blue-Eyes receives Dragon piercing and deals 3000 ATK minus 1200 DEF to the opposing shared team');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===firstTarget.uid&&card.id===CELTIC_GUARDIAN),
    'the first Defense Position target is destroyed by battle');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===dragon.uid),
    'the partner-owned Dragon remains on the shared field');

  const secondAttack=tag.tagActions(state,member(2)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===warrior.uid&&candidate.target===secondTarget.uid
  );
  assert.ok(secondAttack,'the active teammate can attack with the non-Dragon control monster');
  state=settle(tag.stepTagDuel(state,member(2),secondAttack));
  assert.equal(state.core.players[1].lp,2200,
    'Dragon\\'s Rage must not grant piercing to the Warrior; the second Defense Position battle deals no damage');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===secondTarget.uid&&card.id===CELTIC_GUARDIAN),
    'the Warrior still destroys the second Defense Position target normally');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===warrior.uid),
    'the non-Dragon attacker remains on the shared field');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
