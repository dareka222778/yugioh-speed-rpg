'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const YELLOW_LUSTER_SHIELD='04542651';
const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the fixture requires eight enabled Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

assert.equal(getPlayableCard(YELLOW_LUSTER_SHIELD)?.englishName,'Yellow Luster Shield');
assert.equal(getEffect(YELLOW_LUSTER_SHIELD)?.kind,'continuous');
assert.deepEqual(getEffect(YELLOW_LUSTER_SHIELD)?.rules,[{
  kind:'modifier',filter:{controller:'source'},atk:0,def:300
}]);

const member=seat=>'m216-seat-'+seat;
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M216 Seat '+seat,
    cards:deck([YELLOW_LUSTER_SHIELD])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m216-yellow-luster-shield-team-defense'});
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
  throw new Error('M216 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Continuous Spell response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
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
  assert.equal(cards.length,before.size,'Yellow Luster Shield must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Yellow Luster Shield must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Yellow Luster Shield increases DEF of both allied physical seats on the shared field and excludes both opponents',()=>{
  let state=game();
  const before=inventorySnapshot(state);
  const spell=takeCard(state,0,YELLOW_LUSTER_SHIELD);
  const activeAlly=deploy(state,0,normalIds[0]);
  const partnerAlly=deploy(state,2,normalIds[1]);
  const opponent=deploy(state,1,normalIds[2]);
  assert.equal(state.core.players[0].monsters.length,2,'the allied team uses only two of its three Monster Zones');
  assert.equal(state.core.players[1].monsters.length,1,'the opposing team uses one of its three Monster Zones');
  assert.match(spell.uid,/^m0:/,'the Continuous Spell retains active seat 0 physical ownership');
  assert.match(partnerAlly.uid,/^m2:/,'the partner monster retains seat 2 physical ownership');

  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===spell.uid
  );
  assert.ok(action,'the active seat must receive the real Yellow Luster Shield activation action');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical partner cannot activate a Spell from the active teammate hand');
  state=settle(tag.stepTagDuel(state,member(0),action));

  const liveSpell=state.core.players[0].backrow.find(card=>card.uid===spell.uid);
  assert.ok(liveSpell,'Yellow Luster Shield must remain face-up in the allied shared backrow');
  const liveActive=state.core.players[0].monsters.find(card=>card.uid===activeAlly.uid);
  const livePartner=state.core.players[0].monsters.find(card=>card.uid===partnerAlly.uid);
  const liveOpponent=state.core.players[1].monsters.find(card=>card.uid===opponent.uid);
  assert.ok(liveActive&&livePartner&&liveOpponent);
  assert.equal(engine.def(liveActive,state.core),getPlayableCard(activeAlly.id).defense+300,
    'the active physical teammate receives exactly +300 DEF');
  assert.equal(engine.def(livePartner,state.core),getPlayableCard(partnerAlly.id).defense+300,
    'the inactive partner physical monster receives the same shared-team +300 DEF');
  assert.equal(engine.def(liveOpponent,state.core),getPlayableCard(opponent.id).defense,
    'the opposing shared field receives no Yellow Luster Shield bonus');

  tag.assertTagDuel(state);
  assertConserved(state,before);
});
