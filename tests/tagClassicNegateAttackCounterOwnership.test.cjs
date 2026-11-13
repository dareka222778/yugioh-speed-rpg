'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const NEGATE_ATTACK='14315573';
const SAKURETSU_ARMOR='56120475';
const negateAttack=getPlayableCard(NEGATE_ATTACK);
const sakuretsu=getPlayableCard(SAKURETSU_ARMOR);
assert.ok(negateAttack&&negateAttack.kind==='trap','Negate Attack must be an enabled Trap');
assert.ok(sakuretsu&&sakuretsu.kind==='trap','Sakuretsu Armor must be an enabled Trap');
const counter=getEffect(NEGATE_ATTACK);
assert.equal(counter?.kind,'attackResponse');
assert.equal(counter?.activation?.speed,3);
assert.equal(counter?.activation?.window,'attackDeclared');
assert.equal(counter?.activation?.opponentOnly,true);
assert.equal(counter?.endBattle,true);
assert.equal(counter?.reflectAttack,false);
assert.equal(getEffect(SAKURETSU_ARMOR)?.kind,'sakuretsuArmor');
assert.equal(getEffect(SAKURETSU_ARMOR)?.activation?.speed,2);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk));
assert.ok(normal.length>=7,'the Negate Attack fixture needs seven certified Normal Monsters');
const attackerEntry=normal.reduce((best,current)=>current.card.atk>best.card.atk?current:best);
const deckIds=[...new Set([attackerEntry.id,...normal.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckIds.length,7);

function member(seat){return 'm108-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckIds])];
  assert.ok(ids.length>=7);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
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
  throw new Error('M108 fixture card missing from physical seat '+seat+': '+id);
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'the four physical 20-card decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'physical UIDs must be unique before the attack');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'the response chain must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'the response chain must not duplicate physical UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function setup(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M108 Seat '+seat,
    cards:deck(seat===2?[SAKURETSU_ARMOR]:seat===3?[NEGATE_ATTACK]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m108-negate-attack-counter-speed'});
  const before=inventorySnapshot(state);
  const attackerCard=takeCard(state,0,attackerEntry.id);
  const attacker={...attackerCard,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  const sakuretsuCard=takeCard(state,2,SAKURETSU_ARMOR);
  const sakuretsuTrap={...sakuretsuCard,setTurn:0,faceUp:false};
  const negateCard=takeCard(state,3,NEGATE_ATTACK);
  const negateTrap={...negateCard,setTurn:0,faceUp:false};
  state.core.players[0].monsters.push(attacker);
  state.core.players[0].backrow.push(sakuretsuTrap);
  state.core.players[1].backrow.push(negateTrap);
  state.core.turn=3;
  assert.match(attacker.uid,/^m0:/);
  assert.match(sakuretsuTrap.uid,/^m2:/,'the ordinary Trap must retain inactive seat 2 ownership');
  assert.match(negateTrap.uid,/^m3:/,'Negate Attack must retain inactive seat 3 ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,before,attacker,sakuretsuTrap,negateTrap};
}
function declareDirectAttack(state,attacker){
  const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
  assert.ok(battle,'the active attacking seat must enter the Battle Phase');
  state=settle(tag.stepTagDuel(state,member(0),battle));
  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===undefined
  );
  assert.ok(attack,'the active teammate must be able to declare the direct attack');
  return tag.stepTagDuel(state,member(0),attack);
}

test('inactive teammate-owned Negate Attack ends the Battle Phase and blocks ordinary Trap chaining',()=>{
  const {state:initial,before,attacker,sakuretsuTrap,negateTrap}=setup();
  const publicBefore=tag.publicTagDuel(initial);
  for(const hidden of [NEGATE_ATTACK,SAKURETSU_ARMOR,negateTrap.uid,sakuretsuTrap.uid]){
    assert.ok(!JSON.stringify(publicBefore).includes(hidden),
      'set Trap identity/UID must remain hidden before activation: '+hidden);
  }

  let state=declareDirectAttack(initial,attacker);
  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the active physical defender owns response priority');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive physical owner of Negate Attack must not receive response actions');
  const response=tag.tagActions(state,member(1)).find(action=>
    action.kind==='trap'&&action.card===negateTrap.uid&&action.target===attacker.uid
  );
  assert.ok(response,'the active teammate must activate the inactive partner set Counter Trap');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(3),response),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'the inactive Counter Trap owner must not mutate the response chain');

  state=tag.stepTagDuel(state,member(1),response);
  assert.equal(state.core.phase,'response','the Counter Trap must open its own Spell Speed 3 response priority');
  assert.equal(tag.tagDecisionMember(state).id,member(0),
    'the opposing active physical seat receives the next response priority');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical owner of Sakuretsu Armor must not receive counter-chain actions');
  assert.ok(!tag.tagActions(state,member(0)).some(action=>
    action.kind==='trap'&&action.card===sakuretsuTrap.uid
  ),'an ordinary Spell Speed 2 Trap must not chain to Negate Attack');

  state=settle(state);
  assert.equal(state.core.phase,'main',
    'Negate Attack must cancel the attack and end the Battle Phase');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===attacker.uid),
    'Negate Attack must not destroy the attacking monster');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===negateTrap.uid),
    'the activated Counter Trap must move to the shared defending-team Graveyard');
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===sakuretsuTrap.uid&&!card.faceUp),
    'the ordinary Trap must remain set because it cannot chain to a Counter Trap');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
