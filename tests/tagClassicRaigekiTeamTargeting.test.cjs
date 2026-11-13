'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getDestructionModel}=require('../dist/effectModels');

const RAIGEKI='12580477';
const raigeki=getPlayableCard(RAIGEKI);
assert.ok(raigeki&&raigeki.kind==='spell','Raigeki must be an enabled Spell');
const raigekiEffect=getEffect(RAIGEKI);
assert.equal(raigekiEffect?.kind,'raigeki');
assert.deepEqual(getDestructionModel(raigekiEffect),{
  operation:'destroyMonsters',scope:'opponent',destination:'grave'
});

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const deckIds=normal.slice(0,7).map(entry=>entry.id);
function member(seat){return 'm112-seat-'+seat;}
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
  throw new Error('M112 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain Raigeki');
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function deploy(state,seat,id,{faceUp=true,position='atk'}={}){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
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
  assert.equal(cards.length,before.size,'Raigeki must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Raigeki response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

test('Raigeki destroys both opposing physical seats but preserves every monster of its own 2v2 team',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M112 Seat '+seat,
    cards:deck(seat===0?[RAIGEKI]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m112-raigeki-opposing-team-only'});
  const before=inventorySnapshot(state);
  const raigekiCard=ensureInHand(state,0,RAIGEKI);
  const ally=deploy(state,2,normal[0].id);
  const enemy=deploy(state,1,normal[1].id);
  const enemyHidden=deploy(state,3,normal[2].id,{faceUp:false,position:'def'});
  state.core.turn=3;
  assert.match(raigekiCard.uid,/^m0:/,'Raigeki must retain seat 0 physical ownership');
  assert.match(ally.uid,/^m2:/,'the protected ally must retain seat 2 physical ownership');
  assert.match(enemy.uid,/^m1:/,'the first opposing monster must retain seat 1 physical ownership');
  assert.match(enemyHidden.uid,/^m3:/,'the Set opposing monster must retain seat 3 physical ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const spell=tag.tagActions(state,member(0)).find(action=>
    action.kind==='spell'&&action.card===raigekiCard.uid
  );
  assert.ok(spell,'the active physical seat must receive the legal Raigeki activation');
  state=tag.stepTagDuel(state,member(0),spell);
  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the opposing active physical seat receives response priority');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive opposing physical seat must not receive response actions');
  state=settle(state);

  assert.equal(state.core.phase,'main');
  assert.deepEqual(state.core.players[0].monsters.map(card=>card.uid),[ally.uid],
    'Raigeki must preserve all monsters controlled by the activating team');
  assert.deepEqual(state.core.players[1].monsters,[],
    'Raigeki must destroy monsters belonging to both opposing physical seats');
  for(const card of [enemy,enemyHidden])
    assert.ok(state.core.players[1].grave.some(entry=>entry.uid===card.uid),
      'the opposing shared Graveyard must receive the destroyed monster: '+card.uid);
  assert.ok(state.core.players[0].grave.some(entry=>entry.uid===raigekiCard.uid),
    'Raigeki must resolve to its activating team Graveyard');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
