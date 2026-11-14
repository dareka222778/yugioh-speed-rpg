'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const CYCLON_LASER='05494820';
const CELTIC_GUARDIAN='91152256';
const GRADIUS=[...new Set(tag.tagNormalCardIds)]
  .find(id=>getPlayableCard(id)?.englishName==='Gradius');

assert.ok(GRADIUS,'the certified Normal Monster catalogue must include Gradius');
assert.equal(getPlayableCard(GRADIUS)?.race,'Machine');
assert.equal(getPlayableCard(GRADIUS)?.atk,1200);
assert.equal(getPlayableCard(CYCLON_LASER)?.kind,'spell');
assert.equal(getEffect(CYCLON_LASER)?.kind,'equip');
assert.deepEqual(getEffect(CYCLON_LASER)?.names,['Gradius']);
assert.equal(getEffect(CYCLON_LASER)?.atk,300);
assert.ok(getEffect(CYCLON_LASER)?.combat?.some(rule=>rule.kind==='piercing'));
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.defense,1200);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the Cyclon Laser fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm192-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M192 Seat '+seat,
    cards:deck([CYCLON_LASER,GRADIUS,CELTIC_GUARDIAN])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m192-cyclon-laser-gradius'});
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
  throw new Error('M192 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'Cyclon Laser must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Cyclon Laser must not duplicate UIDs');
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
function startBattle(state){
  const action=tag.tagActions(state,member(0)).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active teammate must be able to enter the Battle Phase');
  return settle(tag.stepTagDuel(state,member(0),action));
}
function attack(state,attacker,target){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===target.uid
  );
  assert.ok(action,'the active teammate must receive the partner-owned Gradius attack');
  const unchanged=JSON.stringify(state);
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical Gradius owner cannot submit the attack');
  assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo/);
  assert.equal(JSON.stringify(state),unchanged,'a rejected partner action must not mutate the duel');
  return settle(tag.stepTagDuel(state,member(0),action));
}

test('Cyclon Laser equips partner-owned Gradius, adds 300 ATK and grants piercing on the shared field',()=>{
  let state=game();
  const before=inventorySnapshot(state);
  const gradius=deploy(state,2,GRADIUS,'atk');
  const target=deploy(state,3,CELTIC_GUARDIAN,'def');
  assert.match(gradius.uid,/^m2:/,'Gradius retains inactive teammate physical ownership');
  assert.match(target.uid,/^m3:/,'the Defense Position target retains opposing teammate physical ownership');
  const equipCard=takeCard(state,0,CYCLON_LASER);
  holder(state,0).hand.push(equipCard);
  assert.match(equipCard.uid,/^m0:/,'Cyclon Laser retains active physical seat 0 ownership');

  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===equipCard.uid&&candidate.target===gradius.uid
  );
  assert.ok(action,'the active teammate can equip its own Cyclon Laser to the partner-owned Gradius');
  state=settle(tag.stepTagDuel(state,member(0),action));
  const equipped=state.core.players[0].backrow.find(card=>card.uid===equipCard.uid);
  assert.ok(equipped&&equipped.faceUp,'Cyclon Laser resolves face-up in the shared team backrow');
  assert.equal(equipped.equippedTo,gradius.uid,'the Equip Spell remains bound to the physical Gradius UID');
  const liveGradius=state.core.players[0].monsters.find(card=>card.uid===gradius.uid);
  assert.equal(engine.atk(liveGradius,state.core),1500,'Cyclon Laser adds exactly 300 ATK to Gradius');

  state=startBattle(state);
  state=attack(state,liveGradius,target);
  assert.equal(state.core.players[1].lp,4000-300,
    '1500 ATK minus 1200 DEF is dealt as piercing damage to the opposing shared team');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===target.uid&&card.id===CELTIC_GUARDIAN),
    'the Defense Position target is destroyed by battle');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===gradius.uid),
    'the equipped partner-owned Gradius survives the winning battle');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
