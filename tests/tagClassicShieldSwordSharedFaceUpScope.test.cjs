'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const SHIELD_SWORD='52097679';
assert.ok(getPlayableCard(SHIELD_SWORD)?.kind==='spell','Shield & Sword must be an enabled Spell');
assert.equal(getEffect(SHIELD_SWORD)?.kind,'shieldSword');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const deckIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm123-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckIds])];
  assert.ok(ids.length>=7);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain Shield & Sword');
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function takeCard(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M123 monster missing from physical seat '+seat+': '+id);
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80);
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Shield & Sword must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function deploy(state,seat,id,{faceUp=true,position='atk'}={}){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}

test('Shield & Sword affects face-up monsters across both shared 2v2 fields, not Set monsters',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M123 Seat '+seat,
    cards:deck(seat===0?[SHIELD_SWORD]:[])
  }));
  const initial=tag.createTagDuel(players,{classic:true,first:0,seed:'m123-shield-sword-shared-faceup-scope'});
  const spell=ensureInHand(initial,0,SHIELD_SWORD);
  const monsters=[
    deploy(initial,0,normal[0].id),
    deploy(initial,1,normal[1].id),
    deploy(initial,2,normal[2].id),
    deploy(initial,3,normal[3].id,{faceUp:false,position:'def'})
  ];
  initial.core.turn=3;
  const before=inventorySnapshot(initial);
  assert.match(spell.uid,/^m0:/);
  assert.deepEqual(monsters.map(card=>card.uid.slice(0,3)),['m0:','m1:','m2:','m3:']);
  assert.doesNotThrow(()=>tag.assertTagDuel(initial));

  const action=tag.tagActions(initial,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===spell.uid
  );
  assert.ok(action,'the active physical seat must receive the legal Shield & Sword activation');
  assert.deepEqual(tag.tagActions(initial,member(2)),[],
    'the inactive physical teammate cannot execute the Main Phase action');
  let state=tag.stepTagDuel(initial,member(0),action);
  assert.equal(state.core.phase,'main','Shield & Sword resolves immediately without a legal response');
  for(const card of monsters.slice(0,3)){
    const found=state.core.players[card.owner].monsters.find(monster=>monster.uid===card.uid);
    assert.ok(found,'face-up monster remains on its original team field: '+card.uid);
    assert.equal(found.swappedUntil,3,
      'every face-up monster on either shared field receives the temporary ATK/DEF swap');
    assert.equal(found.owner,card.owner,'the effect must not change physical ownership');
  }
  const setMonster=state.core.players[1].monsters.find(monster=>monster.uid===monsters[3].uid);
  assert.ok(setMonster,'the Set monster remains on the opposing field');
  assert.equal(setMonster.swappedUntil,undefined,
    'a Set monster is not affected by Shield & Sword');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid),
    'Shield & Sword enters the activating team Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const end=tag.tagActions(state,member(0)).find(candidate=>candidate.kind==='end');
  assert.ok(end,'the active physical seat must be able to end the turn');
  state=tag.stepTagDuel(state,member(0),end);
  assert.equal(state.core.turn,4,'the next turn begins after the temporary effect window');
  for(const card of monsters.slice(0,3)){
    const found=state.core.players[card.owner].monsters.find(monster=>monster.uid===card.uid);
    assert.ok(found);
    assert.equal(found.swappedUntil,3,'the old turn marker remains inert after turn 3 ends');
    assert.notEqual(found.swappedUntil,state.core.turn,
      'the ATK/DEF swap no longer applies once the turn advances');
  }
  const stillSet=state.core.players[1].monsters.find(monster=>monster.uid===monsters[3].uid);
  assert.ok(stillSet);
  assert.equal(stillSet.swappedUntil,undefined);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
