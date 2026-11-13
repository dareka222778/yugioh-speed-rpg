'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const BLOCK_ATTACK='25880422';
assert.ok(getPlayableCard(BLOCK_ATTACK)?.kind==='spell','Block Attack must be an enabled Spell');
assert.equal(getEffect(BLOCK_ATTACK)?.kind,'blockAttack');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const deckIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm127-seat-'+seat;}
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
  assert.ok(index>=0,'the physical seat Deck must contain Block Attack');
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
  throw new Error('M127 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'Block Attack must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function deploy(state,seat,id,{faceUp=true,position='atk'}={}){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}

test('Block Attack targets only face-up Attack Position monsters across the opposing shared field',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M127 Seat '+seat,
    cards:deck(seat===0?[BLOCK_ATTACK]:[])
  }));
  const initial=tag.createTagDuel(players,{classic:true,first:0,seed:'m127-block-attack-target-scope'});
  const spell=ensureInHand(initial,0,BLOCK_ATTACK);
  const target=deploy(initial,3,normal[0].id);
  const hidden=deploy(initial,1,normal[1].id,{faceUp:false,position:'def'});
  const defense=deploy(initial,1,normal[2].id,{faceUp:true,position:'def'});
  initial.core.turn=3;
  const before=inventorySnapshot(initial);
  assert.match(spell.uid,/^m0:/);
  assert.match(target.uid,/^m3:/);
  assert.match(hidden.uid,/^m1:/);
  assert.match(defense.uid,/^m1:/);
  assert.doesNotThrow(()=>tag.assertTagDuel(initial));

  const publicBefore=tag.publicTagDuel(initial);
  assert.ok(!JSON.stringify(publicBefore).includes(hidden.id),
    'the Set monster identity must remain private in the public projection');
  assert.ok(!JSON.stringify(publicBefore).includes(hidden.uid),
    'the Set monster physical UID must remain private in the public projection');

  const actions=tag.tagActions(initial,member(0)).filter(action=>
    action.kind==='spell'&&action.card===spell.uid
  );
  assert.ok(actions.some(action=>action.target===target.uid),
    'a face-up Attack Position monster owned by inactive opponent seat 3 is a legal target');
  assert.ok(!actions.some(action=>action.target===hidden.uid),
    'a Set monster must not appear in the target menu');
  assert.ok(!actions.some(action=>action.target===defense.uid),
    'a face-up Defense Position monster must not appear in the target menu');
  const action=actions.find(candidate=>candidate.target===target.uid);
  assert.ok(action);

  const state=tag.stepTagDuel(initial,member(0),action);
  assert.equal(state.core.phase,'main');
  const changed=state.core.players[1].monsters.find(monster=>monster.uid===target.uid);
  assert.ok(changed);
  assert.equal(changed.position,'def','Block Attack changes only the selected monster to Defense Position');
  assert.equal(changed.faceUp,true);
  assert.equal(changed.owner,1,'the physical owner team remains unchanged');
  assert.equal(state.core.players[1].monsters.find(monster=>monster.uid===hidden.uid).faceUp,false);
  assert.equal(state.core.players[1].monsters.find(monster=>monster.uid===hidden.uid).position,'def');
  assert.equal(state.core.players[1].monsters.find(monster=>monster.uid===defense.uid).position,'def');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid),
    'Block Attack enters the activating team Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
