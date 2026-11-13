'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const MIRROR_FORCE='44095762';
const mirror=getPlayableCard(MIRROR_FORCE);
assert.ok(mirror&&mirror.kind==='trap');
assert.equal(getEffect(MIRROR_FORCE)?.kind,'mirrorForce');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7);
const attackerEntry=normal.reduce((best,current)=>current.card.atk>best.card.atk?current:best);
const defenderEntry=normal.filter(entry=>entry.id!==attackerEntry.id)
  .reduce((best,current)=>current.card.defense>best.card.defense?current:best);
const deckBase=[...new Set([attackerEntry.id,defenderEntry.id,...normal.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckBase.length,7);

function member(seat){return 'm103-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckBase])];
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
  throw new Error('M103 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'the four physical 20-card decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique before battle');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Mirror Force response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current active physical seat must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

test('Mirror Force set by inactive seat 3 destroys every opposing Attack Position monster on the shared 2v2 field',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M103 Seat '+seat,
    cards:deck(seat===3?[MIRROR_FORCE]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m103-mirror-force-shared-field'});
  const before=inventorySnapshot(state);

  const attackerOne=deploy(state,0,attackerEntry.id,'atk');
  const attackerTwo=deploy(state,2,attackerEntry.id,'atk');
  const allyDefense=deploy(state,2,defenderEntry.id,'def');
  const defender=deploy(state,1,defenderEntry.id,'def');
  const defenderAllyAttack=deploy(state,3,attackerEntry.id,'atk');
  const mirrorCard=takeCard(state,3,MIRROR_FORCE);
  const mirrorTrap={...mirrorCard,setTurn:0,faceUp:false};
  state.core.players[1].backrow.push(mirrorTrap);
  state.core.turn=3;

  assert.match(attackerOne.uid,/^m0:/);
  assert.match(attackerTwo.uid,/^m2:/);
  assert.match(allyDefense.uid,/^m2:/);
  assert.match(defender.uid,/^m1:/);
  assert.match(defenderAllyAttack.uid,/^m3:/);
  assert.match(mirrorTrap.uid,/^m3:/);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const publicBefore=tag.publicTagDuel(state);
  assert.ok(!JSON.stringify(publicBefore).includes(MIRROR_FORCE),
    'the set Mirror Force identity must remain private');
  assert.ok(!JSON.stringify(publicBefore).includes(mirrorTrap.uid),
    'the set Mirror Force physical UID must remain private');

  const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
  assert.ok(battle);
  state=settle(tag.stepTagDuel(state,member(0),battle));
  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attackerOne.uid&&action.target===defender.uid
  );
  assert.ok(attack,'the active attacker may declare an attack against the opposing Defense monster');
  state=tag.stepTagDuel(state,member(0),attack);
  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the active physical defender receives the Trap response priority');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive physical owner of Mirror Force must not receive response actions');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive attacking teammate must not receive response actions');

  const response=tag.tagActions(state,member(1)).find(action=>
    action.kind==='trap'&&action.card===mirrorTrap.uid
  );
  assert.ok(response,'the active defender can activate the inactive partner set Mirror Force');
  state=settle(tag.stepTagDuel(state,member(1),response));

  assert.deepEqual(state.core.players[0].monsters.map(card=>card.uid),[allyDefense.uid],
    'Mirror Force destroys both team Attack Position monsters but preserves its Defense Position ally');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===attackerOne.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===attackerTwo.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===defender.uid),
    'the opposing Defense Position target is not destroyed');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===defenderAllyAttack.uid),
    'Mirror Force does not destroy the controller team own Attack Position monster');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===mirrorTrap.uid));
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
